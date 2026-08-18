import { Notification } from "electron"
import { activeUrgent } from "../lib/domain.js"

const timers = new Map()
const notified = new Set()

function noteKey(task) {
  return `${task.id}:${task.urgentUntil}`
}

function showNote(body) {
  if (!Notification.isSupported()) return
  const note = new Notification({
    title: "Task Tracker",
    body,
    silent: false,
  })
  note.show()
}

export function scheduleUrgentAlerts(store) {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  const live = new Set()
  for (const task of activeUrgent(store)) {
    const key = noteKey(task)
    live.add(key)
    if (notified.has(key)) continue
    const title = String(task.title || "").trim()
    const fireAt = task.urgentUntil - 15 * 60 * 1000
    const soon = fireAt - Date.now() <= 3000
    const body = soon ? `Due soon: ${title}` : `In 15 min: ${title}`
    const delay = Math.max(1000, fireAt - Date.now())
    timers.set(task.id, setTimeout(() => {
      timers.delete(task.id)
      if (notified.has(key)) return
      notified.add(key)
      showNote(body)
    }, delay))
  }
  for (const key of [...notified]) {
    if (!live.has(key)) notified.delete(key)
  }
}
