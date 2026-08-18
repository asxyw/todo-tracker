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

export function emptyDeleted() {
  return { tasks: [], projects: [] }
}

export function emptyStore() {
  return {
    schemaVersion: 8,
    projects: [],
    tasks: [],
    deleted: emptyDeleted(),
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

function keepUrgentAlert(value) {
  return value === "island" || value === "push" ? value : null
}

function keepUrgentUntil(value) {
  const stamp = Number(value)
  return Number.isFinite(stamp) && stamp > 0 ? stamp : null
}

export function activeUrgent(store, now = Date.now()) {
  return (store.tasks || [])
    .filter((task) => !task.done && keepUrgentUntil(task.urgentUntil) > now)
    .sort((a, b) => a.urgentUntil - b.urgentUntil)
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
    urgentUntil: keepUrgentUntil(task.urgentUntil),
    urgentAlert: keepUrgentAlert(task.urgentAlert),
  }))
  const lastView = raw.settings?.lastView
  const viewType = lastView?.type === "daily" || lastView?.type === "calendar"
    ? (lastView.type === "daily" ? "inbox" : "upcoming")
    : lastView?.type
  return {
    schemaVersion: 8,
    projects,
    tasks,
    deleted: {
      tasks: asDeletedList(raw.deleted?.tasks),
      projects: asDeletedList(raw.deleted?.projects),
    },
    settings: {
      lastView: viewType ? { ...lastView, type: viewType } : { type: "today" },
      zones,
      deviceId: raw.settings?.deviceId || uid(),
      locale: keepLocale(raw.settings?.locale),
      updatedAt: Number(raw.settings?.updatedAt) || 0,
    },
  }
}

function asDeletedList(raw) {
  if (!Array.isArray(raw)) return []
  return raw.filter((row) => row?.id).map((row) => ({
    id: String(row.id),
    title: String(row.title || row.name || ""),
    deletedAt: Number(row.deletedAt) || Date.now(),
  }))
}

export function listDeleted(store) {
  return {
    tasks: asDeletedList(store?.deleted?.tasks),
    projects: asDeletedList(store?.deleted?.projects),
  }
}

function rememberDeleted(list, row) {
  const next = list.filter((item) => item.id !== row.id)
  next.push({
    id: row.id,
    title: String(row.title || row.name || ""),
    deletedAt: Date.now(),
  })
  next.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0))
  return next.slice(0, 400)
}

function dropDeleted(list, id) {
  return list.filter((item) => item.id !== id)
}

export function createTask(store, { title, due = null, projectId = null, asNext = false, note = "", repeat = null, urgentUntil = null, urgentAlert = null } = {}) {
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
    urgentUntil: keepUrgentUntil(urgentUntil),
    urgentAlert: keepUrgentUntil(urgentUntil) ? keepUrgentAlert(urgentAlert) || "push" : null,
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
    if ("urgentUntil" in patch) updated.urgentUntil = keepUrgentUntil(patch.urgentUntil)
    if ("urgentAlert" in patch) updated.urgentAlert = keepUrgentAlert(patch.urgentAlert)
    if (updated.urgentUntil && !updated.urgentAlert) updated.urgentAlert = "push"
    if (!updated.urgentUntil) updated.urgentAlert = null
    if ("done" in patch) {
      updated.done = Boolean(patch.done)
      updated.completedAt = updated.done ? Date.now() : null
      if (updated.done) {
        updated.next = false
        updated.urgentUntil = null
        updated.urgentAlert = null
      }
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
  const task = store.tasks.find((row) => row.id === id)
  const next = clone(store)
  next.tasks = next.tasks.filter((row) => row.id !== id)
  const deleted = listDeleted(next)
  if (task) deleted.tasks = rememberDeleted(deleted.tasks, task)
  next.deleted = deleted
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

export function setUrgent(store, id, minutes, alert = "push") {
  const task = store.tasks.find((row) => row.id === id)
  if (!task || task.done) return store
  const span = Number(minutes)
  if (!Number.isFinite(span) || span <= 0) {
    return patchTask(store, id, { urgentUntil: null, urgentAlert: null })
  }
  return patchTask(store, id, {
    urgentUntil: Date.now() + span * 60 * 1000,
    urgentAlert: keepUrgentAlert(alert) || "push",
  })
}

export function setLaterTask(store, id) {
  const task = store.tasks.find((row) => row.id === id)
  if (!task) return store
  const on = !task.later
  return patchTask(store, id, { later: on, next: on ? false : task.next })
}

export function deleteProject(store, id) {
  const project = store.projects.find((row) => row.id === id)
  const next = clone(store)
  next.tasks = next.tasks.map((task) => (
    task.projectId === id
      ? { ...task, projectId: null, next: false, updatedAt: Date.now() }
      : task
  ))
  next.projects = next.projects.filter((row) => row.id !== id)
  const deleted = listDeleted(next)
  if (project) deleted.projects = rememberDeleted(deleted.projects, project)
  next.deleted = deleted
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
  const deleted = {
    tasks: mergeTombstones(listDeleted(local).tasks, listDeleted(remote).tasks, tasks),
    projects: mergeTombstones(listDeleted(local).projects, listDeleted(remote).projects, projects),
  }
  for (const tomb of deleted.tasks) tasks.delete(tomb.id)
  for (const tomb of deleted.projects) projects.delete(tomb.id)
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
    schemaVersion: 8,
    projects: [...projects.values()].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    tasks: [...tasks.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    deleted,
    settings: {
      lastView: newer?.lastView || { type: "today" },
      zones: zones.size ? [...zones.values()] : defaultZones(),
      deviceId: local.settings?.deviceId || remote.settings?.deviceId || uid(),
      locale: keepLocale(newer?.locale || local.settings?.locale || remote.settings?.locale),
      updatedAt: Math.max(localSet, remoteSet),
    },
  }
}

function mergeTombstones(localList, remoteList, live) {
  const tombs = new Map()
  for (const row of [...localList, ...remoteList]) {
    const prev = tombs.get(row.id)
    if (!prev || (row.deletedAt || 0) >= (prev.deletedAt || 0)) tombs.set(row.id, row)
  }
  for (const [id, tomb] of tombs) {
    const row = live.get(id)
    const stamp = row ? (row.updatedAt || row.createdAt || 0) : 0
    if (row && stamp > (tomb.deletedAt || 0)) tombs.delete(id)
  }
  return [...tombs.values()].sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0)).slice(0, 400)
}

function brief(row, extra = {}) {
  return {
    id: row.id,
    title: String(row.title || row.name || ""),
    snapshot: row,
    ...extra,
  }
}

export function emptySyncDiff() {
  return {
    addedHere: [],
    addedThere: [],
    deletedHere: [],
    deletedThere: [],
    addedProjectsHere: [],
    addedProjectsThere: [],
    deletedProjectsHere: [],
    deletedProjectsThere: [],
  }
}

export function syncDiffCount(diff) {
  if (!diff) return 0
  return Object.values(diff).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0)
}

export function diffStores(local, remote) {
  const diff = emptySyncDiff()
  if (!remote) return diff
  const localTasks = new Map((local.tasks || []).map((row) => [row.id, row]))
  const remoteTasks = new Map((remote.tasks || []).map((row) => [row.id, row]))
  const localTombs = new Map(listDeleted(local).tasks.map((row) => [row.id, row]))
  const remoteTombs = new Map(listDeleted(remote).tasks.map((row) => [row.id, row]))
  for (const [id, task] of localTasks) {
    if (!remoteTasks.has(id) && !remoteTombs.has(id)) diff.addedHere.push(brief(task))
    if (remoteTombs.has(id)) diff.deletedThere.push(brief(task, { from: "phone" }))
  }
  for (const [id, task] of remoteTasks) {
    if (!localTasks.has(id) && !localTombs.has(id)) diff.addedThere.push(brief(task))
    if (localTombs.has(id)) diff.deletedHere.push(brief(task, { from: "mac" }))
  }
  const localProjects = new Map((local.projects || []).map((row) => [row.id, row]))
  const remoteProjects = new Map((remote.projects || []).map((row) => [row.id, row]))
  const localGone = new Map(listDeleted(local).projects.map((row) => [row.id, row]))
  const remoteGone = new Map(listDeleted(remote).projects.map((row) => [row.id, row]))
  for (const [id, project] of localProjects) {
    if (!remoteProjects.has(id) && !remoteGone.has(id)) diff.addedProjectsHere.push(brief(project))
    if (remoteGone.has(id)) diff.deletedProjectsThere.push(brief(project, { from: "phone" }))
  }
  for (const [id, project] of remoteProjects) {
    if (!localProjects.has(id) && !localGone.has(id)) diff.addedProjectsThere.push(brief(project))
    if (localGone.has(id)) diff.deletedProjectsHere.push(brief(project, { from: "mac" }))
  }
  return diff
}

export function keepLocalItem(store, snapshot, kind = "task") {
  if (!snapshot?.id) return store
  const next = clone(store)
  const deleted = listDeleted(next)
  const stamp = Date.now() + 1
  if (kind === "project") {
    deleted.projects = dropDeleted(deleted.projects, snapshot.id)
    next.deleted = deleted
    const project = { ...snapshot, updatedAt: stamp }
    next.projects = [
      ...next.projects.filter((row) => row.id !== snapshot.id),
      project,
    ]
    return next
  }
  deleted.tasks = dropDeleted(deleted.tasks, snapshot.id)
  next.deleted = deleted
  const task = { ...snapshot, updatedAt: stamp }
  next.tasks = [task, ...next.tasks.filter((row) => row.id !== snapshot.id)]
  return next
}
