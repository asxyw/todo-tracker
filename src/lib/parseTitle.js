import { addDaysIso, iso, todayIso } from "./dates.js"
import { locale } from "./i18n.js"

const WEEK = [
  ["пн", "mon", "monday"],
  ["вт", "tue", "tuesday"],
  ["ср", "wed", "wednesday"],
  ["чт", "thu", "thursday"],
  ["пт", "fri", "friday"],
  ["сб", "sat", "saturday"],
  ["вс", "sun", "sunday"],
]

function nextWeekday(index) {
  const now = new Date()
  const current = now.getDay() === 0 ? 6 : now.getDay() - 1
  let delta = index - current
  if (delta <= 0) delta += 7
  return addDaysIso(todayIso(), delta)
}

function word(pattern) {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, "iu")
}

function take(text, re, toDue) {
  const match = text.match(re)
  if (!match) return null
  const due = toDue(match)
  if (!due) return null
  const next = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
    .replace(/\s+/g, " ")
    .trim()
  return { title: next, due }
}

// "8/19" is month-first in English, day-first everywhere else. A dot is always
// day-first. Out-of-range halves are swapped, and dates that do not exist are
// left alone so the digits stay in the title.
function numericDue(match) {
  const first = Number(match[1])
  const second = Number(match[2])
  let year = match[3] ? Number(match[3]) : new Date().getFullYear()
  if (year < 100) year += 2000
  const monthFirst = locale() === "en" && match[0].includes("/")
  let month = monthFirst ? first : second
  let day = monthFirst ? second : first
  if (month > 12 && day <= 12) [day, month] = [month, day]
  const date = new Date(year, month - 1, day)
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return iso(date)
}

export function parseTitleDate(text) {
  const raw = String(text || "").trim()
  if (!raw) return { title: "", due: null }

  const hit = take(raw, word("сегодня|today"), () => todayIso())
    || take(raw, word("послезавтра|day after tomorrow"), () => addDaysIso(todayIso(), 2))
    || take(raw, word("завтра|tomorrow"), () => addDaysIso(todayIso(), 1))
    || take(raw, /\+(\d+)\s*(?:days?|d|дн(?:ей|я)?|д(?:ен(?:ь|я|ей)?)?)(?![\p{L}\p{N}])/iu, (match) => addDaysIso(todayIso(), Number(match[1])))
    || take(raw, /(?<![\p{L}\p{N}])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\p{L}\p{N}])/u, numericDue)

  if (hit) return { title: hit.title || raw, due: hit.due }

  for (let index = 0; index < WEEK.length; index += 1) {
    const names = WEEK[index].join("|")
    const weekday = take(raw, word(names), () => nextWeekday(index))
    if (weekday) return { title: weekday.title || raw, due: weekday.due }
  }

  return { title: raw, due: null }
}
