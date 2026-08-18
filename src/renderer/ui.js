import { DAYS, dowIndex, formatChip, iso, todayIso } from "../lib/dates.js"
import {
  archivedProjects,
  dormantProjects,
  emptyCopy,
  focusProjectsNeedingStep,
  groupTasks,
  headerCopy,
  idleDays,
  nextCandidates,
  nextStep,
  openCount,
  projectById,
  projectsInZone,
  smartCounts,
  visibleTasks,
} from "../lib/selectors.js"
import { isFocusProject, listZones, REPEAT, zoneById } from "../lib/domain.js"
import {
  addNextFromPrompt,
  addProject,
  addZone,
  archiveProject,
  changeProject,
  changeZone,
  completeTask,
  composerDefaults,
  cycleRepeat,
  flashToast,
  markLater,
  pickNext,
  pinNext,
  removeProject,
  removeTask,
  removeZone,
  restoreProject,
  setView,
  shiftWeek,
  shiftZone,
  skipNextPrompt,
  toggleFold,
  togglePause,
  ui,
  updateTask,
} from "./controller.js"
import { el } from "./el.js"

const smartNav = document.getElementById("smart-nav")
const zonesRoot = document.getElementById("zones-root")
const kickerEl = document.getElementById("kicker")
const headingEl = document.getElementById("heading")
const metaEl = document.getElementById("meta")
const weekEl = document.getElementById("week")
const projectHead = document.getElementById("project-head")
const boardEl = document.getElementById("board")
const nextPromptEl = document.getElementById("next-prompt")
const toastEl = document.getElementById("toast")
const input = document.getElementById("task-input")
const dateInput = document.getElementById("task-date")
const hintEl = document.getElementById("composer-hint")
const searchInput = document.getElementById("search")

export function render() {
  renderSmart()
  renderZones()
  document.getElementById("open-settings").classList.toggle("active", ui.view.type === "settings")
  renderHeader()
  renderProjectHead()
  renderWeek()
  renderNextPrompt()
  renderBoard()
  renderToast()
  revealSelected()
}

function tomorrowIso() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return iso(date)
}

function renderSmart() {
  const counts = smartCounts(ui.store)
  const archived = archivedProjects(ui.store).length
  const items = [
    { type: "today", label: "Сегодня", icon: "today", glyph: "✦", count: counts.today },
    { type: "upcoming", label: "Предстоящие", icon: "cal", glyph: "▦", count: counts.upcoming },
    { type: "inbox", label: "Входящие", icon: "inbox", glyph: "◎", hint: "без дома", count: counts.inbox },
    { type: "all", label: "Все", icon: "all", glyph: "☰", count: counts.all },
    { type: "archive", label: "Архив", icon: "all", glyph: "▢", count: archived },
  ].filter((item) => {
    if (item.type === "inbox") return counts.inbox || ui.view.type === "inbox"
    if (item.type === "archive") return archived || ui.view.type === "archive"
    return true
  })
  smartNav.replaceChildren(
    ...items.map((item) => {
      const active = ui.view.type === item.type
      return el("button", {
        type: "button",
        class: `nav-item${active ? " active" : ""}`,
        onClick: () => {
          setView(item.type === "upcoming" ? { type: "upcoming" } : { type: item.type })
          render()
        },
      }, [
        el("span", { class: `icon ${item.icon}` }, [item.glyph]),
        el("span", { class: "nav-copy" }, [
          el("span", {}, [item.label]),
          item.hint ? el("span", { class: "nav-sub" }, [item.hint]) : null,
        ]),
        el("span", { class: "count" }, [item.count || ""]),
      ])
    }),
  )
}

function renderZones() {
  const zones = listZones(ui.store)
  const nodes = []
  for (const zone of zones) {
    const focus = zone.mode === "focus"
    nodes.push(el("div", { class: "block-label" }, [
      el("span", {}, [zone.name]),
      el("span", { class: "zone-mode" }, [focus ? "шаг" : "даты"]),
    ]))
    const nav = el("nav", { class: "projects" })
    const draft = el("div")
    const list = projectsInZone(ui.store, zone.id)
    const items = list.map((project) => {
      const active = ui.view.type === "project" && ui.view.id === project.id
      const step = nextStep(ui.store, project.id)
      const paused = project.status === "paused"
      const idle = idleDays(ui.store, project.id)
      const count = focus
        ? (paused ? "скрыт из Сегодня" : (step ? step.title : "Нужен шаг"))
        : (openCount(ui.store, (task) => task.projectId === project.id && !task.later) || "")
      const pulse = focus && !paused && idle >= 7 ? `${idle} дн. тишина` : null
      return el("div", {
        class: `nav-item${active ? " active" : ""}${paused ? " paused" : ""}`,
        onClick: () => {
          setView({ type: "project", id: project.id })
          render()
        },
      }, [
        el("span", { class: "dot", style: { background: project.color, "--c": project.color } }),
        el("span", { class: "nav-copy" }, [
          el("span", {}, [project.name]),
          focus ? el("span", { class: "nav-sub" }, [pulse || count]) : null,
        ]),
        focus ? null : el("span", { class: "count" }, [count]),
      ])
    })
    if (!items.length) {
      items.push(el("p", { class: "hint" }, [
        focus ? "В Сегодня — только следующий шаг" : "В Сегодня — дела с датой",
      ]))
    }
    nav.replaceChildren(...items)
    nodes.push(nav, draft)
    renderDraft(zone, draft)
    nodes.push(el("button", {
      type: "button",
      class: "new-list",
      onClick: () => {
        ui.addingZone = zone.id
        render()
      },
    }, ["Новый проект"]))
  }
  zonesRoot.replaceChildren(...nodes)
}

function renderDraft(zone, mount) {
  if (ui.addingZone !== zone.id) {
    mount.replaceChildren()
    return
  }
  const field = el("input", {
    placeholder: "Название проекта",
    maxlength: "40",
  })
  field.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      ui.addingZone = null
      render()
    }
    if (event.key === "Enter") {
      event.preventDefault()
      addProject(field.value, zone.id)
      render()
    }
  })
  mount.replaceChildren(el("div", { class: "project-draft" }, [
    el("p", {}, [`Новый проект · ${zone.name}`]),
    field,
  ]))
  queueMicrotask(() => field.focus())
}

function renderHeader() {
  const settings = ui.view.type === "settings"
  const archive = ui.view.type === "archive" && !ui.query.trim()
  const searching = Boolean(ui.query.trim())
  document.getElementById("composer").hidden = settings || archive
  document.querySelector(".date-chips").hidden = settings || archive
  hintEl.hidden = settings || archive
  const { kicker, title } = headerCopy(ui.store, ui.view)
  kickerEl.textContent = searching ? "Везде" : kicker
  if (document.activeElement !== headingEl) headingEl.textContent = searching ? "Поиск" : title
  headingEl.contentEditable = ui.view.type === "project" && !searching ? "true" : "false"
  const remaining = visibleTasks(ui.store, ui.view, ui.query).filter((task) => !task.done).length
  document.querySelector(".top")?.classList.toggle("today-hero", ui.view.type === "today" && !ui.query)
  document.body.classList.toggle("day-closed", ui.view.type === "today" && !remaining && !ui.query)
  if (settings) {
    metaEl.textContent = `${listZones(ui.store).length} разделов`
    if (document.activeElement !== searchInput) searchInput.value = ui.query
    return
  }
  if (archive) {
    metaEl.textContent = `${archivedProjects(ui.store).length || "пусто"}`
    if (document.activeElement !== searchInput) searchInput.value = ui.query
    return
  }
  metaEl.textContent = searching
    ? (remaining ? `${remaining}` : "пусто")
    : remaining
      ? (ui.view.type === "today" ? `Осталось ${remaining}` : `${remaining} открыто`)
      : (ui.view.type === "today" ? "День закрыт" : "Всё закрыто")
  const defaults = composerDefaults()
  if (document.activeElement !== dateInput) dateInput.value = defaults.due || ""
  hintEl.textContent = `Добавить в: ${defaults.label}`
  input.placeholder = ui.view.type === "today"
    ? "Что сделать сегодня?  завтра, пт, +3д"
    : ui.view.type === "inbox"
      ? "Схватить, разложить потом"
      : "Новая задача"
  if (document.activeElement !== searchInput) searchInput.value = ui.query
}

function confirmRemoveProject(project) {
  const open = ui.store.tasks.filter((task) => task.projectId === project.id && !task.done).length
  const extra = open
    ? `Открытые задачи (${open}) не удалятся — они перейдут во Входящие.`
    : "Задач в проекте нет. Пропадёт только сам проект из сайдбара."
  return window.confirm(`Удалить проект «${project.name}»?\n\n${extra}`)
}

function renderProjectHead() {
  if (ui.view.type !== "project") {
    projectHead.hidden = true
    projectHead.replaceChildren()
    return
  }
  const project = ui.store.projects.find((row) => row.id === ui.view.id)
  if (!project) {
    projectHead.hidden = true
    projectHead.replaceChildren()
    return
  }
  projectHead.hidden = false
  const goal = el("input", {
    class: "goal",
    placeholder: "Зачем этот проект",
    maxlength: "4000",
  })
  goal.value = project.goal || ""
  goal.addEventListener("change", () => {
    changeProject(project.id, { goal: goal.value })
  })
  const pause = el("button", {
    type: "button",
    class: "ghost-btn",
    onClick: () => {
      if (project.status === "done") restoreProject(project.id)
      else togglePause(project.id)
      render()
    },
  }, [
    project.status === "done"
      ? "Вернуть из архива"
      : project.status === "paused" ? "Вернуть в Сегодня" : "Скрыть из Сегодня",
  ])
  const more = el("details", { class: "project-more" }, [
    el("summary", {}, ["Ещё"]),
    el("button", {
      type: "button",
      class: "ghost-btn",
      onClick: () => {
        archiveProject(project.id)
        render()
      },
    }, [project.status === "done" ? "Уже в архиве" : "В архив"]),
    el("button", {
      type: "button",
      class: "ghost-btn danger-text",
      onClick: () => {
        if (!confirmRemoveProject(project)) return
        removeProject(project.id)
        render()
      },
    }, ["Удалить проект…"]),
  ])
  projectHead.replaceChildren(el("div", { class: "project-head-row" }, [goal, pause, more]))
}

function renderWeek() {
  const show = ui.view.type === "upcoming"
  weekEl.hidden = !show
  if (!show) {
    weekEl.replaceChildren()
    return
  }
  const selected = ui.view.date || todayIso()
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(ui.weekAnchor)
    date.setDate(date.getDate() + index)
    return date
  })
  weekEl.replaceChildren(
    el("button", { type: "button", class: "week-shift", onClick: () => { shiftWeek(-7); render() } }, ["‹"]),
    ...days.map((date) => {
      const value = iso(date)
      const active = value === selected
      const has = ui.store.tasks.some((task) => !task.done && task.due === value)
      return el("button", {
        type: "button",
        class: `day${active ? " active" : ""}${has ? " has" : ""}`,
        onClick: () => {
          if (value === todayIso()) setView({ type: "today" })
          else setView({ type: "upcoming", date: value })
          render()
        },
      }, [
        el("span", { class: "dow" }, [DAYS[dowIndex(date)]]),
        el("span", { class: "num" }, [String(date.getDate())]),
        el("span", { class: "mark" }),
      ])
    }),
    el("button", { type: "button", class: "week-shift", onClick: () => { shiftWeek(7); render() } }, ["›"]),
  )
}

function fitTitle(field) {
  field.style.height = "auto"
  field.style.height = `${Math.max(22, field.scrollHeight)}px`
}

function renderTask(task) {
  const late = Boolean(task.due && task.due < todayIso() && !task.done)
  const isToday = task.due === todayIso()
  const inProject = Boolean(task.projectId)
  const inProjectView = ui.view.type === "project"
  const project = task.projectId ? projectById(ui.store, task.projectId) : null
  const focus = inProject && isFocusProject(ui.store, project)
  const repeatLabel = task.repeat === "1d" ? "день" : task.repeat === "7d" ? "нед" : task.repeat === "1m" ? "мес" : "повтор"
  const row = el("div", {
    class: `task${task.done ? " done" : ""}${task.next ? " next" : ""}${ui.selectedId === task.id ? " selected" : ""}${task.note ? " has-note" : ""}`,
    dataset: { id: task.id },
    onClick: (event) => {
      const same = ui.selectedId === task.id
      ui.selectedId = task.id
      if (!same && !event.target.closest("input, select, textarea")) render()
    },
  }, [
    el("button", {
      type: "button",
      class: `check${task.done ? " on" : ""}`,
      "aria-label": task.done ? "Вернуть в открытые" : "Отметить сделанной",
      "aria-pressed": String(task.done),
      onClick: (event) => {
        event.preventDefault()
        event.stopPropagation()
        completeTask(task.id)
        render()
      },
    }),
    el("textarea", { class: "title", rows: "1", maxlength: "4000" }),
    el("span", {
      class: `due-label${late ? " late" : isToday ? " today" : ""}${task.due ? "" : " empty"}`,
    }, [formatChip(task.due)]),
    el("div", { class: "tools" }, [
      inProjectView ? null : el("select", { class: "proj" }, [
        el("option", { value: "" }, ["Входящие"]),
        ...ui.store.projects.filter((row) => row.status !== "done").map((row) => {
          const zone = zoneById(ui.store, row.zone)
          return el("option", { value: row.id }, [`${zone ? `${zone.name} · ` : ""}${row.name}`])
        }),
      ]),
      inProjectView && focus ? el("span", { class: "proj-label" }, ["шаг"]) : null,
      el("input", {
        class: `chip${late ? " late" : isToday ? " today" : ""}`,
        type: "date",
        value: task.due || "",
        title: formatChip(task.due),
      }),
      focus ? el("button", {
        type: "button",
        class: `mark-btn${task.next ? " on" : ""}`,
        title: "Следующий шаг в Сегодня",
        onClick: (event) => {
          event.stopPropagation()
          pinNext(task.id)
          render()
        },
      }, [task.next ? "шаг" : "следующим"]) : null,
      el("button", {
        type: "button",
        class: `mark-btn${task.later ? " on" : ""}`,
        title: "Убрать из Сегодня",
        onClick: (event) => {
          event.stopPropagation()
          markLater(task.id)
          render()
        },
      }, ["не сегодня"]),
      task.later ? el("input", {
        class: "chip until",
        type: "date",
        value: task.laterUntil || "",
        title: "Вернуть в этот день",
      }) : null,
      el("button", {
        type: "button",
        class: `mark-btn${task.repeat ? " on" : ""}`,
        title: task.repeat ? REPEAT[task.repeat].label : "Повтор",
        onClick: (event) => {
          event.stopPropagation()
          cycleRepeat(task.id)
          render()
        },
      }, [repeatLabel]),
      el("button", {
        type: "button",
        class: "kill-task",
        title: "Удалить",
        onClick: (event) => {
          event.stopPropagation()
          removeTask(task.id)
          render()
        },
      }, ["✕"]),
    ]),
    el("input", {
      class: "task-note",
      placeholder: "ссылка или короткая заметка",
      maxlength: "4000",
    }),
  ])

  const title = row.querySelector(".title")
  title.value = task.title
  fitTitle(title)
  title.addEventListener("input", () => fitTitle(title))
  title.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      title.blur()
    }
  })
  title.addEventListener("change", () => {
    const next = title.value
    if (!next.trim()) {
      title.value = task.title
      fitTitle(title)
      return
    }
    updateTask(task.id, { title: next })
    render()
  })

  const note = row.querySelector(".task-note")
  note.value = task.note || ""
  note.addEventListener("change", () => {
    updateTask(task.id, { note: note.value })
    render()
  })

  const select = row.querySelector(".proj")
  if (select) {
    select.value = task.projectId || ""
    select.addEventListener("change", () => {
      updateTask(task.id, { projectId: select.value || null, next: false })
      render()
    })
  }

  const due = row.querySelector("input[type=date]:not(.until)")
  due.addEventListener("change", () => {
    updateTask(task.id, { due: due.value || null })
    render()
  })
  row.querySelector(".due-label").addEventListener("click", (event) => {
    event.stopPropagation()
    ui.selectedId = task.id
    if (typeof due.showPicker === "function") due.showPicker()
    else due.focus()
  })

  const until = row.querySelector("input.until")
  if (until) {
    until.addEventListener("change", () => {
      updateTask(task.id, { laterUntil: until.value || null, later: true })
      render()
    })
  }

  return row
}

function renderNeedStep() {
  if (ui.view.type !== "today" || ui.query) return []
  const need = focusProjectsNeedingStep(ui.store).map((project) => el("button", {
    type: "button",
    class: "need-step",
    onClick: () => {
      setView({ type: "project", id: project.id })
      render()
      queueMicrotask(() => input.focus())
    },
  }, [
    el("span", { class: "dot", style: { background: project.color, "--c": project.color } }),
    el("span", {}, [`${project.name} — назначить шаг`]),
  ]))
  const needing = new Set(focusProjectsNeedingStep(ui.store).map((project) => project.id))
  const stale = dormantProjects(ui.store).find((row) => !needing.has(row.project.id))
  if (stale) {
    need.push(el("button", {
      type: "button",
      class: "need-step stale",
      onClick: () => {
        setView({ type: "project", id: stale.project.id })
        render()
      },
    }, [
      el("span", { class: "dot", style: { background: stale.project.color, "--c": stale.project.color } }),
      el("span", {}, [`${stale.project.name} — ${stale.idle} дн. тишина`]),
    ]))
  }
  return need
}

function renderSettings() {
  const zones = listZones(ui.store)
  const cards = zones.map((zone, index) => {
    const name = el("input", { class: "zone-name", maxlength: "28" })
    name.value = zone.name
    name.addEventListener("change", () => {
      const next = name.value.trim()
      if (!next) {
        render()
        return
      }
      changeZone(zone.id, { name: next })
      render()
    })
    const mode = el("select", { class: "zone-rule" }, [
      el("option", { value: "dates" }, ["По датам — в Сегодня, если стоит день"]),
      el("option", { value: "focus" }, ["Один шаг — в Сегодня только следующее действие"]),
    ])
    mode.value = zone.mode
    mode.addEventListener("change", () => {
      changeZone(zone.id, { mode: mode.value })
      render()
    })
    return el("div", { class: "zone-card" }, [
      name,
      mode,
      el("div", { class: "zone-card-actions" }, [
        el("button", {
          type: "button",
          class: "ghost-btn",
          disabled: index === 0,
          onClick: () => { shiftZone(zone.id, -1); render() },
        }, ["↑"]),
        el("button", {
          type: "button",
          class: "ghost-btn",
          disabled: index === zones.length - 1,
          onClick: () => { shiftZone(zone.id, 1); render() },
        }, ["↓"]),
        el("button", {
          type: "button",
          class: "ghost-btn danger-text",
          onClick: () => { removeZone(zone.id); render() },
        }, ["Убрать"]),
      ]),
    ])
  })
  boardEl.replaceChildren(
    el("p", { class: "settings-lead" }, [
      "Разделы — это не папки ради папок. У каждого правило, как задачи попадают в Сегодня. Клиенту не нужны «Быт» и «IT» — поставьте «Бизнес», «Клиенты», «Личное».",
    ]),
    ...cards,
    el("div", { class: "zone-add" }, [
      el("button", {
        type: "button",
        class: "ghost-btn",
        onClick: () => { addZone("Бизнес", "dates"); render() },
      }, ["+ По датам"]),
      el("button", {
        type: "button",
        class: "ghost-btn",
        onClick: () => { addZone("Клиенты", "focus"); render() },
      }, ["+ Один шаг"]),
    ]),
  )
}

function renderArchive() {
  const archived = archivedProjects(ui.store)
  if (!archived.length) {
    const copy = emptyCopy.archive
    boardEl.replaceChildren(el("div", { class: "empty" }, [
      el("strong", {}, [copy[0]]),
      el("span", {}, [copy[1]]),
    ]))
    return
  }
  boardEl.replaceChildren(...archived.map((project) => {
    const open = openCount(ui.store, (task) => task.projectId === project.id)
    return el("div", { class: "archive-card" }, [
      el("span", { class: "dot", style: { background: project.color, "--c": project.color } }),
      el("button", {
        type: "button",
        class: "archive-open",
        onClick: () => {
          setView({ type: "project", id: project.id })
          render()
        },
      }, [
        el("span", {}, [project.name]),
        el("span", { class: "nav-sub" }, [open ? `${open} открыто` : (project.goal || "Задачи на месте")]),
      ]),
      el("button", {
        type: "button",
        class: "ghost-btn",
        onClick: () => {
          restoreProject(project.id)
          render()
        },
      }, ["Вернуть"]),
    ])
  }))
}

function renderBoard() {
  if (ui.view.type === "settings") {
    renderSettings()
    return
  }
  if (ui.view.type === "archive" && !ui.query.trim()) {
    renderArchive()
    return
  }
  const tasks = visibleTasks(ui.store, ui.view, ui.query)
  const need = renderNeedStep()
  if (!tasks.length && !need.length) {
    const copy = ui.query.trim() ? emptyCopy.search : (emptyCopy[ui.view.type] || emptyCopy.all)
    boardEl.replaceChildren(el("div", { class: "empty" }, [
      el("strong", {}, [copy[0]]),
      el("span", {}, [copy[1]]),
    ]))
    return
  }
  const groups = tasks.length ? groupTasks(ui.store, ui.view, tasks, ui.query) : []
  const nodes = []
  if (need.length) {
    nodes.push(el("section", { class: "group" }, [
      el("h2", { class: "dev" }, [`Нужен шаг · ${need.length}`]),
      el("div", { class: "need-list" }, need),
    ]))
  }
  for (const group of groups) {
    const heading = el("h2", { class: group.tone || "" }, [`${group.title} · ${group.items.length}`])
    const list = el("div", { class: "list" }, group.items.map(renderTask))
    const foldable = group.collapsed || group.key === "done"
    const folded = foldable && (ui.folds[group.key] ?? true)
    if (foldable) {
      heading.addEventListener("click", () => {
        toggleFold(group.key)
        render()
      })
      list.hidden = folded
    } else if (group.key.startsWith("p-") && ui.query.trim()) {
      heading.classList.add("jump")
      heading.addEventListener("click", () => {
        ui.query = ""
        setView({ type: "project", id: group.key.slice(2) })
        render()
      })
    }
    nodes.push(el("section", { class: `group${foldable ? " fold" : ""}` }, [heading, list]))
  }
  boardEl.replaceChildren(...nodes)
}

function renderNextPrompt() {
  if (!ui.pendingNext) {
    nextPromptEl.hidden = true
    nextPromptEl.replaceChildren()
    return
  }
  const project = projectById(ui.store, ui.pendingNext.projectId)
  if (!project) {
    skipNextPrompt()
    nextPromptEl.hidden = true
    nextPromptEl.replaceChildren()
    return
  }
  const candidates = nextCandidates(ui.store, project.id)
  nextPromptEl.hidden = false
  const field = el("input", {
    class: "next-field",
    placeholder: "Или напишите новый шаг",
    maxlength: "4000",
  })
  field.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      skipNextPrompt()
      render()
    }
    if (event.key === "Enter") {
      event.preventDefault()
      if (addNextFromPrompt(field.value)) render()
    }
  })
  nextPromptEl.replaceChildren(
    el("p", {}, [`Следующий шаг по «${project.name}»?`]),
    el("div", { class: "next-choices" }, [
      ...candidates.map((task) => el("button", {
        type: "button",
        class: "ghost-btn",
        onClick: () => {
          pickNext(task.id)
          render()
        },
      }, [task.title])),
      field,
      el("button", {
        type: "button",
        class: "ghost-btn",
        onClick: () => {
          skipNextPrompt()
          flashToast("Без шага — проект ждёт")
          render()
        },
      }, ["Пока без шага"]),
    ]),
  )
  queueMicrotask(() => field.focus())
}

function renderToast() {
  if (!ui.toast) {
    toastEl.hidden = true
    toastEl.textContent = ""
    return
  }
  toastEl.hidden = false
  toastEl.textContent = ui.toast.text
  const stamp = ui.toast.at
  window.setTimeout(() => {
    if (ui.toast?.at === stamp) {
      ui.toast = null
      toastEl.hidden = true
    }
  }, 2800)
}

export function revealSelected() {
  document.querySelector(".task.selected")?.scrollIntoView({ block: "nearest", inline: "nearest" })
}

export function focusComposer() {
  input.focus()
  input.select()
}

export function bindChrome({ onAdd, onSearch }) {
  document.getElementById("composer").addEventListener("submit", (event) => {
    event.preventDefault()
    onAdd(input.value, dateInput.value)
    input.value = ""
    focusComposer()
  })
  document.getElementById("chip-today").addEventListener("click", () => {
    dateInput.value = todayIso()
    input.focus()
  })
  document.getElementById("chip-tomorrow").addEventListener("click", () => {
    dateInput.value = tomorrowIso()
    input.focus()
  })
  document.getElementById("chip-none").addEventListener("click", () => {
    dateInput.value = ""
    input.focus()
  })
  searchInput.addEventListener("input", () => onSearch(searchInput.value))
  document.getElementById("open-settings").addEventListener("click", () => {
    setView({ type: "settings" })
    render()
  })
  headingEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      headingEl.blur()
    }
  })
  headingEl.addEventListener("blur", () => {
    if (ui.view.type !== "project") return
    const name = headingEl.textContent
    if (!name.trim()) {
      render()
      return
    }
    changeProject(ui.view.id, { name })
    render()
  })
}
