import ActivityKit
import AppIntents
import Foundation

struct UrgentAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var title: String
    var until: Date
  }

  var taskId: String
}

enum UrgentIsland {
  static let dismissedKey = "urgentIslandDismissed"

  static func dismissedKeys() -> Set<String> {
    Set(UserDefaults.standard.stringArray(forKey: dismissedKey) ?? [])
  }

  static func key(taskId: String, until: Date) -> String {
    "\(taskId)-\(Int(until.timeIntervalSince1970))"
  }

  static func markDismissed(_ key: String) {
    var keys = dismissedKeys()
    keys.insert(key)
    UserDefaults.standard.set(Array(keys), forKey: dismissedKey)
  }

  static func markDismissedFromActivities() {
    for activity in Activity<UrgentAttributes>.activities {
      markDismissed(key(taskId: activity.attributes.taskId, until: activity.content.state.until))
    }
  }

  static func endAll() async {
    for activity in Activity<UrgentAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }
}

struct DismissUrgentIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Dismiss"
  static var description = IntentDescription("Hide the Dynamic Island countdown.")

  func perform() async throws -> some IntentResult {
    UrgentIsland.markDismissedFromActivities()
    await UrgentIsland.endAll()
    return .result()
  }
}
