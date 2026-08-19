import { Notification, nativeImage, powerMonitor } from "electron"
import { existsSync } from "node:fs"
import { activeUrgent } from "../lib/domain.js"

const timers = new Map()
const notified = new Set()
let lastStore = null
let icon = null
let ticking = false

function noteKey(task) {
  return `${task.id}:${task.urgentUntil}`
}

function noteBody(task, fireAt) {
  const title = String(task.title || "").trim()
  return fireAt - Date.now() <= 3000 ? `Due soon: ${title}` : `In 15 min: ${title}`
}

function showNote(body) {
  if (!Notification.isSupported()) return
  const note = new Notification({
    title: "Task Tracker",
    body,
    silent: false,
    icon: icon || undefined,
  })
  note.on("failed", (error) => console.error("[task-tracker] notify", error))
  note.show()
}

function fireDue(store, now = Date.now()) {
  const live = new Set()
  for (const task of activeUrgent(store, now)) {
    const key = noteKey(task)
    live.add(key)
    if (notified.has(key)) continue
    const fireAt = task.urgentUntil - 15 * 60 * 1000
    if (now < fireAt - 400) continue
    notified.add(key)
    showNote(noteBody(task, fireAt))
  }
  for (const key of [...notified]) {
    if (!live.has(key)) notified.delete(key)
  }
}

export function setNotifyIcon(path) {
  if (path && existsSync(path)) icon = nativeImage.createFromPath(path)
}

export function scheduleUrgentAlerts(store) {
  lastStore = store
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  if (!ticking) {
    ticking = true
    setInterval(() => {
      if (lastStore) fireDue(lastStore)
    }, 15000)
    powerMonitor.on("resume", () => {
      if (lastStore) fireDue(lastStore)
    })
  }
  const now = Date.now()
  fireDue(store, now)
  for (const task of activeUrgent(store, now)) {
    const key = noteKey(task)
    if (notified.has(key)) continue
    const fireAt = task.urgentUntil - 15 * 60 * 1000
    const delay = Math.max(1000, Math.min(fireAt - now, 2_000_000_000))
    timers.set(task.id, setTimeout(() => {
      timers.delete(task.id)
      fireDue(lastStore || store)
    }, delay))
  }
}
