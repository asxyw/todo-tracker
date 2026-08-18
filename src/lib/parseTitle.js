import { addDaysIso, iso, todayIso } from "./dates.js"

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
  const next = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
    .replace(/\s+/g, " ")
    .trim()
  return { title: next, due }
}

export function parseTitleDate(text) {
  const raw = String(text || "").trim()
  if (!raw) return { title: "", due: null }

  const hit = take(raw, word("сегодня|today"), () => todayIso())
    || take(raw, word("послезавтра|day after tomorrow"), () => addDaysIso(todayIso(), 2))
    || take(raw, word("завтра|tomorrow"), () => addDaysIso(todayIso(), 1))
    || take(raw, /\+(\d+)\s*(?:d|д(?:ен(?:ь|я|ей)?)?)(?![\\p{L}\\p{N}])/iu, (match) => addDaysIso(todayIso(), Number(match[1])))
    || take(raw, /(?<![\\p{L}\\p{N}])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\\p{L}\\p{N}])/u, (match) => {
      const day = Number(match[1])
      const month = Number(match[2])
      let year = match[3] ? Number(match[3]) : new Date().getFullYear()
      if (year < 100) year += 2000
      return iso(new Date(year, month - 1, day))
    })

  if (hit) return { title: hit.title || raw, due: hit.due }

  for (let index = 0; index < WEEK.length; index += 1) {
    const names = WEEK[index].join("|")
    const weekday = take(raw, word(names), () => nextWeekday(index))
    if (weekday) return { title: weekday.title || raw, due: weekday.due }
  }

  return { title: raw, due: null }
}
