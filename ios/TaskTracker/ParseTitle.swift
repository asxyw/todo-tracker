import Foundation

enum ParseTitle {
  private static let week = [
    ["пн", "mon", "monday"],
    ["вт", "tue", "tuesday"],
    ["ср", "wed", "wednesday"],
    ["чт", "thu", "thursday"],
    ["пт", "fri", "friday"],
    ["сб", "sat", "saturday"],
    ["вс", "sun", "sunday"],
  ]

  static func parse(_ text: String) -> (title: String, due: String?) {
    let raw = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if raw.isEmpty { return ("", nil) }

    if let hit = take(raw, pattern: word("сегодня|today"), due: { _ in Dates.todayIso() })
      ?? take(raw, pattern: word("послезавтра|day after tomorrow"), due: { _ in Dates.addDaysIso(Dates.todayIso(), days: 2) })
      ?? take(raw, pattern: word("завтра|tomorrow"), due: { _ in Dates.addDaysIso(Dates.todayIso(), days: 1) })
      ?? take(raw, pattern: #"\+(\d+)\s*(?:days?|d|дн(?:ей|я)?|д(?:ен(?:ь|я|ей)?)?)(?![\p{L}\p{N}])"#, options: [.caseInsensitive], due: { m in
        Dates.addDaysIso(Dates.todayIso(), days: Int(m) ?? 0)
      }, group: 1)
      ?? takeDate(raw)
    {
      return (hit.title.isEmpty ? raw : hit.title, hit.due)
    }

    for (index, names) in week.enumerated() {
      if let hit = take(raw, pattern: word(names.joined(separator: "|")), due: { _ in nextWeekday(index) }) {
        return (hit.title.isEmpty ? raw : hit.title, hit.due)
      }
    }
    return (raw, nil)
  }

  private static func word(_ pattern: String) -> String {
    #"(?<![\p{L}\p{N}])(?:\#(pattern))(?![\p{L}\p{N}])"#
  }

  private static func nextWeekday(_ index: Int) -> String {
    let now = Date()
    let weekday = Calendar.current.component(.weekday, from: now)
    let current = weekday == 1 ? 6 : weekday - 2
    var delta = index - current
    if delta <= 0 { delta += 7 }
    return Dates.addDaysIso(Dates.todayIso(), days: delta)
  }

  private static func take(
    _ text: String,
    pattern: String,
    options: NSRegularExpression.Options = [.caseInsensitive],
    due: (String) -> String,
    group: Int = 0
  ) -> (title: String, due: String)? {
    guard let re = try? NSRegularExpression(pattern: pattern, options: options) else { return nil }
    let range = NSRange(text.startIndex..., in: text)
    guard let match = re.firstMatch(in: text, range: range),
          let full = Range(match.range, in: text)
    else { return nil }
    var captured = String(text[full])
    if group > 0, match.numberOfRanges > group, let g = Range(match.range(at: group), in: text) {
      captured = String(text[g])
    }
    let next = (text[..<full.lowerBound] + " " + text[full.upperBound...])
      .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return (next, due(captured))
  }

  // "8/19" is month-first in English, day-first everywhere else. A dot is always
  // day-first. Out-of-range halves are swapped, and dates that do not exist are
  // left alone so the digits stay in the title.
  private static func takeDate(_ text: String) -> (title: String, due: String)? {
    let pattern = #"(?<![\p{L}\p{N}])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\p{L}\p{N}])"#
    guard let re = try? NSRegularExpression(pattern: pattern),
          let match = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
          let fullRange = Range(match.range, in: text),
          let firstRange = Range(match.range(at: 1), in: text),
          let secondRange = Range(match.range(at: 2), in: text),
          let first = Int(text[firstRange]),
          let second = Int(text[secondRange])
    else { return nil }

    var year = Calendar.current.component(.year, from: Date())
    if match.numberOfRanges > 3,
       match.range(at: 3).location != NSNotFound,
       let yearRange = Range(match.range(at: 3), in: text),
       let parsed = Int(text[yearRange]) {
      year = parsed < 100 ? parsed + 2000 : parsed
    }

    let monthFirst = L10n.code == "en" && text[fullRange].contains("/")
    var month = monthFirst ? first : second
    var day = monthFirst ? second : first
    if month > 12, day <= 12 { swap(&month, &day) }

    var parts = DateComponents()
    parts.year = year
    parts.month = month
    parts.day = day
    let calendar = Calendar(identifier: .gregorian)
    guard let date = calendar.date(from: parts),
          calendar.component(.month, from: date) == month,
          calendar.component(.day, from: date) == day
    else { return nil }

    let next = (text[..<fullRange.lowerBound] + " " + text[fullRange.upperBound...])
      .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return (next, Dates.iso(date))
  }
}
