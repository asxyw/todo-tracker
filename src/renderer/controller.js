import {
  completeAndRepeat,
  createProject,
  createTask,
  createZone,
  deleteProject,
  deleteTask,
  deleteZone,
  isFocusProject,
  keepLocalItem,
  listZones,
  moveZone,
  patchProject,
  patchTask,
  patchZone,
  setLastView,
  setLaterTask,
  setNextTask,
  setUrgent,
} from "../lib/domain.js"
import { iso, startOfWeek, addDaysIso, todayIso } from "../lib/dates.js"
import { parseTitleDate } from "../lib/parseTitle.js"
import { defaultsForView, listedTaskIds, nextStep } from "../lib/selectors.js"
import { keepLocale, locale, repeatCaption, setLocale, t } from "../lib/i18n.js"

const history = []

export const ui = {
  view: { type: "today" },
  weekAnchor: startOfWeek(new Date()),
  addingZone: null,
  selectedId: null,
  query: "",
  pendingNext: null,
  toast: null,
  folds: { done: true, later: true },
  syncDiff: null,
  urgentMinutes: null,
  urgentAlert: "push",
  store: { schemaVersion: 8, projects: [], tasks: [], deleted: { tasks: [], projects: [] }, settings: {} },
}

function snapshot() {
  history.push(structuredClone({
    tasks: ui.store.tasks,
    projects: ui.store.projects,
    settings: ui.store.settings,
    deleted: ui.store.deleted,
  }))
  if (history.length > 40) history.shift()
}

async function persist() {
  const persistable = ["today", "inbox", "upcoming", "all", "archive", "project"]
  if (persistable.includes(ui.view.type)) ui.store = setLastView(ui.store, ui.view)
  ui.store = {
    ...ui.store,
    settings: {
      ...ui.store.settings,
      locale: locale(),
      updatedAt: Date.now(),
    },
  }
  await window.tasksApi.save(ui.store)
}

export function commit(next, { record = true } = {}) {
  if (record) snapshot()
  ui.store = next
  void persist()
}

export function flashToast(text) {
  ui.toast = { text, at: Date.now() }
}

export function undo() {
  const prev = history.pop()
  if (!prev) return false
  ui.store = { ...ui.store, tasks: prev.tasks, projects: prev.projects, settings: prev.settings, deleted: prev.deleted }
  ui.pendingNext = null
  syncLocale(ui.store.settings?.locale)
  flashToast(t("undone"))
  void persist()
  return true
}

export function setView(view) {
  if (view.type === "upcoming" && !view.date) {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    view = { type: "upcoming", date: iso(tomorrow) }
  }
  ui.view = view
  ui.addingZone = null
  if (view.type === "upcoming") ui.weekAnchor = startOfWeek(parseViewDate(view.date))
  if (view.type === "today") ui.weekAnchor = startOfWeek(new Date())
}

function parseViewDate(value) {
  const [y, m, d] = String(value).split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function composerDefaults() {
  return defaultsForView(ui.view, ui.store)
}

export function addTask(title, due, extra = {}) {
  const parsed = parseTitleDate(title)
  const defaults = composerDefaults()
  let nextDue = defaults.due
  if (extra.due !== undefined) nextDue = extra.due
  else if (parsed.due) nextDue = parsed.due
  else if (due) nextDue = due
  else if (due === "") nextDue = null
  const next = createTask(ui.store, {
    title: parsed.title,
    due: nextDue,
    projectId: extra.projectId !== undefined ? extra.projectId : defaults.projectId,
    asNext: Boolean(extra.asNext),
    note: extra.note || "",
    repeat: extra.repeat || null,
    urgentUntil: extra.urgentUntil || null,
    urgentAlert: extra.urgentAlert || null,
  })
  if (next === ui.store) return false
  commit(next)
  return true
}

export function updateTask(id, patch) {
  commit(patchTask(ui.store, id, patch))
}

function afterToggle(task) {
  if (!task || task.done) {
    ui.pendingNext = null
    return
  }
  const project = task.projectId
    ? ui.store.projects.find((row) => row.id === task.projectId)
    : null
  if (task.next && isFocusProject(ui.store, project) && project.status === "active" && !nextStep(ui.store, project.id)) {
    ui.pendingNext = { projectId: project.id }
    return
  }
  ui.pendingNext = null
}

export function completeSelected() {
  if (!ui.selectedId) return
  completeTask(ui.selectedId)
}

export function completeTask(id) {
  const task = ui.store.tasks.find((row) => row.id === id)
  if (!task) return
  ui.selectedId = id
  commit(completeAndRepeat(ui.store, id))
  afterToggle(task)
  flashToast(task.done ? t("restored") : (task.repeat ? t("completedRepeat") : t("completed")))
}

export function setUrgentTask(id, minutes, alert) {
  commit(setUrgent(ui.store, id, minutes, alert))
}

export function clearUrgentTask(id) {
  updateTask(id, { urgentUntil: null, urgentAlert: null })
}

export function cycleRepeat(id) {
  const task = ui.store.tasks.find((row) => row.id === id)
  if (!task || task.done) return
  const keys = [null, "1d", "7d", "1m"]
  const index = Math.max(0, keys.indexOf(task.repeat))
  const next = keys[(index + 1) % keys.length]
  updateTask(id, { repeat: next })
  flashToast(next ? repeatCaption(next) : t("noRepeat"))
}

export function pickNext(id) {
  commit(setNextTask(ui.store, id))
  ui.pendingNext = null
}

export function skipNextPrompt() {
  ui.pendingNext = null
}

export function addNextFromPrompt(title) {
  if (!ui.pendingNext) return false
  const ok = addTask(title, null, { projectId: ui.pendingNext.projectId, asNext: true, due: null })
  if (ok) ui.pendingNext = null
  return ok
}

export function removeTask(id) {
  commit(deleteTask(ui.store, id))
  if (ui.selectedId === id) ui.selectedId = null
  flashToast(t("deletedUndo"))
}

export function removeSelected() {
  if (!ui.selectedId) return
  removeTask(ui.selectedId)
}

export function pinNext(id) {
  commit(setNextTask(ui.store, id))
}

export function markLater(id) {
  commit(setLaterTask(ui.store, id))
}

export function addProject(name, zone) {
  const { store, project } = createProject(ui.store, name, { zone })
  if (!project) return null
  commit(store)
  ui.addingZone = null
  setView({ type: "project", id: project.id })
  return project
}

export function changeProject(id, patch) {
  commit(patchProject(ui.store, id, patch))
}

export function togglePause(id) {
  const project = ui.store.projects.find((row) => row.id === id)
  if (!project) return
  changeProject(id, { status: project.status === "paused" ? "active" : "paused" })
}

export function archiveProject(id) {
  changeProject(id, { status: "done" })
  if (ui.view.type === "project" && ui.view.id === id) setView({ type: "archive" })
}

export function restoreProject(id) {
  changeProject(id, { status: "active" })
  flashToast(t("restoredArchive"))
}

export function removeProject(id) {
  commit(deleteProject(ui.store, id))
  if (ui.view.type === "project" && ui.view.id === id) setView({ type: "inbox" })
}

export function shiftWeek(days) {
  const next = new Date(ui.weekAnchor)
  next.setDate(next.getDate() + days)
  ui.weekAnchor = next
}

export function moveSelection(delta) {
  const ids = listedTaskIds(ui.store, ui.view, ui.query)
  if (!ids.length) return
  const index = ids.indexOf(ui.selectedId)
  const next = index < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, index + delta))
  ui.selectedId = ids[next]
}

export function nudgeSelectedDue(days) {
  if (!ui.selectedId) return false
  const task = ui.store.tasks.find((row) => row.id === ui.selectedId)
  if (!task || task.done) return false
  const base = task.due || todayIso()
  updateTask(task.id, { due: addDaysIso(base, days), later: false })
  return true
}

export function setSelectedDue(due) {
  if (!ui.selectedId) return false
  const task = ui.store.tasks.find((row) => row.id === ui.selectedId)
  if (!task || task.done) return false
  updateTask(task.id, { due, later: due ? false : task.later })
  return true
}

export function toggleFold(key) {
  const current = ui.folds[key] ?? true
  ui.folds = { ...ui.folds, [key]: !current }
}

export function firstZoneId(mode) {
  const zones = listZones(ui.store)
  return (mode ? zones.find((zone) => zone.mode === mode) : zones[0])?.id || zones[0]?.id
}

export function addZone(name, mode) {
  commit(createZone(ui.store, { name, mode }))
}

export function changeZone(id, patch) {
  commit(patchZone(ui.store, id, patch))
}

export function shiftZone(id, dir) {
  commit(moveZone(ui.store, id, dir))
}

export function removeZone(id) {
  if (listZones(ui.store).length <= 1) {
    flashToast(t("needOneZone"))
    return
  }
  commit(deleteZone(ui.store, id))
  flashToast(t("zoneRemoved"))
}

function syncLocale(code) {
  const next = setLocale(keepLocale(code))
  document.documentElement.lang = next
  window.tasksApi.setLocale?.(next)
  return next
}

export function applyLocale(code) {
  const next = syncLocale(code)
  if (ui.store.settings?.locale === next) return next
  ui.store = {
    ...ui.store,
    settings: { ...ui.store.settings, locale: next, updatedAt: Date.now() },
  }
  void persist()
  return next
}

export function keepSyncItem(row, kind = "task") {
  if (!row?.snapshot) return false
  commit(keepLocalItem(ui.store, row.snapshot, kind))
  flashToast(t("syncKept"))
  if (ui.syncDiff) {
    const key = kind === "project" ? "deletedProjectsThere" : "deletedThere"
    ui.syncDiff = {
      ...ui.syncDiff,
      [key]: (ui.syncDiff[key] || []).filter((item) => item.id !== row.id),
    }
  }
  return true
}

export function loadInto(store, { keepView = false } = {}) {
  ui.store = store
  ui.pendingNext = null
  syncLocale(store.settings?.locale)
  if (keepView) return
  const last = store.settings?.lastView
  const validProject = last?.type === "project" && store.projects.some((row) => row.id === last.id)
  const views = ["today", "inbox", "upcoming", "all", "archive"]
  if (last?.type === "project" && validProject) setView(last)
  else if (views.includes(last?.type)) setView(last)
  else setView({ type: "today" })
}
