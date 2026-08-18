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
      ?? take(raw, pattern: #"\+(\d+)\s*(?:d|д(?:ен(?:ь|я|ей)?)?)(?![\\p{L}\\p{N}])"#, options: [.caseInsensitive], due: { m in
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

  private static func takeDate(_ text: String) -> (title: String, due: String)? {
    take(
      text,
      pattern: #"(?<![\p{L}\p{N}])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\p{L}\p{N}])"#,
      options: [],
      due: { _ in "" },
      group: 0
    ).flatMap { hit in
      guard let re = try? NSRegularExpression(pattern: #"(?<![\p{L}\p{N}])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\p{L}\p{N}])"#),
            let match = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
            let dR = Range(match.range(at: 1), in: text),
            let mR = Range(match.range(at: 2), in: text)
      else { return nil }
      let day = Int(text[dR]) ?? 1
      let month = Int(text[mR]) ?? 1
      var year = Calendar.current.component(.year, from: Date())
      if match.numberOfRanges > 3, match.range(at: 3).location != NSNotFound, let yR = Range(match.range(at: 3), in: text) {
        year = Int(text[yR]) ?? year
        if year < 100 { year += 2000 }
      }
      var parts = DateComponents()
      parts.year = year
      parts.month = month
      parts.day = day
      let date = Calendar.current.date(from: parts) ?? Date()
      return (hit.title, Dates.iso(date))
    }
  }
}
