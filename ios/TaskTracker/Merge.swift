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
      schemaVersion: 6,
      projects: Array(projects.values).sorted { $0.createdAt < $1.createdAt },
      tasks: Array(tasks.values).sorted { $0.createdAt > $1.createdAt },
      settings: Settings(
        lastView: newerSettings.lastView,
        zones: zones.isEmpty ? Domain.defaultZones() : Array(zones.values),
        deviceId: local.settings.deviceId ?? remote.settings.deviceId,
        locale: newerSettings.locale ?? local.settings.locale ?? remote.settings.locale ?? "en",
        updatedAt: max(localSet, remoteSet)
      )
    )
  }
}
