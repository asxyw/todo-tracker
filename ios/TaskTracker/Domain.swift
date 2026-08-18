import Foundation

enum Domain {
  static let colors = ["#0a84ff", "#30d158", "#ff9f0a", "#ff453a", "#bf5af2", "#64d2ff", "#ffd60a", "#ff375f"]
  static let repeatDays: [String: Int] = ["1d": 1, "7d": 7, "1m": 30]

  static func defaultZones() -> [Zone] {
    [
      Zone(id: "life", name: L10n.t("zoneLife"), mode: "dates"),
      Zone(id: "dev", name: L10n.t("zoneDev"), mode: "focus"),
    ]
  }

  static func emptyStore() -> Store {
    Store(
      schemaVersion: 8,
      projects: [],
      tasks: [],
      settings: Settings(lastView: LastView(type: "today"), zones: defaultZones(), deviceId: uid()),
      deleted: .empty
    )
  }

  static func uid() -> String {
    String(Int(Date().timeIntervalSince1970 * 1000), radix: 36) + "-" + String(UUID().uuidString.prefix(6)).lowercased()
  }

  static func now() -> Double { Date().timeIntervalSince1970 * 1000 }

  static func listZones(_ store: Store) -> [Zone] {
    store.settings.zones.isEmpty ? defaultZones() : store.settings.zones
  }

  static func zoneById(_ store: Store, _ id: String?) -> Zone? {
    guard let id else { return nil }
    return listZones(store).first { $0.id == id }
  }

  static func isFocusProject(_ store: Store, _ project: Project?) -> Bool {
    guard let project else { return false }
    return zoneById(store, project.zone)?.mode == "focus"
  }

  static func migrate(_ raw: Store) -> Store {
    var store = raw
    if store.settings.zones.isEmpty { store.settings.zones = defaultZones() }
    if store.settings.deviceId == nil { store.settings.deviceId = uid() }
    store.schemaVersion = 8
    if store.deleted.tasks.isEmpty, store.deleted.projects.isEmpty {
      store.deleted = .empty
    }
    store.tasks = store.tasks.enumerated().map { index, task in
      var next = task
      if next.title.isEmpty { next.title = L10n.t("untitled") }
      if next.repeatRule != nil, repeatDays[next.repeatRule ?? ""] == nil { next.repeatRule = nil }
      if next.order == 0 { next.order = Double(index + 1) }
      return next
    }
    return store
  }

  static func createTask(
    _ store: Store,
    title: String,
    due: String?,
    projectId: String?,
    asNext: Bool = false,
    note: String = "",
    repeatRule: String? = nil,
    urgentUntil: Double? = nil,
    urgentAlert: String? = nil
  ) -> Store {
    let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
    if clean.isEmpty { return store }
    var next = store
    let project = projectId.flatMap { id in next.projects.contains(where: { $0.id == id }) ? id : nil }
    let focus = project != nil && isFocusProject(next, next.projects.first { $0.id == project })
    let hasNext = focus && next.tasks.contains { $0.projectId == project && $0.next && !$0.done }
    let pin = focus && (asNext || !hasNext)
    if pin && asNext {
      next.tasks = next.tasks.map { task in
        var copy = task
        if copy.projectId == project { copy.next = false }
        return copy
      }
    }
    let stamp = now()
    next.tasks.insert(
      TaskItem(
        id: uid(),
        title: clean,
        note: note,
        done: false,
        due: due,
        projectId: project,
        createdAt: stamp,
        updatedAt: stamp,
        completedAt: nil,
        order: (next.tasks.map(\.order).max() ?? 0) + 1,
        next: pin,
        later: false,
        laterUntil: nil,
        repeatRule: repeatDays[repeatRule ?? ""] != nil ? repeatRule : nil,
        urgentUntil: urgentUntil,
        urgentAlert: urgentUntil != nil ? ((urgentAlert == "island" || urgentAlert == "push") ? urgentAlert : "push") : nil
      ),
      at: 0
    )
    return next
  }

  static func patchTask(_ store: Store, id: String, patch: TaskPatch) -> Store {
    var next = store
    next.tasks = next.tasks.map { task in
      guard task.id == id else { return task }
      var updated = task
      if let title = patch.title, !title.isEmpty { updated.title = title }
      if let note = patch.note { updated.note = note }
      if let due = patch.due { updated.due = due }
      if patch.clearDue { updated.due = nil }
      if let projectId = patch.projectId { updated.projectId = projectId }
      if patch.clearProject { updated.projectId = nil }
      if let later = patch.later {
        updated.later = later
        if !later { updated.laterUntil = nil }
      }
      if let laterUntil = patch.laterUntil {
        updated.laterUntil = laterUntil
        if laterUntil != nil { updated.later = true }
      }
      if let nextFlag = patch.next { updated.next = nextFlag }
      if let repeatRule = patch.repeatRule { updated.repeatRule = repeatDays[repeatRule ?? ""] != nil ? repeatRule : nil }
      if patch.clearUrgent {
        updated.urgentUntil = nil
        updated.urgentAlert = nil
      }
      if let urgentUntil = patch.urgentUntil { updated.urgentUntil = urgentUntil }
      if let urgentAlert = patch.urgentAlert { updated.urgentAlert = urgentAlert == "island" ? "island" : "push" }
      if updated.urgentUntil != nil, updated.urgentAlert == nil { updated.urgentAlert = "push" }
      if updated.urgentUntil == nil { updated.urgentAlert = nil }
      if let done = patch.done {
        updated.done = done
        updated.completedAt = done ? now() : nil
        if done {
          updated.next = false
          updated.urgentUntil = nil
          updated.urgentAlert = nil
        }
      }
      if updated.laterUntil != nil { updated.later = true }
      if updated.due != nil, patch.later == nil, patch.laterUntil == nil { updated.later = false }
      if let pid = updated.projectId, !next.projects.contains(where: { $0.id == pid }) {
        updated.projectId = nil
      }
      updated.updatedAt = now()
      return updated
    }
    return next
  }

  static func toggleTask(_ store: Store, id: String) -> Store {
    guard let task = store.tasks.first(where: { $0.id == id }) else { return store }
    return patchTask(store, id: id, patch: TaskPatch(done: !task.done))
  }

  static func completeAndRepeat(_ store: Store, id: String) -> Store {
    guard let task = store.tasks.first(where: { $0.id == id }) else { return store }
    var next = toggleTask(store, id: id)
    if task.done { return next }
    guard let rule = task.repeatRule, let days = repeatDays[rule] else { return next }
    let due = Dates.addDaysIso(task.due ?? Dates.todayIso(), days: days)
    return createTask(next, title: task.title, due: due, projectId: task.projectId, asNext: task.next, note: task.note, repeatRule: rule)
  }

  static func deleteTask(_ store: Store, id: String) -> Store {
    var next = store
    if let task = next.tasks.first(where: { $0.id == id }) {
      next.deleted.tasks.removeAll { $0.id == id }
      next.deleted.tasks.insert(DeletedEntry(id: task.id, title: task.title, deletedAt: now()), at: 0)
      if next.deleted.tasks.count > 400 { next.deleted.tasks = Array(next.deleted.tasks.prefix(400)) }
    }
    next.tasks.removeAll { $0.id == id }
    return next
  }

  static func setNextTask(_ store: Store, id: String) -> Store {
    guard let task = store.tasks.first(where: { $0.id == id }), let projectId = task.projectId else { return store }
    let on = !task.next
    var next = store
    next.tasks = next.tasks.map { row in
      guard row.projectId == projectId else { return row }
      var copy = row
      if copy.id == id {
        copy.next = on
        if on { copy.later = false }
        copy.updatedAt = now()
      } else {
        copy.next = false
      }
      return copy
    }
    return next
  }

  static func setLaterTask(_ store: Store, id: String) -> Store {
    guard let task = store.tasks.first(where: { $0.id == id }) else { return store }
    let on = !task.later
    return patchTask(store, id: id, patch: TaskPatch(later: on, next: on ? false : task.next))
  }

  static func createProject(_ store: Store, name: String, zone: String?) -> (Store, Project?) {
    let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
    if clean.isEmpty { return (store, nil) }
    var next = store
    let zones = listZones(next)
    let zoneId: String = {
      if let zone, zones.contains(where: { $0.id == zone }) { return zone }
      return zones.first?.id ?? "life"
    }()
    let project = Project(
      id: uid(),
      name: clean,
      color: colors[next.projects.count % colors.count],
      createdAt: now(),
      updatedAt: now(),
      zone: zoneId,
      status: "active",
      goal: ""
    )
    next.projects.append(project)
    return (next, project)
  }

  static func patchProject(_ store: Store, id: String, status: String? = nil, name: String? = nil) -> Store {
    var next = store
    next.projects = next.projects.map { project in
      guard project.id == id else { return project }
      var copy = project
      if let status, ["active", "paused", "done"].contains(status) { copy.status = status }
      if let name {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { copy.name = name }
      }
      copy.updatedAt = now()
      return copy
    }
    return next
  }

  static func setUrgent(_ store: Store, id: String, minutes: Double, alert: String) -> Store {
    guard let task = store.tasks.first(where: { $0.id == id }), !task.done else { return store }
    if minutes <= 0 {
      return patchTask(store, id: id, patch: TaskPatch(clearUrgent: true))
    }
    return patchTask(store, id: id, patch: TaskPatch(
      urgentUntil: now() + minutes * 60 * 1000,
      urgentAlert: alert == "island" ? "island" : "push"
    ))
  }

  static func activeUrgent(_ store: Store) -> [TaskItem] {
    let stamp = now()
    return store.tasks
      .filter { !$0.done && ($0.urgentUntil ?? 0) > stamp }
      .sorted { ($0.urgentUntil ?? 0) < ($1.urgentUntil ?? 0) }
  }

  static func ensureDeviceId(_ store: Store) -> Store {
    if store.settings.deviceId != nil { return store }
    var next = store
    next.settings.deviceId = uid()
    return next
  }
}

struct TaskPatch {
  var title: String? = nil
  var note: String? = nil
  var due: String? = nil
  var clearDue: Bool = false
  var projectId: String? = nil
  var clearProject: Bool = false
  var later: Bool? = nil
  var laterUntil: String?? = nil
  var next: Bool? = nil
  var repeatRule: String?? = nil
  var done: Bool? = nil
  var urgentUntil: Double? = nil
  var urgentAlert: String? = nil
  var clearUrgent: Bool = false
}
