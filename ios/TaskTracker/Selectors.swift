import Foundation

enum Selectors {
  static func projectById(_ store: Store, _ id: String?) -> Project? {
    guard let id else { return nil }
    return store.projects.first { $0.id == id }
  }

  static func nextStep(_ store: Store, projectId: String) -> TaskItem? {
    store.tasks.first { $0.projectId == projectId && $0.next && !$0.done }
  }

  static func projectsInZone(_ store: Store, zone: String) -> [Project] {
    let active = store.projects.filter { $0.zone == zone && $0.status == "active" }
    let paused = store.projects.filter { $0.zone == zone && $0.status == "paused" }
    return active + paused
  }

  static func archivedProjects(_ store: Store) -> [Project] {
    store.projects.filter { $0.status == "done" }
  }

  private static func projectAsleep(_ store: Store, _ task: TaskItem) -> Bool {
    guard let project = projectById(store, task.projectId) else { return false }
    return project.status != "active"
  }

  private static func sleeping(_ store: Store, _ task: TaskItem) -> Bool {
    if task.later && !task.done {
      if let until = task.laterUntil, until <= Dates.todayIso() { return projectAsleep(store, task) }
      return true
    }
    return projectAsleep(store, task)
  }

  static func isTodayTask(_ store: Store, _ task: TaskItem) -> Bool {
    let today = Dates.todayIso()
    if sleeping(store, task) && !task.done { return false }
    let project = projectById(store, task.projectId)
    let focus = Domain.isFocusProject(store, project)
    if task.done {
      guard let completed = task.completedAt else { return false }
      return Dates.iso(Date(timeIntervalSince1970: completed / 1000)) == today
    }
    if focus { return task.next }
    guard let due = task.due else { return false }
    return due <= today
  }

  static func dueDates(_ store: Store) -> Set<String> {
    Set(store.tasks.compactMap { task in
      guard !task.done, let due = task.due else { return nil }
      if projectAsleep(store, task) { return nil }
      return due
    })
  }

  static func visibleTasks(_ store: Store, view: AppView, query: String, upcomingDate: String? = nil) -> [TaskItem] {
    let today = Dates.todayIso()
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if !needle.isEmpty {
      return store.tasks.filter { task in
        let project = projectById(store, task.projectId)
        let hay = [task.title, task.note, project?.name, project?.goal]
          .compactMap { $0 }
          .joined(separator: " ")
          .lowercased()
        return hay.contains(needle)
      }
    }
    switch view {
    case .inbox:
      return store.tasks.filter { $0.projectId == nil }
    case .project(let id):
      return store.tasks.filter { $0.projectId == id }
    case .upcoming:
      return store.tasks.filter { task in
        if task.done || projectAsleep(store, task) { return false }
        if let date = upcomingDate { return task.due == date }
        return (task.due ?? "") > today
      }
    case .today:
      return store.tasks.filter { isTodayTask(store, $0) }
    case .archive:
      return []
    case .all:
      return store.tasks
    }
  }

  static func nextCandidates(_ store: Store, projectId: String) -> [TaskItem] {
    store.tasks.filter { $0.projectId == projectId && !$0.done && !$0.later }
  }

  static func focusProjectsNeedingStep(_ store: Store) -> [Project] {
    Domain.listZones(store)
      .filter { $0.mode == "focus" }
      .flatMap { projectsInZone(store, zone: $0.id) }
      .filter { $0.status == "active" && nextStep(store, projectId: $0.id) == nil }
  }

  static func smartCounts(_ store: Store) -> (inbox: Int, today: Int, upcoming: Int, all: Int) {
    let today = Dates.todayIso()
    let inbox = store.tasks.filter { !$0.done && $0.projectId == nil && !$0.later }.count
    let todayCount = store.tasks.filter { !$0.done && isTodayTask(store, $0) }.count
    let upcoming = store.tasks.filter { !$0.done && ($0.due ?? "") > today && !projectAsleep(store, $0) }.count
    let all = store.tasks.filter { !$0.done }.count
    return (inbox, todayCount, upcoming, all)
  }

  static func groupTasks(_ store: Store, view: AppView, tasks: [TaskItem], query: String) -> [TaskGroup] {
    let today = Dates.todayIso()
    var buckets: [String: TaskGroup] = [:]
    func ensure(_ key: String, title: String, tone: String = "") -> String {
      if buckets[key] == nil { buckets[key] = TaskGroup(id: key, title: title, tone: tone, items: []) }
      return key
    }
    let asAll = !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || view == .all
    for task in tasks {
      if task.done {
        let key = ensure("done", title: view == .today ? L10n.t("doneToday") : L10n.t("done"), tone: "done")
        buckets[key]?.items.append(task)
        continue
      }
      if case .project = view, query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        if task.later {
          buckets[ensure("later", title: L10n.t("notToday"))]?.items.append(task)
        } else if task.next {
          buckets[ensure("next", title: L10n.t("nextStep"), tone: "next")]?.items.append(task)
        } else if let due = task.due {
          buckets[ensure("d-\(due)", title: Dates.formatChip(due))]?.items.append(task)
        } else {
          buckets[ensure("active", title: L10n.t("further"))]?.items.append(task)
        }
        continue
      }
      if asAll {
        if task.projectId == nil {
          buckets[ensure("inbox", title: L10n.t("inbox"))]?.items.append(task)
        } else {
          let project = projectById(store, task.projectId)
          let zone = Domain.zoneById(store, project?.zone)
          let prefix = zone.map { "\($0.name) · " } ?? ""
          buckets[ensure("p-\(task.projectId ?? "")", title: "\(prefix)\(project?.name ?? L10n.t("project"))")]?.items.append(task)
        }
        continue
      }
      if view == .today {
        let project = projectById(store, task.projectId)
        if Domain.isFocusProject(store, project), let project {
          let zone = Domain.zoneById(store, project.zone)
          buckets[ensure("focus-\(project.zone)", title: zone?.name ?? L10n.t("inProgress"), tone: "dev")]?.items.append(task)
        } else if let due = task.due, due < today {
          buckets[ensure("overdue", title: L10n.t("overdue"), tone: "overdue")]?.items.append(task)
        } else {
          let zone = Domain.zoneById(store, project?.zone)
          buckets[ensure("today-\(project?.zone ?? "none")", title: zone?.name ?? L10n.t("forToday"), tone: "today")]?.items.append(task)
        }
        continue
      }
      if view == .upcoming {
        buckets[ensure("day", title: "")]?.items.append(task)
        continue
      }
      if task.later {
        buckets[ensure("later", title: L10n.t("notToday"))]?.items.append(task)
      } else if let due = task.due {
        buckets[ensure("d-\(due)", title: Dates.formatChip(due))]?.items.append(task)
      } else {
        buckets[ensure("none", title: L10n.t("noDate"))]?.items.append(task)
      }
    }
    for key in buckets.keys {
      buckets[key]?.items.sort(by: sortItems)
    }
    let order = ["next", "overdue", "today", "dev", "active", "inbox", "none", "later"]
    return buckets.values.sorted { a, b in
      if a.id == "done" { return false }
      if b.id == "done" { return true }
      if a.id == "inbox" && b.id.hasPrefix("p-") { return true }
      if b.id == "inbox" && a.id.hasPrefix("p-") { return false }
      let ai = order.firstIndex(of: a.id) ?? 50
      let bi = order.firstIndex(of: b.id) ?? 50
      if ai != 50 || bi != 50 { return ai < bi }
      return a.id < b.id
    }
  }

  private static func sortItems(_ a: TaskItem, _ b: TaskItem) -> Bool {
    if a.done != b.done { return !a.done }
    if a.next != b.next { return a.next }
    if a.order != b.order { return a.order < b.order }
    let ad = a.due ?? "9999"
    let bd = b.due ?? "9999"
    if ad != bd { return ad < bd }
    return a.createdAt > b.createdAt
  }

  static func header(_ store: Store, view: AppView, upcomingDate: String? = nil) -> (kicker: String, title: String) {
    switch view {
    case .today: return (Dates.formatLong(Date()), L10n.t("today"))
    case .inbox: return (L10n.t("inboxKicker"), L10n.t("inbox"))
    case .upcoming:
      let date = upcomingDate ?? Dates.tomorrowIso()
      return (Dates.monthYear(date), L10n.t("upcoming"))
    case .all: return (L10n.t("tracker"), L10n.t("allTasks"))
    case .archive: return (L10n.t("canRestore"), L10n.t("archive"))
    case .project(let id):
      let project = projectById(store, id)
      let zone = Domain.zoneById(store, project?.zone)
      return (zone?.name ?? L10n.t("project"), project?.name ?? L10n.t("project"))
    }
  }

  static func emptyCopy(_ view: AppView, searching: Bool) -> (String, String) {
    if searching { return (L10n.t("emptySearch0"), L10n.t("emptySearch1")) }
    switch view {
    case .today: return (L10n.t("emptyToday0"), L10n.t("emptyToday1"))
    case .inbox: return (L10n.t("emptyInbox0"), L10n.t("emptyInbox1"))
    case .upcoming: return (L10n.t("emptyUpcoming0"), L10n.t("emptyUpcoming1"))
    case .project: return (L10n.t("emptyProject0"), L10n.t("emptyProject1"))
    case .archive: return (L10n.t("emptyArchive0"), L10n.t("emptyArchive1"))
    case .all: return (L10n.t("emptyAll0"), L10n.t("emptyAll1"))
    }
  }
}
