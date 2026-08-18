import { addDaysIso, todayIso } from "./dates.js"
import { keepLocale, t } from "./i18n.js"

export const COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#ff453a", "#bf5af2", "#64d2ff", "#ffd60a", "#ff375f"]

export const REPEAT = {
  "1d": { days: 1 },
  "7d": { days: 7 },
  "1m": { days: 30 },
}

export function defaultZones() {
  return [
    { id: "life", name: t("zoneLife"), mode: "dates" },
    { id: "dev", name: t("zoneDev"), mode: "focus" },
  ]
}

export function emptyStore() {
  return {
    schemaVersion: 6,
    projects: [],
    tasks: [],
    settings: { lastView: { type: "today" }, zones: defaultZones(), deviceId: uid(), locale: "en" },
  }
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`
}

function clone(store) {
  return structuredClone(store)
}

export function listZones(store) {
  const raw = store?.settings?.zones
  if (!Array.isArray(raw) || !raw.length) return defaultZones()
  return raw.map((zone, index) => normalizeZone(zone, index))
}

export function zoneById(store, id) {
  return listZones(store).find((zone) => zone.id === id) || null
}

export function isFocusProject(store, project) {
  if (!project) return false
  return zoneById(store, project.zone)?.mode === "focus"
}

function normalizeZone(raw, index = 0) {
  const mode = raw?.mode === "focus" ? "focus" : "dates"
  const fallback = mode === "focus" ? t("fallbackWork") : t("fallbackLife")
  return {
    id: String(raw?.id || uid()),
    name: String(raw?.name || fallback).trim() || t("sectionN", { n: index + 1 }),
    mode,
  }
}

function nextOrder(tasks) {
  return tasks.reduce((max, task) => Math.max(max, Number(task.order) || 0), 0) + 1
}

function keepTitle(value) {
  if (value == null) return t("untitled")
  return String(value)
}

function keepNote(task) {
  if (task.note != null) return String(task.note)
  if (task.notes != null) return String(task.notes)
  if (task.body != null) return String(task.body)
  return ""
}

function keepRepeat(value) {
  return REPEAT[value] ? value : null
}

export function migrate(raw) {
  if (!raw) return emptyStore()
  if (Array.isArray(raw)) {
    return migrate({ schemaVersion: 2, projects: [], tasks: raw })
  }
  const zones = listZones({ settings: raw.settings })
  const zoneIds = new Set(zones.map((zone) => zone.id))
  const fallbackZone = zones[0]?.id || "life"
  const projects = Array.isArray(raw.projects) ? raw.projects.map((project) => {
    const zone = zoneIds.has(project.zone)
      ? project.zone
      : (project.zone === "dev" ? "dev" : fallbackZone)
    return {
      ...project,
      id: project.id || uid(),
      name: keepTitle(project.name === undefined ? t("project") : project.name),
      color: project.color || COLORS[0],
      createdAt: project.createdAt || Date.now(),
      zone: zoneIds.has(zone) ? zone : fallbackZone,
      status: ["active", "paused", "done"].includes(project.status) ? project.status : "active",
      goal: project.goal == null ? "" : String(project.goal),
    }
  }) : []
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).map((task, index) => ({
    ...task,
    id: task.id || uid(),
    title: keepTitle(task.title),
    note: keepNote(task),
    done: Boolean(task.done),
    due: task.due || null,
    projectId: task.projectId || null,
    createdAt: task.createdAt || Date.now(),
    updatedAt: task.updatedAt || task.createdAt || Date.now(),
    completedAt: task.done ? (task.completedAt || Date.now()) : null,
    order: Number.isFinite(task.order) ? task.order : index + 1,
    next: Boolean(task.next),
    later: Boolean(task.later),
    laterUntil: task.laterUntil || null,
    repeat: keepRepeat(task.repeat),
  }))
  const lastView = raw.settings?.lastView
  const viewType = lastView?.type === "daily" || lastView?.type === "calendar"
    ? (lastView.type === "daily" ? "inbox" : "upcoming")
    : lastView?.type
  return {
    schemaVersion: 6,
    projects,
    tasks,
    settings: {
      lastView: viewType ? { ...lastView, type: viewType } : { type: "today" },
      zones,
      deviceId: raw.settings?.deviceId || uid(),
      locale: keepLocale(raw.settings?.locale),
      updatedAt: Number(raw.settings?.updatedAt) || 0,
    },
  }
}

export function createTask(store, { title, due = null, projectId = null, asNext = false, note = "", repeat = null } = {}) {
  const clean = String(title || "").trim()
  if (!clean) return store
  const next = clone(store)
  const project = projectId && next.projects.some((row) => row.id === projectId) ? projectId : null
  const focus = Boolean(project) && isFocusProject(next, next.projects.find((row) => row.id === project))
  const hasNext = focus && next.tasks.some((task) => task.projectId === project && task.next && !task.done)
  const pin = focus && (asNext || !hasNext)
  if (pin && asNext) {
    next.tasks = next.tasks.map((task) => (
      task.projectId === project ? { ...task, next: false } : task
    ))
  }
  next.tasks.unshift({
    id: uid(),
    title: clean,
    note: String(note || ""),
    done: false,
    due: due || null,
    projectId: project,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
    order: nextOrder(next.tasks),
    next: pin,
    later: false,
    laterUntil: null,
    repeat: keepRepeat(repeat),
  })
  return next
}

export function patchTask(store, id, patch) {
  const next = clone(store)
  next.tasks = next.tasks.map((task) => {
    if (task.id !== id) return task
    const updated = { ...task, ...patch, updatedAt: Date.now() }
    if (patch.projectId === "") updated.projectId = null
    if (patch.due === "") updated.due = null
    if ("laterUntil" in patch && !patch.laterUntil) updated.laterUntil = null
    if (updated.laterUntil) updated.later = true
    if ("later" in patch && !patch.later) updated.laterUntil = null
    if (updated.due && !("later" in patch) && !("laterUntil" in patch)) updated.later = false
    if ("note" in patch) updated.note = String(patch.note ?? "")
    if ("repeat" in patch) updated.repeat = keepRepeat(patch.repeat)
    if ("done" in patch) {
      updated.done = Boolean(patch.done)
      updated.completedAt = updated.done ? Date.now() : null
      if (updated.done) updated.next = false
    }
    if (updated.projectId && !next.projects.some((row) => row.id === updated.projectId)) {
      updated.projectId = null
    }
    updated.title = updated.title == null || updated.title === "" ? task.title : String(updated.title)
    return updated
  })
  return next
}

export function toggleTask(store, id) {
  const task = store.tasks.find((row) => row.id === id)
  if (!task) return store
  return patchTask(store, id, { done: !task.done })
}

export function completeAndRepeat(store, id) {
  const task = store.tasks.find((row) => row.id === id)
  if (!task) return store
  let next = toggleTask(store, id)
  if (task.done || !task.repeat || !REPEAT[task.repeat]) return next
  const due = addDaysIso(task.due || todayIso(), REPEAT[task.repeat].days)
  return createTask(next, {
    title: task.title,
    note: task.note || "",
    due,
    projectId: task.projectId,
    repeat: task.repeat,
    asNext: Boolean(task.next),
  })
}

export function deleteTask(store, id) {
  const next = clone(store)
  next.tasks = next.tasks.filter((task) => task.id !== id)
  return next
}

export function createProject(store, name, { zone } = {}) {
  const clean = String(name || "").trim()
  if (!clean) return { store, project: null }
  const next = clone(store)
  const zones = listZones(next)
  const zoneId = zones.some((row) => row.id === zone) ? zone : zones[0]?.id || "life"
  const project = {
    id: uid(),
    name: clean,
    color: COLORS[next.projects.length % COLORS.length],
    createdAt: Date.now(),
    zone: zoneId,
    status: "active",
    goal: "",
  }
  next.projects.push(project)
  return { store: next, project }
}

export function patchProject(store, id, patch) {
  const next = clone(store)
  const zones = listZones(next)
  next.projects = next.projects.map((project) => {
    if (project.id !== id) return project
    const updated = { ...project, ...patch }
    if (patch.zone && !zones.some((zone) => zone.id === patch.zone)) updated.zone = project.zone
    if (patch.status && !["active", "paused", "done"].includes(patch.status)) updated.status = project.status
    if ("goal" in patch) updated.goal = patch.goal == null ? "" : String(patch.goal)
    if ("name" in patch) {
      const name = patch.name == null ? "" : String(patch.name)
      updated.name = name.trim() ? name : project.name
    }
    return updated
  })
  return next
}

export function createZone(store, { name, mode = "dates" } = {}) {
  const next = clone(store)
  const zones = listZones(next)
  if (zones.length >= 8) return next
  const zone = normalizeZone({ id: uid(), name, mode }, zones.length)
  next.settings = { ...next.settings, zones: [...zones, zone] }
  return next
}

export function patchZone(store, id, patch) {
  const next = clone(store)
  next.settings = {
    ...next.settings,
    zones: listZones(next).map((zone, index) => (
      zone.id === id ? normalizeZone({ ...zone, ...patch, id: zone.id }, index) : zone
    )),
  }
  return next
}

export function moveZone(store, id, dir) {
  const next = clone(store)
  const zones = listZones(next)
  const index = zones.findIndex((zone) => zone.id === id)
  const target = index + dir
  if (index < 0 || target < 0 || target >= zones.length) return store
  const copy = [...zones]
  const [row] = copy.splice(index, 1)
  copy.splice(target, 0, row)
  next.settings = { ...next.settings, zones: copy }
  return next
}

export function deleteZone(store, id) {
  const next = clone(store)
  const zones = listZones(next)
  if (zones.length <= 1) return store
  const rest = zones.filter((zone) => zone.id !== id)
  const fallback = rest[0].id
  next.settings = { ...next.settings, zones: rest }
  next.projects = next.projects.map((project) => (
    project.zone === id ? { ...project, zone: fallback } : project
  ))
  return next
}

export function setNextTask(store, id) {
  const task = store.tasks.find((row) => row.id === id)
  if (!task?.projectId) return store
  const next = clone(store)
  const on = !task.next
  next.tasks = next.tasks.map((row) => {
    if (row.projectId !== task.projectId) return row
    if (row.id === id) return { ...row, next: on, later: on ? false : row.later, updatedAt: Date.now() }
    return { ...row, next: false }
  })
  return next
}

export function setLaterTask(store, id) {
  const task = store.tasks.find((row) => row.id === id)
  if (!task) return store
  const on = !task.later
  return patchTask(store, id, { later: on, next: on ? false : task.next })
}

export function deleteProject(store, id) {
  const next = clone(store)
  next.tasks = next.tasks.map((task) => (
    task.projectId === id
      ? { ...task, projectId: null, next: false, updatedAt: Date.now() }
      : task
  ))
  next.projects = next.projects.filter((project) => project.id !== id)
  return next
}

export function setLastView(store, view) {
  const next = clone(store)
  next.settings = { ...next.settings, lastView: view }
  return next
}

export function mergeStores(local, remote) {
  if (!remote) return local
  const tasks = new Map()
  for (const task of [...(local.tasks || []), ...(remote.tasks || [])]) {
    const prev = tasks.get(task.id)
    if (!prev || (task.updatedAt || 0) >= (prev.updatedAt || 0)) tasks.set(task.id, task)
  }
  const projects = new Map()
  for (const project of [...(local.projects || []), ...(remote.projects || [])]) {
    const prev = projects.get(project.id)
    const stamp = project.updatedAt || project.createdAt || 0
    const prevStamp = prev ? (prev.updatedAt || prev.createdAt || 0) : -1
    if (!prev || stamp >= prevStamp) projects.set(project.id, project)
  }
  const zones = new Map()
  for (const zone of [...listZones(local), ...listZones(remote)]) {
    if (!zones.has(zone.id)) zones.set(zone.id, zone)
  }
  const localStamp = Math.max(0, ...(local.tasks || []).map((task) => task.updatedAt || 0))
  const remoteStamp = Math.max(0, ...(remote.tasks || []).map((task) => task.updatedAt || 0))
  const localSet = Number(local.settings?.updatedAt) || localStamp
  const remoteSet = Number(remote.settings?.updatedAt) || remoteStamp
  const newer = remoteSet > localSet ? remote.settings : local.settings
  return {
    schemaVersion: 6,
    projects: [...projects.values()].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    tasks: [...tasks.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    settings: {
      lastView: newer?.lastView || { type: "today" },
      zones: zones.size ? [...zones.values()] : defaultZones(),
      deviceId: local.settings?.deviceId || remote.settings?.deviceId || uid(),
      locale: keepLocale(newer?.locale || local.settings?.locale || remote.settings?.locale),
      updatedAt: Math.max(localSet, remoteSet),
    },
  }
}
