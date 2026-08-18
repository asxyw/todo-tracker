import Foundation

enum Dates {
  static func weekdays() -> [String] { L10n.weekdays() }

  private static var calendar: Calendar {
    var cal = Calendar(identifier: .gregorian)
    cal.locale = Locale(identifier: L10n.tag)
    cal.timeZone = .current
    cal.firstWeekday = 2
    return cal
  }

  static func pad(_ n: Int) -> String {
    String(format: "%02d", n)
  }

  static func iso(_ date: Date) -> String {
    let p = calendar.dateParts(date)
    return "\(p.year)-\(pad(p.month))-\(pad(p.day))"
  }

  static func todayIso() -> String { iso(Date()) }

  static func parseIso(_ value: String) -> Date {
    let parts = value.split(separator: "-").compactMap { Int($0) }
    guard parts.count >= 3 else { return Date() }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) ?? Date()
  }

  static func addDaysIso(_ value: String?, days: Int) -> String {
    let base = value.map(parseIso) ?? Date()
    let next = calendar.date(byAdding: .day, value: days, to: calendar.startOfDay(for: base)) ?? base
    return iso(next)
  }

  static func formatLong(_ date: Date) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: L10n.tag)
    f.setLocalizedDateFormatFromTemplate("EEEEdMMMM")
    return f.string(from: date)
  }

  static func formatChip(_ value: String?) -> String {
    guard let value else { return L10n.t("date") }
    let today = todayIso()
    if value == today { return L10n.t("today") }
    if value == addDaysIso(today, days: 1) { return L10n.t("tomorrow") }
    let f = DateFormatter()
    f.locale = Locale(identifier: L10n.tag)
    f.setLocalizedDateFormatFromTemplate("dMMM")
    return f.string(from: parseIso(value))
  }

  static func startOfWeek(_ date: Date) -> Date {
    let comps = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
    return calendar.date(from: comps) ?? calendar.startOfDay(for: date)
  }

  static func weekDays(from anchor: Date) -> [Date] {
    let start = startOfWeek(anchor)
    return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
  }

  static func shiftDays(_ date: Date, by days: Int) -> Date {
    calendar.date(byAdding: .day, value: days, to: date) ?? date
  }

  static func dayNumber(_ date: Date) -> String {
    String(calendar.component(.day, from: date))
  }

  static func weekdayShort(_ date: Date) -> String {
    let sundayFirst = calendar.component(.weekday, from: date)
    return weekdays()[(sundayFirst + 5) % 7]
  }

  static func monthYear(_ value: String) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: L10n.tag)
    f.setLocalizedDateFormatFromTemplate("MMMMyyyy")
    return f.string(from: parseIso(value))
  }

  static func tomorrowIso() -> String { addDaysIso(todayIso(), days: 1) }
}

private extension Calendar {
  func dateParts(_ date: Date) -> (year: Int, month: Int, day: Int) {
    let c = dateComponents([.year, .month, .day], from: date)
    return (c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }
}
