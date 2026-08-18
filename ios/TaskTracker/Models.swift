import Foundation

struct Zone: Identifiable, Codable, Equatable, Hashable {
  var id: String
  var name: String
  var mode: String
}

struct Project: Identifiable, Codable, Equatable, Hashable {
  var id: String
  var name: String
  var color: String
  var createdAt: Double
  var updatedAt: Double?
  var zone: String
  var status: String
  var goal: String

  enum CodingKeys: String, CodingKey {
    case id, name, color, createdAt, updatedAt, zone, status, goal
  }

  init(id: String, name: String, color: String, createdAt: Double, updatedAt: Double?, zone: String, status: String, goal: String) {
    self.id = id
    self.name = name
    self.color = color
    self.createdAt = createdAt
    self.updatedAt = updatedAt
    self.zone = zone
    self.status = status
    self.goal = goal
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    name = (try c.decodeIfPresent(String.self, forKey: .name)) ?? L10n.t("project")
    color = (try c.decodeIfPresent(String.self, forKey: .color)) ?? "#0a84ff"
    createdAt = (try c.decodeIfPresent(Double.self, forKey: .createdAt)) ?? 0
    updatedAt = try c.decodeIfPresent(Double.self, forKey: .updatedAt)
    zone = (try c.decodeIfPresent(String.self, forKey: .zone)) ?? "life"
    status = (try c.decodeIfPresent(String.self, forKey: .status)) ?? "active"
    goal = (try c.decodeIfPresent(String.self, forKey: .goal)) ?? ""
  }

  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(id, forKey: .id)
    try c.encode(name, forKey: .name)
    try c.encode(color, forKey: .color)
    try c.encode(createdAt, forKey: .createdAt)
    try c.encodeIfPresent(updatedAt, forKey: .updatedAt)
    try c.encode(zone, forKey: .zone)
    try c.encode(status, forKey: .status)
    try c.encode(goal, forKey: .goal)
  }
}

struct TaskItem: Identifiable, Codable, Equatable, Hashable {
  var id: String
  var title: String
  var note: String
  var done: Bool
  var due: String?
  var projectId: String?
  var createdAt: Double
  var updatedAt: Double
  var completedAt: Double?
  var order: Double
  var next: Bool
  var later: Bool
  var laterUntil: String?
  var repeatRule: String?

  enum CodingKeys: String, CodingKey {
    case id, title, note, done, due, projectId, createdAt, updatedAt, completedAt, order, next, later, laterUntil
    case repeatRule = "repeat"
  }

  init(id: String, title: String, note: String, done: Bool, due: String?, projectId: String?, createdAt: Double, updatedAt: Double, completedAt: Double?, order: Double, next: Bool, later: Bool, laterUntil: String?, repeatRule: String?) {
    self.id = id
    self.title = title
    self.note = note
    self.done = done
    self.due = due
    self.projectId = projectId
    self.createdAt = createdAt
    self.updatedAt = updatedAt
    self.completedAt = completedAt
    self.order = order
    self.next = next
    self.later = later
    self.laterUntil = laterUntil
    self.repeatRule = repeatRule
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    title = (try c.decodeIfPresent(String.self, forKey: .title)) ?? L10n.t("untitled")
    note = (try c.decodeIfPresent(String.self, forKey: .note)) ?? ""
    done = (try c.decodeIfPresent(Bool.self, forKey: .done)) ?? false
    due = try c.decodeIfPresent(String.self, forKey: .due)
    projectId = try c.decodeIfPresent(String.self, forKey: .projectId)
    createdAt = (try c.decodeIfPresent(Double.self, forKey: .createdAt)) ?? 0
    updatedAt = (try c.decodeIfPresent(Double.self, forKey: .updatedAt)) ?? createdAt
    completedAt = try c.decodeIfPresent(Double.self, forKey: .completedAt)
    order = (try c.decodeIfPresent(Double.self, forKey: .order)) ?? 0
    next = (try c.decodeIfPresent(Bool.self, forKey: .next)) ?? false
    later = (try c.decodeIfPresent(Bool.self, forKey: .later)) ?? false
    laterUntil = try c.decodeIfPresent(String.self, forKey: .laterUntil)
    repeatRule = try c.decodeIfPresent(String.self, forKey: .repeatRule)
  }

  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(id, forKey: .id)
    try c.encode(title, forKey: .title)
    try c.encode(note, forKey: .note)
    try c.encode(done, forKey: .done)
    try c.encodeIfPresent(due, forKey: .due)
    try c.encodeIfPresent(projectId, forKey: .projectId)
    try c.encode(createdAt, forKey: .createdAt)
    try c.encode(updatedAt, forKey: .updatedAt)
    try c.encodeIfPresent(completedAt, forKey: .completedAt)
    try c.encode(order, forKey: .order)
    try c.encode(next, forKey: .next)
    try c.encode(later, forKey: .later)
    try c.encodeIfPresent(laterUntil, forKey: .laterUntil)
    try c.encodeIfPresent(repeatRule, forKey: .repeatRule)
  }
}

struct LastView: Codable, Equatable {
  var type: String
  var id: String?
  var date: String?
}

struct Settings: Codable, Equatable {
  var lastView: LastView
  var zones: [Zone]
  var deviceId: String?
  var locale: String?
  var updatedAt: Double?

  enum CodingKeys: String, CodingKey {
    case lastView, zones, deviceId, locale, updatedAt
  }

  init(lastView: LastView, zones: [Zone], deviceId: String?, locale: String? = "en", updatedAt: Double? = nil) {
    self.lastView = lastView
    self.zones = zones
    self.deviceId = deviceId
    self.locale = locale
    self.updatedAt = updatedAt
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    lastView = (try c.decodeIfPresent(LastView.self, forKey: .lastView)) ?? LastView(type: "today")
    zones = (try c.decodeIfPresent([Zone].self, forKey: .zones)) ?? []
    deviceId = try c.decodeIfPresent(String.self, forKey: .deviceId)
    locale = try c.decodeIfPresent(String.self, forKey: .locale)
    updatedAt = try c.decodeIfPresent(Double.self, forKey: .updatedAt)
  }

  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(lastView, forKey: .lastView)
    try c.encode(zones, forKey: .zones)
    try c.encodeIfPresent(deviceId, forKey: .deviceId)
    try c.encodeIfPresent(locale, forKey: .locale)
    try c.encodeIfPresent(updatedAt, forKey: .updatedAt)
  }
}

struct Store: Codable, Equatable {
  var schemaVersion: Int
  var projects: [Project]
  var tasks: [TaskItem]
  var settings: Settings
}

enum AppView: Equatable, Hashable {
  case today, inbox, upcoming, all, archive, project(String)

  var type: String {
    switch self {
    case .today: "today"
    case .inbox: "inbox"
    case .upcoming: "upcoming"
    case .all: "all"
    case .archive: "archive"
    case .project: "project"
    }
  }
}

struct TaskGroup: Identifiable {
  var id: String
  var title: String
  var tone: String
  var items: [TaskItem]
}
