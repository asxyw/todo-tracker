import { formatChip, formatLong, iso, parseIso, todayIso } from "./dates.js"
import { isFocusProject, listZones, zoneById } from "./domain.js"

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
  if (view.type === "today") return { projectId: null, due: todayIso(), label: "Сегодня" }
  if (view.type === "inbox") return { projectId: null, due: null, label: "Входящие" }
  if (view.type === "upcoming") return { projectId: null, due: view.date, label: `Предстоящие · ${formatChip(view.date)}` }
  if (view.type === "project") {
    const project = store ? projectById(store, view.id) : null
    return { projectId: view.id, due: null, label: project?.name || "этот проект" }
  }
  return { projectId: null, due: null, label: "Входящие" }
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
      const title = view.type === "today" ? "Выполнено сегодня" : "Выполненные"
      ensure("done", title, "done", false).items.push(task)
      continue
    }
    if (view.type === "project" && !query.trim()) {
      if (task.later) ensure("later", "Не сегодня", "", true).items.push(task)
      else if (task.next) ensure("next", "Следующий шаг", "next").items.push(task)
      else if (task.due) ensure(`d-${task.due}`, formatChip(task.due), "").items.push(task)
      else ensure("active", "Дальше", "").items.push(task)
      continue
    }
    if (asAll) {
      if (!task.projectId) ensure("inbox", "Входящие", "").items.push(task)
      else {
        const project = projectById(store, task.projectId)
        const zone = zoneById(store, project?.zone)
        const prefix = zone ? `${zone.name} · ` : ""
        ensure(`p-${task.projectId}`, `${prefix}${project?.name || "Проект"}`, "").items.push(task)
      }
      continue
    }
    if (view.type === "today") {
      const project = task.projectId ? projectById(store, task.projectId) : null
      if (isFocusProject(store, project)) {
        const zone = zoneById(store, project.zone)
        ensure(`focus-${project.zone}`, zone?.name || "В работе", "dev").items.push(task)
        continue
      }
      if (task.due < today) ensure("overdue", "Просрочено", "overdue").items.push(task)
      else {
        const zone = zoneById(store, project?.zone)
        ensure(`today-${project?.zone || "none"}`, zone?.name || "На сегодня", "today").items.push(task)
      }
      continue
    }
    if (view.type === "upcoming") {
      if (!task.due) ensure("none", "Без даты", "", true).items.push(task)
      else ensure(`d-${task.due}`, formatChip(task.due), "").items.push(task)
      continue
    }
    if (task.later) ensure("later", "Не сегодня", "", true).items.push(task)
    else if (!task.due) ensure("none", "Без даты", "", view.type === "upcoming").items.push(task)
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
    return { kicker: formatLong(new Date()), title: "Сегодня" }
  }
  if (view.type === "inbox") {
    return { kicker: "Ещё не в проекте", title: "Входящие" }
  }
  if (view.type === "upcoming") {
    const date = view.date ? parseIso(view.date) : new Date()
    return {
      kicker: new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date),
      title: "Предстоящие",
    }
  }
  if (view.type === "project") {
    const project = projectById(store, view.id)
    const zone = zoneById(store, project?.zone)
    return {
      kicker: zone?.name || "Проект",
      title: project?.name || "Проект",
    }
  }
  if (view.type === "settings") {
    return { kicker: "Управление", title: "Разделы" }
  }
  if (view.type === "archive") {
    return { kicker: "Можно вернуть", title: "Архив" }
  }
  return { kicker: "Трекер", title: "Все задачи" }
}

export const emptyCopy = {
  all: ["Пока нет задач", "Напишите задачу сверху и нажмите Enter."],
  today: ["День открыт", "Дело с датой останется здесь. Проекты с правилом «один шаг» появятся, когда шаг назначен."],
  inbox: ["Входящие пусты — так и должно быть", "Сюда — мысли без раздела. Они не лезут в Сегодня, пока не дадите дату или проект."],
  upcoming: ["Впереди пусто", "Поставьте дату на задаче или выберите день в ленте."],
  project: ["В проекте пока пусто", "Первая задача станет следующим шагом, если у раздела правило «один шаг»."],
  settings: ["Разделы", "Добавьте Быт, Бизнес, Клиентов — как вам удобно. Правило одно: даты или один шаг."],
  archive: ["Архив пуст", "Скрытые проекты живут здесь. Задачи не удаляются."],
  search: ["Ничего не нашлось", "Ищем по названиям, заметкам и проектам."],
}
