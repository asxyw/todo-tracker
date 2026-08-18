import Foundation
import SwiftUI

@Observable
final class AppModel {
  var store: Store
  var view: AppView = .today
  var query = ""
  var pendingNext: String?
  var toast: String?
  var syncStatus = L10n.t("local")
  var draft = ""
  var chipDue: String? = Dates.todayIso()
  var upcomingDate = Dates.tomorrowIso()
  var weekAnchor = Dates.startOfWeek(Date())
  var editingTask: TaskItem?
  var locale: String { store.settings.locale == "ru" ? "ru" : "en" }

  @ObservationIgnored private var sync: LanSync?
  @ObservationIgnored private var toastStamp: Date?

  init() {
    let loaded = StoreFile.load()
    store = Domain.ensureDeviceId(loaded)
    L10n.set(store.settings.locale)
    syncStatus = L10n.t("local")
    StoreFile.save(store)
    startSync()
  }

  var groups: [TaskGroup] {
    let tasks = Selectors.visibleTasks(store, view: view, query: query, upcomingDate: upcomingDate)
    return Selectors.groupTasks(store, view: view, tasks: tasks, query: query)
  }

  var header: (kicker: String, title: String) { Selectors.header(store, view: view, upcomingDate: upcomingDate) }
  var counts: (inbox: Int, today: Int, upcoming: Int, all: Int) { Selectors.smartCounts(store) }
  var empty: (String, String) {
    Selectors.emptyCopy(view, searching: !query.trimmingCharacters(in: .whitespaces).isEmpty)
  }

  func commit(_ next: Store) {
    var store = next
    store.settings.updatedAt = Domain.now()
    if store.settings.locale == nil { store.settings.locale = L10n.code }
    self.store = store
    StoreFile.save(store)
    sync?.push(store)
  }

  func setLocale(_ code: String) {
    L10n.set(code)
    var next = store
    next.settings.locale = L10n.code
    commit(next)
  }

  func syncChipsToView() {
    switch view {
    case .today: chipDue = Dates.todayIso()
    case .inbox: chipDue = nil
    case .upcoming: chipDue = upcomingDate
    default: chipDue = nil
    }
  }

  func ensureUpcomingDate() {
    if upcomingDate <= Dates.todayIso() { upcomingDate = Dates.tomorrowIso() }
    weekAnchor = Dates.startOfWeek(Dates.parseIso(upcomingDate))
    chipDue = upcomingDate
  }

  func selectDay(_ iso: String) {
    if iso == Dates.todayIso() {
      view = .today
      chipDue = iso
      weekAnchor = Dates.startOfWeek(Date())
      return
    }
    view = .upcoming
    upcomingDate = iso
    weekAnchor = Dates.startOfWeek(Dates.parseIso(iso))
    chipDue = iso
  }

  func shiftWeek(_ days: Int) {
    weekAnchor = Dates.shiftDays(weekAnchor, by: days)
  }

  func setDue(_ id: String, due: String?) {
    if let due {
      commit(Domain.patchTask(store, id: id, patch: TaskPatch(due: due)))
    } else {
      commit(Domain.patchTask(store, id: id, patch: TaskPatch(clearDue: true)))
    }
  }

  func addDraft() {
    let parsed = ParseTitle.parse(draft)
    let due: String?
    if let parsedDue = parsed.due { due = parsedDue }
    else { due = chipDue }
    let projectId: String? = {
      if case .project(let id) = view { return id }
      return nil
    }()
    var nextDue = due
    if view == .today, parsed.due == nil, chipDue == nil { nextDue = nil }
    if view == .inbox, parsed.due == nil, chipDue == nil { nextDue = nil }
    let next = Domain.createTask(store, title: parsed.title, due: nextDue, projectId: projectId)
    if next == store { return }
    draft = ""
    commit(next)
  }

  func complete(_ id: String) {
    guard let task = store.tasks.first(where: { $0.id == id }) else { return }
    commit(Domain.completeAndRepeat(store, id: id))
    if !task.done, task.next, let projectId = task.projectId {
      let project = store.projects.first { $0.id == projectId }
      if Domain.isFocusProject(store, project), project?.status == "active",
         Selectors.nextStep(store, projectId: projectId) == nil {
        pendingNext = projectId
      }
    }
    flash(task.done ? L10n.t("restored") : L10n.t("completed"))
  }

  func later(_ id: String) {
    commit(Domain.setLaterTask(store, id: id))
  }

  func pinNext(_ id: String) {
    commit(Domain.setNextTask(store, id: id))
    pendingNext = nil
  }

  func remove(_ id: String) {
    commit(Domain.deleteTask(store, id: id))
    flash(L10n.t("deleted"))
  }

  func pickNext(_ id: String) {
    commit(Domain.setNextTask(store, id: id))
    pendingNext = nil
  }

  func addNextFromPrompt(_ title: String) {
    guard let projectId = pendingNext else { return }
    let parsed = ParseTitle.parse(title)
    let next = Domain.createTask(store, title: parsed.title, due: nil, projectId: projectId, asNext: true)
    if next != store {
      pendingNext = nil
      commit(next)
    }
  }

  func skipNext() { pendingNext = nil }

  func restoreProject(_ id: String) {
    commit(Domain.patchProject(store, id: id, status: "active"))
    flash(L10n.t("restoredArchive"))
  }

  func flash(_ text: String) {
    toast = text
    toastStamp = Date()
    let stamp = toastStamp
    DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) {
      if self.toastStamp == stamp { self.toast = nil }
    }
  }

  func pingNetwork() {
    sync?.push(store)
  }

  func resync() {
    sync?.refresh(store)
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { [weak self] in
      guard let self else { return }
      let waiting = [L10n.t("waitingMac"), L10n.t("lookingMac"), L10n.t("local")].contains(self.syncStatus)
      self.flash(waiting ? L10n.t("macMissing") : L10n.t("syncedMac"))
    }
  }

  private func startSync() {
    let id = store.settings.deviceId ?? Domain.uid()
    let lan = LanSync(deviceId: id)
    lan.onRemote = { [weak self] remote in
      guard let self else { return remote }
      let merged = StoreMerge.merge(self.store, remote)
      self.store = merged
      L10n.set(merged.settings.locale)
      StoreFile.save(merged)
      return merged
    }
    lan.onStatus = { [weak self] text in
      DispatchQueue.main.async { self?.syncStatus = text }
    }
    lan.start()
    sync = lan
  }
}
