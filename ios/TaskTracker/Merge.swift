import Foundation

enum StoreMerge {
  static func merge(_ local: Store, _ remote: Store) -> Store {
    var tasks: [String: TaskItem] = [:]
    for task in local.tasks + remote.tasks {
      if let existing = tasks[task.id] {
        tasks[task.id] = existing.updatedAt >= task.updatedAt ? existing : task
      } else {
        tasks[task.id] = task
      }
    }
    var projects: [String: Project] = [:]
    for project in local.projects + remote.projects {
      let stamp = project.updatedAt ?? project.createdAt
      if let existing = projects[project.id] {
        let other = existing.updatedAt ?? existing.createdAt
        projects[project.id] = other >= stamp ? existing : project
      } else {
        projects[project.id] = project
      }
    }
    let deletedTasks = mergeTaskTombs(local.deleted.tasks + remote.deleted.tasks, live: tasks)
    let deletedProjects = mergeProjectTombs(local.deleted.projects + remote.deleted.projects, live: projects)
    for tomb in deletedTasks { tasks.removeValue(forKey: tomb.id) }
    for tomb in deletedProjects { projects.removeValue(forKey: tomb.id) }
    var zones: [String: Zone] = [:]
    for zone in Domain.listZones(local) + Domain.listZones(remote) {
      if zones[zone.id] == nil { zones[zone.id] = zone }
    }
    let localStamp = local.tasks.map(\.updatedAt).max() ?? 0
    let remoteStamp = remote.tasks.map(\.updatedAt).max() ?? 0
    let localSet = local.settings.updatedAt ?? localStamp
    let remoteSet = remote.settings.updatedAt ?? remoteStamp
    let newerSettings = remoteSet > localSet ? remote.settings : local.settings
    return Store(
      schemaVersion: 8,
      projects: Array(projects.values).sorted { $0.createdAt < $1.createdAt },
      tasks: Array(tasks.values).sorted { $0.createdAt > $1.createdAt },
      settings: Settings(
        lastView: resolvedLastView(local.settings.lastView, projects: Array(projects.values)),
        zones: zones.isEmpty ? Domain.defaultZones() : Array(zones.values),
        deviceId: local.settings.deviceId ?? remote.settings.deviceId,
        locale: local.settings.locale ?? newerSettings.locale ?? remote.settings.locale ?? "en",
        updatedAt: max(localSet, remoteSet)
      ),
      deleted: Deleted(tasks: deletedTasks, projects: deletedProjects)
    )
  }

  private static func resolvedLastView(_ last: LastView, projects: [Project]) -> LastView {
    if last.type == "project" {
      if let id = last.id, projects.contains(where: { $0.id == id }) { return last }
      return LastView(type: "all")
    }
    return last
  }

  private static func mergeTaskTombs(_ rows: [DeletedEntry], live: [String: TaskItem]) -> [DeletedEntry] {
    var tombs: [String: DeletedEntry] = [:]
    for row in rows {
      if let existing = tombs[row.id] {
        if row.deletedAt >= existing.deletedAt { tombs[row.id] = row }
      } else {
        tombs[row.id] = row
      }
    }
    for (id, tomb) in tombs {
      if let task = live[id], task.updatedAt > tomb.deletedAt {
        tombs.removeValue(forKey: id)
      }
    }
    return Array(tombs.values).sorted { $0.deletedAt > $1.deletedAt }
  }

  private static func mergeProjectTombs(_ rows: [DeletedEntry], live: [String: Project]) -> [DeletedEntry] {
    var tombs: [String: DeletedEntry] = [:]
    for row in rows {
      if let existing = tombs[row.id] {
        if row.deletedAt >= existing.deletedAt { tombs[row.id] = row }
      } else {
        tombs[row.id] = row
      }
    }
    for (id, tomb) in tombs {
      if let project = live[id], (project.updatedAt ?? project.createdAt) > tomb.deletedAt {
        tombs.removeValue(forKey: id)
      }
    }
    return Array(tombs.values).sorted { $0.deletedAt > $1.deletedAt }
  }
}
