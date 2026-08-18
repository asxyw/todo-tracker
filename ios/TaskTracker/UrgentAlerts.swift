import ActivityKit
import Foundation
import UserNotifications

enum UrgentAlerts {
  private static var seenRunning = Set<String>()

  static func sync(_ store: Store) {
    Task { await refresh(store) }
  }

  static func hideIsland() {
    UrgentIsland.markDismissedFromActivities()
    Task { await UrgentIsland.endAll() }
  }

  private static func refresh(_ store: Store) async {
    let center = UNUserNotificationCenter.current()
    let tasks = Domain.activeUrgent(store)
    center.removeAllPendingNotificationRequests()
    if tasks.isEmpty {
      seenRunning.removeAll()
      await UrgentIsland.endAll()
      return
    }
    if await requestPermission() {
      for task in tasks { schedule(task, on: center) }
    }
    guard let island = tasks.first(where: { $0.urgentAlert == "island" }),
          let untilMs = island.urgentUntil else {
      await UrgentIsland.endAll()
      return
    }
    let until = Date(timeIntervalSince1970: untilMs / 1000)
    let key = UrgentIsland.key(taskId: island.id, until: until)
    if UrgentIsland.dismissedKeys().contains(key) {
      await UrgentIsland.endAll()
      return
    }
    let running = Activity<UrgentAttributes>.activities.first { $0.attributes.taskId == island.id }
    if let running {
      seenRunning.insert(key)
      let state = UrgentAttributes.ContentState(title: island.title, until: until)
      await running.update(ActivityContent(state: state, staleDate: until))
      return
    }
    if seenRunning.contains(key) {
      UrgentIsland.markDismissed(key)
      return
    }
    await startIsland(task: island, until: until)
    seenRunning.insert(key)
  }

  private static func requestPermission() async -> Bool {
    let center = UNUserNotificationCenter.current()
    let settings = await center.notificationSettings()
    if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
      return true
    }
    return (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
  }

  private static func schedule(_ task: TaskItem, on center: UNUserNotificationCenter) {
    guard let untilMs = task.urgentUntil else { return }
    let until = Date(timeIntervalSince1970: untilMs / 1000)
    let fire = until.addingTimeInterval(-15 * 60)
    let content = UNMutableNotificationContent()
    content.title = "Task Tracker"
    let title = task.title.trimmingCharacters(in: .whitespacesAndNewlines)
    if fire.timeIntervalSinceNow > 3 {
      content.body = "In 15 min: \(title)"
    } else {
      content.body = "Due soon: \(title)"
    }
    content.sound = .default
    let interval = max(1, fire.timeIntervalSinceNow)
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
    center.add(UNNotificationRequest(identifier: "urgent-\(task.id)", content: content, trigger: trigger))
  }

  private static func startIsland(task: TaskItem, until: Date) async {
    let attributes = UrgentAttributes(taskId: task.id)
    let state = UrgentAttributes.ContentState(title: task.title, until: until)
    let content = ActivityContent(state: state, staleDate: until)
    if let running = Activity<UrgentAttributes>.activities.first(where: { $0.attributes.taskId == task.id }) {
      await running.update(content)
      return
    }
    await UrgentIsland.endAll()
    _ = try? Activity.request(attributes: attributes, content: content, pushType: nil)
  }
}
