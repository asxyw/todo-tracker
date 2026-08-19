import ActivityKit
import Foundation
import UserNotifications

enum UrgentAlerts {
  static var foreground = true
  private static let notifiedDefaults = "urgentNotifiedKeys"
  private static let lateIslandSeconds: TimeInterval = 5 * 60

  static func sync(_ store: Store) {
    Task { await refresh(store) }
  }

  static func syncIslandWhenReady(_ store: Store) {
    Task {
      try? await Task.sleep(nanoseconds: 350_000_000)
      await refresh(store)
    }
  }

  static func hideIsland() {
    UrgentIsland.markDismissedFromActivities()
    Task { await UrgentIsland.endAll() }
  }

  static func markDelivered(_ identifier: String) {
    guard identifier.hasPrefix("urgent-") else { return }
    var keys = notifiedKeys()
    keys.insert(identifier)
    UserDefaults.standard.set(Array(keys), forKey: notifiedDefaults)
  }

  private static func notifiedKeys() -> Set<String> {
    Set(UserDefaults.standard.stringArray(forKey: notifiedDefaults) ?? [])
  }

  private static func noteId(_ task: TaskItem) -> String? {
    guard let until = task.urgentUntil else { return nil }
    return "urgent-\(task.id)-\(Int(until))"
  }

  private static func refresh(_ store: Store) async {
    let center = UNUserNotificationCenter.current()
    let tasks = Domain.activeUrgent(store)
    let liveIds = Set(tasks.compactMap(noteId))
    let kept = notifiedKeys().intersection(liveIds)
    UserDefaults.standard.set(Array(kept), forKey: notifiedDefaults)

    let pending = await center.pendingNotificationRequests()
    let pendingIds = Set(pending.map(\.identifier))
    let stale = pending.map(\.identifier).filter { $0.hasPrefix("urgent-") && !liveIds.contains($0) }
    if !stale.isEmpty {
      center.removePendingNotificationRequests(withIdentifiers: stale)
    }
    let delivered = await center.deliveredNotifications()
    for item in delivered where item.request.identifier.hasPrefix("urgent-") {
      markDelivered(item.request.identifier)
    }

    if tasks.isEmpty {
      await UrgentIsland.endAll()
      return
    }
    if await requestPermission() {
      let skip = notifiedKeys().union(pendingIds)
      for task in tasks {
        guard let id = noteId(task), !skip.contains(id) else { continue }
        schedule(task, id: id, on: center)
      }
    }
    guard let task = tasks.first(where: shouldShowIsland),
          let untilMs = task.urgentUntil else {
      await UrgentIsland.endAll()
      return
    }
    let until = Date(timeIntervalSince1970: untilMs / 1000)
    let key = UrgentIsland.key(taskId: task.id, until: until)
    if UrgentIsland.dismissedKeys().contains(key) {
      await UrgentIsland.endAll()
      return
    }
    let running = Activity<UrgentAttributes>.activities.first { $0.attributes.taskId == task.id }
    if let running {
      let state = UrgentAttributes.ContentState(title: task.title, until: until)
      await running.update(ActivityContent(state: state, staleDate: until))
      return
    }
    await startIsland(task: task, until: until)
  }

  private static func shouldShowIsland(_ task: TaskItem) -> Bool {
    guard let untilMs = task.urgentUntil else { return false }
    let left = Date(timeIntervalSince1970: untilMs / 1000).timeIntervalSinceNow
    guard left > 0 else { return false }
    if task.urgentAlert == "island" { return true }
    return left <= lateIslandSeconds
  }

  private static func requestPermission() async -> Bool {
    let center = UNUserNotificationCenter.current()
    let settings = await center.notificationSettings()
    if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
      return true
    }
    return (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
  }

  private static func schedule(_ task: TaskItem, id: String, on center: UNUserNotificationCenter) {
    guard let untilMs = task.urgentUntil else { return }
    let until = Date(timeIntervalSince1970: untilMs / 1000)
    let fire = until.addingTimeInterval(-15 * 60)
    let title = task.title.trimmingCharacters(in: .whitespacesAndNewlines)
    if fire.timeIntervalSinceNow <= 3 {
      markDelivered(id)
      if foreground { return }
    }
    let content = UNMutableNotificationContent()
    content.title = "Task Tracker"
    content.body = fire.timeIntervalSinceNow > 3 ? "In 15 min: \(title)" : "Due soon: \(title)"
    content.sound = .default
    content.userInfo = ["urgent": true, "taskId": task.id]
    let interval = max(1, fire.timeIntervalSinceNow)
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
    center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
  }

  @MainActor
  private static func startIsland(task: TaskItem, until: Date) async {
    let attributes = UrgentAttributes(taskId: task.id)
    let state = UrgentAttributes.ContentState(title: task.title, until: until)
    let content = ActivityContent(state: state, staleDate: until)
    if let running = Activity<UrgentAttributes>.activities.first(where: { $0.attributes.taskId == task.id }) {
      await running.update(content)
      return
    }
    await UrgentIsland.endAll()
    do {
      _ = try Activity.request(attributes: attributes, content: content, pushType: nil)
    } catch {
      print("[task-tracker] live activity", error)
    }
  }
}
