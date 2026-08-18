import { formatChip, formatLong, iso, parseIso, todayIso } from "./dates.js"
import { isFocusProject, listZones, zoneById } from "./domain.js"
import { localeTag, t } from "./i18n.js"

export function projectById(store, id) {
  return store.projects.find((row) => row.id === id)
}

export function openCount(store, predicate = () => true) {
  return store.tasks.filter((task) => !task.done && predicate(task)).length
}

export function nextStep(store, projectId) {
  return store.tasks.find((task) => task.projectId === projectId && task.next && !task.done) || null
}

export function projectsInZone(store, zone) {
  const active = []
  const paused = []
  for (const project of store.projects) {
    if (project.zone !== zone || project.status === "done") continue
    if (project.status === "paused") paused.push(project)
    else active.push(project)
  }
  return [...active, ...paused]
}

function projectAsleep(store, task) {
  const project = task.projectId ? projectById(store, task.projectId) : null
  return Boolean(project && project.status !== "active")
}

function sleeping(store, task) {
  if (task.later && !task.done) {
    if (task.laterUntil && task.laterUntil <= todayIso()) return projectAsleep(store, task)
    return true
  }
  return projectAsleep(store, task)
}

export function isTodayTask(store, task) {
  const today = todayIso()
  if (sleeping(store, task) && !task.done) return false
  const project = task.projectId ? projectById(store, task.projectId) : null
  const focus = isFocusProject(store, project)

  if (task.done) {
    const doneOn = task.completedAt ? iso(new Date(task.completedAt)) : null
    return doneOn === today
  }
  if (focus) return Boolean(task.next)
  return Boolean(task.due && task.due <= today)
}

export function defaultsForView(view, store) {
  if (view.type === "today") return { projectId: null, due: todayIso(), label: t("today") }
  if (view.type === "inbox") return { projectId: null, due: null, label: t("inbox") }
  if (view.type === "upcoming") return { projectId: null, due: view.date, label: t("upcomingWith", { label: formatChip(view.date) }) }
  if (view.type === "project") {
    const project = store ? projectById(store, view.id) : null
    return { projectId: view.id, due: null, label: project?.name || t("thisProject") }
  }
  return { projectId: null, due: null, label: t("inbox") }
}

export function visibleTasks(store, view, query = "") {
  const today = todayIso()
  const needle = query.trim().toLowerCase()
  if (needle) {
    return store.tasks.filter((task) => {
      const project = task.projectId ? projectById(store, task.projectId) : null
      const hay = [task.title, task.note, project?.name, project?.goal]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(needle)
    })
  }
  let tasks = store.tasks
  if (view.type === "inbox") tasks = tasks.filter((task) => !task.projectId)
  else if (view.type === "project") tasks = tasks.filter((task) => task.projectId === view.id)
  else if (view.type === "upcoming") {
    tasks = tasks.filter((task) => {
      if (task.done) return false
      if (projectAsleep(store, task)) return false
      if (view.date) return task.due === view.date
      return Boolean(task.due && task.due > today)
    })
  } else if (view.type === "today") {
    tasks = tasks.filter((task) => isTodayTask(store, task))
  } else if (view.type === "archive") {
    tasks = []
  }
  return tasks
}

export function listedTaskIds(store, view, query = "") {
  const tasks = visibleTasks(store, view, query)
  return groupTasks(store, view, tasks, query).flatMap((group) => group.items.map((task) => task.id))
}

export function nextCandidates(store, projectId) {
  return store.tasks.filter((task) => (
    task.projectId === projectId && !task.done && !task.later
  ))
}

export function focusProjectsNeedingStep(store) {
  return listZones(store)
    .filter((zone) => zone.mode === "focus")
    .flatMap((zone) => projectsInZone(store, zone.id))
    .filter((project) => project.status === "active" && !nextStep(store, project.id))
}

export function idleDays(store, projectId) {
  const project = projectById(store, projectId)
  const times = [project?.createdAt || 0]
  for (const task of store.tasks) {
    if (task.projectId !== projectId) continue
    times.push(task.completedAt || 0, task.updatedAt || 0)
  }
  const last = Math.max(...times)
  if (!last) return 0
  return Math.floor((Date.now() - last) / 86400000)
}

export function smartCounts(store) {
  const today = todayIso()
  return {
    inbox: openCount(store, (task) => !task.projectId && !task.later),
    today: openCount(store, (task) => isTodayTask(store, task)),
    upcoming: openCount(store, (task) => task.due && task.due > today && !projectAsleep(store, task)),
    all: openCount(store),
  }
}

export function archivedProjects(store) {
  return store.projects.filter((project) => project.status === "done")
}

export function dormantProjects(store) {
  return store.projects
    .filter((project) => project.status === "active")
    .map((project) => ({ project, idle: idleDays(store, project.id) }))
    .filter((row) => row.idle >= 7)
    .sort((a, b) => b.idle - a.idle)
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    if (Boolean(a.done) !== Boolean(b.done)) return a.done ? 1 : -1
    if (Boolean(a.next) !== Boolean(b.next)) return a.next ? -1 : 1
    if ((a.order || 0) !== (b.order || 0)) return (a.order || 0) - (b.order || 0)
    if ((a.due || "") !== (b.due || "")) return (a.due || "9999").localeCompare(b.due || "9999")
    return (b.createdAt || 0) - (a.createdAt || 0)
  })
}

export function groupTasks(store, view, tasks, query = "") {
  const today = todayIso()
  const buckets = new Map()
  const ensure = (key, title, tone, collapsed = false) => {
    if (!buckets.has(key)) buckets.set(key, { key, title, tone, collapsed, items: [] })
    return buckets.get(key)
  }
  const asAll = Boolean(query.trim()) || view.type === "all"

  for (const task of tasks) {
    if (task.done) {
      const title = view.type === "today" ? t("doneToday") : t("done")
      ensure("done", title, "done", false).items.push(task)
      continue
    }
    if (view.type === "project" && !query.trim()) {
      if (task.later) ensure("later", t("notToday"), "", true).items.push(task)
      else if (task.next) ensure("next", t("nextStep"), "next").items.push(task)
      else if (task.due) ensure(`d-${task.due}`, formatChip(task.due), "").items.push(task)
      else ensure("active", t("further"), "").items.push(task)
      continue
    }
    if (asAll) {
      if (!task.projectId) ensure("inbox", t("inbox"), "").items.push(task)
      else {
        const project = projectById(store, task.projectId)
        const zone = zoneById(store, project?.zone)
        const prefix = zone ? `${zone.name} · ` : ""
        ensure(`p-${task.projectId}`, `${prefix}${project?.name || t("project")}`, "").items.push(task)
      }
      continue
    }
    if (view.type === "today") {
      const project = task.projectId ? projectById(store, task.projectId) : null
      if (isFocusProject(store, project)) {
        const zone = zoneById(store, project.zone)
        ensure(`focus-${project.zone}`, zone?.name || t("inProgress"), "dev").items.push(task)
        continue
      }
      if (task.due < today) ensure("overdue", t("overdue"), "overdue").items.push(task)
      else {
        const zone = zoneById(store, project?.zone)
        ensure(`today-${project?.zone || "none"}`, zone?.name || t("forToday"), "today").items.push(task)
      }
      continue
    }
    if (view.type === "upcoming") {
      if (!task.due) ensure("none", t("noDate"), "", true).items.push(task)
      else ensure(`d-${task.due}`, formatChip(task.due), "").items.push(task)
      continue
    }
    if (task.later) ensure("later", t("notToday"), "", true).items.push(task)
    else if (!task.due) ensure("none", t("noDate"), "", view.type === "upcoming").items.push(task)
    else ensure(`d-${task.due}`, formatChip(task.due), "").items.push(task)
  }

  for (const bucket of buckets.values()) bucket.items = sortItems(bucket.items)

  const order = ["next", "overdue", "today", "dev", "active", "inbox", "none", "later"]
  return [...buckets.values()].sort((a, b) => {
    if (a.key === "done") return 1
    if (b.key === "done") return -1
    if (a.key === "inbox" && b.key.startsWith("p-")) return -1
    if (b.key === "inbox" && a.key.startsWith("p-")) return 1
    const ai = order.indexOf(a.key)
    const bi = order.indexOf(b.key)
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 50 : ai) - (bi === -1 ? 50 : bi)
    return a.key.localeCompare(b.key)
  })
}

export function headerCopy(store, view) {
  if (view.type === "today") {
    return { kicker: formatLong(new Date()), title: t("today") }
  }
  if (view.type === "inbox") {
    return { kicker: t("inboxKicker"), title: t("inbox") }
  }
  if (view.type === "upcoming") {
    const date = view.date ? parseIso(view.date) : new Date()
    return {
      kicker: new Intl.DateTimeFormat(localeTag(), { month: "long", year: "numeric" }).format(date),
      title: t("upcoming"),
    }
  }
  if (view.type === "project") {
    const project = projectById(store, view.id)
    const zone = zoneById(store, project?.zone)
    return {
      kicker: zone?.name || t("project"),
      title: project?.name || t("project"),
    }
  }
  if (view.type === "settings") {
    return { kicker: t("manage"), title: t("sections") }
  }
  if (view.type === "sync") {
    return { kicker: t("syncKicker"), title: t("syncTitle") }
  }
  if (view.type === "archive") {
    return { kicker: t("canRestore"), title: t("archive") }
  }
  return { kicker: t("tracker"), title: t("allTasks") }
}

export function emptyCopy(type) {
  const keys = {
    all: ["emptyAll0", "emptyAll1"],
    today: ["emptyToday0", "emptyToday1"],
    inbox: ["emptyInbox0", "emptyInbox1"],
    upcoming: ["emptyUpcoming0", "emptyUpcoming1"],
    project: ["emptyProject0", "emptyProject1"],
    settings: ["emptySettings0", "emptySettings1"],
    archive: ["emptyArchive0", "emptyArchive1"],
    search: ["emptySearch0", "emptySearch1"],
  }
  const pair = keys[type] || keys.all
  return [t(pair[0]), t(pair[1])]
}
