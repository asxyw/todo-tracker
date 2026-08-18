export function pad(n) {
  return String(n).padStart(2, "0")
}

export function iso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayIso() {
  return iso(new Date())
}

export function addDaysIso(value, days) {
  const date = value ? parseIso(value) : new Date()
  date.setDate(date.getDate() + days)
  return iso(date)
}

export function parseIso(value) {
  const [y, m, d] = String(value).split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function startOfWeek(date) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const offset = (next.getDay() + 6) % 7
  next.setDate(next.getDate() - offset)
  return next
}

export function formatLong(date) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(date)
}

export function formatChip(value) {
  if (!value) return "Дата"
  const today = todayIso()
  if (value === today) return "Сегодня"
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (value === iso(tomorrow)) return "Завтра"
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(parseIso(value))
}

export const DAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]

export function dowIndex(date) {
  return date.getDay() === 0 ? 6 : date.getDay() - 1
}
