import { dowIndex, formatChip, iso, todayIso } from "../lib/dates.js"
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
import { activeUrgent, isFocusProject, listZones, syncDiffCount, zoneById } from "../lib/domain.js"
import { locale, t, weekdays, repeatCaption, repeatShort } from "../lib/i18n.js"
import {
  addNextFromPrompt,
  addProject,
  addZone,
  applyLocale,
  archiveProject,
  changeProject,
  changeZone,
  completeTask,
  clearUrgentTask,
  composerDefaults,
  cycleRepeat,
  flashToast,
  keepSyncItem,
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
  applyChrome()
  renderSmart()
  renderZones()
  document.getElementById("open-settings").classList.toggle("active", ui.view.type === "settings")
  document.getElementById("sync-open")?.classList.toggle("active", ui.view.type === "sync")
  document.getElementById("sync-open")?.classList.toggle("has-changes", Boolean(syncDiffCount(ui.syncDiff)))
  renderHeader()
  renderProjectHead()
  renderWeek()
  renderNextPrompt()
  renderBoard()
  renderUrgentBanner()
  renderToast()
  revealSelected()
}

function applyChrome() {
  document.documentElement.lang = locale()
  const settingsBtn = document.getElementById("open-settings")
  if (settingsBtn) settingsBtn.textContent = t("settings")
  const syncBtn = document.getElementById("sync-open")
  if (syncBtn) syncBtn.textContent = t("syncTitle")
  searchInput.placeholder = t("search")
  const todayChip = document.getElementById("chip-today")
  const tomorrowChip = document.getElementById("chip-tomorrow")
  const noneChip = document.getElementById("chip-none")
  if (todayChip) todayChip.textContent = t("today")
  if (tomorrowChip) tomorrowChip.textContent = t("tomorrow")
  if (noneChip) noneChip.textContent = t("noDate")
  const urgentChips = document.getElementById("urgent-chips")
  urgentChips?.querySelectorAll("[data-urgent]").forEach((btn) => {
    const minutes = Number(btn.dataset.urgent)
    btn.textContent = minutes === 30 ? t("urgent30") : minutes === 60 ? t("urgent1h") : t("urgent2h")
    btn.classList.toggle("active", ui.urgentMinutes === minutes)
  })
  urgentChips?.querySelectorAll("[data-alert]").forEach((btn) => {
    btn.textContent = btn.dataset.alert === "island" ? t("urgentIsland") : t("urgentPush")
    btn.classList.toggle("active", ui.urgentMinutes && ui.urgentAlert === btn.dataset.alert)
    btn.hidden = !ui.urgentMinutes
  })
  const urgentClear = document.getElementById("urgent-clear")
  if (urgentClear) urgentClear.textContent = t("urgentStop")
  const addBtn = document.querySelector(".add-btn")
  if (addBtn) addBtn.textContent = t("add")
  dateInput.setAttribute("aria-label", t("date"))
  const versionEl = document.getElementById("app-version")
  if (versionEl?.dataset.dir) versionEl.title = t("versionTip", { dir: versionEl.dataset.dir })
  document.getElementById("lang-switch")?.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === locale())
  })
}

function tomorrowIso() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return iso(date)
}

export function formatUrgentLeft(until, now = Date.now()) {
  const ms = until - now
  if (ms <= 0) return t("urgentNow")
  const minutes = Math.max(1, Math.ceil(ms / 60000))
  if (minutes < 60) return t("urgentMin", { n: minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? t("urgentHourMin", { h: hours, m: rest }) : t("urgentHour", { h: hours })
}

function renderUrgentBanner() {
  const banner = document.getElementById("urgent-banner")
  if (!banner) return
  const [task] = activeUrgent(ui.store)
  if (!task) {
    banner.hidden = true
    banner.dataset.until = ""
    return
  }
  banner.hidden = false
  banner.dataset.until = String(task.urgentUntil)
  document.getElementById("urgent-banner-copy").textContent = task.title
  document.getElementById("urgent-banner-time").textContent = formatUrgentLeft(task.urgentUntil)
}

function renderSmart() {
  const counts = smartCounts(ui.store)
  const archived = archivedProjects(ui.store).length
  const items = [
    { type: "today", label: t("today"), icon: "today", glyph: "✦", count: counts.today },
    { type: "upcoming", label: t("upcoming"), icon: "cal", glyph: "▦", count: counts.upcoming },
    { type: "inbox", label: t("inbox"), icon: "inbox", glyph: "◎", hint: t("inboxHint"), count: counts.inbox },
    { type: "all", label: t("all"), icon: "all", glyph: "☰", count: counts.all },
    { type: "archive", label: t("archive"), icon: "all", glyph: "▢", count: archived },
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
      el("span", { class: "zone-mode" }, [focus ? t("step") : t("dates")]),
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
        ? (paused ? t("hiddenFromToday") : (step ? step.title : t("needAStep")))
        : (openCount(ui.store, (task) => task.projectId === project.id && !task.later) || "")
      const pulse = focus && !paused && idle >= 7 ? t("idlePulse", { n: idle }) : null
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
        focus ? t("focusRule") : t("datesRule"),
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
    }, [t("newProject")]))
  }
  zonesRoot.replaceChildren(...nodes)
}

function renderDraft(zone, mount) {
  if (ui.addingZone !== zone.id) {
    mount.replaceChildren()
    return
  }
  const field = el("input", {
    placeholder: t("projectName"),
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
    el("p", {}, [t("newProjectZone", { name: zone.name })]),
    field,
  ]))
  queueMicrotask(() => field.focus())
}

function renderHeader() {
  const settings = ui.view.type === "settings"
  const syncing = ui.view.type === "sync"
  const archive = ui.view.type === "archive" && !ui.query.trim()
  const searching = Boolean(ui.query.trim())
  document.getElementById("composer").hidden = settings || syncing || archive
  document.querySelector(".date-chips").hidden = settings || syncing || archive
  document.getElementById("urgent-chips").hidden = settings || syncing || archive
  hintEl.hidden = settings || syncing || archive
  const { kicker, title } = headerCopy(ui.store, ui.view)
  kickerEl.textContent = searching ? t("everywhere") : kicker
  if (document.activeElement !== headingEl) headingEl.textContent = searching ? t("searchTitle") : title
  headingEl.contentEditable = ui.view.type === "project" && !searching ? "true" : "false"
  const remaining = visibleTasks(ui.store, ui.view, ui.query).filter((task) => !task.done).length
  document.querySelector(".top")?.classList.toggle("today-hero", ui.view.type === "today" && !ui.query)
  document.body.classList.toggle("day-closed", ui.view.type === "today" && !remaining && !ui.query)
  if (settings) {
    metaEl.textContent = t("sectionsCount", { n: listZones(ui.store).length })
    if (document.activeElement !== searchInput) searchInput.value = ui.query
    return
  }
  if (syncing) {
    const n = syncDiffCount(ui.syncDiff)
    metaEl.textContent = n ? String(n) : t("empty")
    if (document.activeElement !== searchInput) searchInput.value = ui.query
    return
  }
  if (archive) {
    metaEl.textContent = `${archivedProjects(ui.store).length || t("empty")}`
    if (document.activeElement !== searchInput) searchInput.value = ui.query
    return
  }
  metaEl.textContent = searching
    ? (remaining ? `${remaining}` : t("empty"))
    : remaining
      ? (ui.view.type === "today" ? t("remaining", { n: remaining }) : t("openCount", { n: remaining }))
      : (ui.view.type === "today" ? t("dayClosed") : t("allClosed"))
  const defaults = composerDefaults()
  if (document.activeElement !== dateInput) dateInput.value = defaults.due || ""
  hintEl.textContent = t("addTo", { label: defaults.label })
  input.placeholder = ui.view.type === "today"
    ? t("placeholderToday")
    : ui.view.type === "inbox"
      ? t("placeholderInbox")
      : t("placeholderTask")
  if (document.activeElement !== searchInput) searchInput.value = ui.query
}

function confirmRemoveProject(project) {
  const open = ui.store.tasks.filter((task) => task.projectId === project.id && !task.done).length
  const extra = open
    ? t("deleteProjectTasks", { n: open })
    : t("deleteProjectEmpty")
  return window.confirm(`${t("deleteProjectTitle", { name: project.name })}\n\n${extra}`)
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
    placeholder: t("whyProject"),
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
      ? t("restoreArchive")
      : project.status === "paused" ? t("restoreToday") : t("hideToday"),
  ])
  const more = el("details", { class: "project-more" }, [
    el("summary", {}, [t("more")]),
    el("button", {
      type: "button",
      class: "ghost-btn",
      onClick: () => {
        archiveProject(project.id)
        render()
      },
    }, [project.status === "done" ? t("alreadyArchived") : t("toArchive")]),
    el("button", {
      type: "button",
      class: "ghost-btn danger-text",
      onClick: () => {
        if (!confirmRemoveProject(project)) return
        removeProject(project.id)
        render()
      },
    }, [t("deleteProject")]),
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
        el("span", { class: "dow" }, [weekdays()[dowIndex(date)]]),
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
  const repeatLabel = repeatShort(task.repeat)
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
      "aria-label": task.done ? t("markOpen") : t("markComplete"),
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
        el("option", { value: "" }, [t("inbox")]),
        ...ui.store.projects.filter((row) => row.status !== "done").map((row) => {
          const zone = zoneById(ui.store, row.zone)
          return el("option", { value: row.id }, [`${zone ? `${zone.name} · ` : ""}${row.name}`])
        }),
      ]),
      inProjectView && focus ? el("span", { class: "proj-label" }, [t("step")]) : null,
      el("input", {
        class: `chip${late ? " late" : isToday ? " today" : ""}`,
        type: "date",
        value: task.due || "",
        title: formatChip(task.due),
      }),
      focus ? el("button", {
        type: "button",
        class: `mark-btn${task.next ? " on" : ""}`,
        title: t("nextToday"),
        onClick: (event) => {
          event.stopPropagation()
          pinNext(task.id)
          render()
        },
      }, [task.next ? t("step") : t("next")]) : null,
      el("button", {
        type: "button",
        class: `mark-btn${task.later ? " on" : ""}`,
        title: t("hideFromToday"),
        onClick: (event) => {
          event.stopPropagation()
          markLater(task.id)
          render()
        },
      }, [t("laterChip")]),
      task.later ? el("input", {
        class: "chip until",
        type: "date",
        value: task.laterUntil || "",
        title: t("backToDay"),
      }) : null,
      el("button", {
        type: "button",
        class: `mark-btn${task.repeat ? " on" : ""}`,
        title: task.repeat ? repeatCaption(task.repeat) : t("repeat"),
        onClick: (event) => {
          event.stopPropagation()
          cycleRepeat(task.id)
          render()
        },
      }, [repeatLabel]),
      el("button", {
        type: "button",
        class: "kill-task",
        title: t("remove"),
        onClick: (event) => {
          event.stopPropagation()
          removeTask(task.id)
          render()
        },
      }, ["✕"]),
    ]),
    el("input", {
      class: "task-note",
      placeholder: t("notePlaceholder"),
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
    el("span", {}, [t("assignStep", { name: project.name })]),
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
      el("span", {}, [t("idleDays", { name: stale.project.name, n: stale.idle })]),
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
      el("option", { value: "dates" }, [t("modeDates")]),
      el("option", { value: "focus" }, [t("modeFocus")]),
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
        }, [t("removeZone")]),
      ]),
    ])
  })
  boardEl.replaceChildren(
    el("p", { class: "settings-lead" }, [
      t("settingsLead"),
    ]),
    ...cards,
    el("div", { class: "zone-add" }, [
      el("button", {
        type: "button",
        class: "ghost-btn",
        onClick: () => { addZone(t("presetDates"), "dates"); render() },
      }, [t("addByDates")]),
      el("button", {
        type: "button",
        class: "ghost-btn",
        onClick: () => { addZone(t("presetFocus"), "focus"); render() },
      }, [t("addOneStep")]),
    ]),
  )
}

function syncGroup(title, rows, kind, keepable) {
  if (!rows?.length) return []
  return [
    el("p", { class: "block-label" }, [el("span", {}, [title])]),
    ...rows.map((row) => el("div", { class: "sync-row" }, [
      el("span", { class: "sync-row-title" }, [row.title || t("untitledTask")]),
      keepable
        ? el("button", {
          type: "button",
          class: "ghost-btn",
          onClick: () => {
            keepSyncItem(row, kind)
            render()
          },
        }, [t("syncKeepMac")])
        : null,
    ].filter(Boolean))),
  ]
}

function renderSync() {
  const diff = ui.syncDiff
  const count = syncDiffCount(diff)
  if (!count) {
    boardEl.replaceChildren(
      el("p", { class: "settings-lead" }, [t("syncLead")]),
      el("p", { class: "sync-quiet" }, [t("syncQuiet")]),
    )
    return
  }
  boardEl.replaceChildren(
    el("p", { class: "settings-lead" }, [t("syncLead")]),
    ...syncGroup(t("syncAddedHere"), diff.addedHere, "task", false),
    ...syncGroup(t("syncAddedThere"), diff.addedThere, "task", false),
    ...syncGroup(t("syncDeletedThere"), diff.deletedThere, "task", true),
    ...syncGroup(t("syncDeletedHere"), diff.deletedHere, "task", false),
    ...syncGroup(t("syncAddedHere"), diff.addedProjectsHere, "project", false),
    ...syncGroup(t("syncAddedThere"), diff.addedProjectsThere, "project", false),
    ...syncGroup(t("syncDeletedThere"), diff.deletedProjectsThere, "project", true),
    ...syncGroup(t("syncDeletedHere"), diff.deletedProjectsHere, "project", false),
  )
}

function renderArchive() {
  const archived = archivedProjects(ui.store)
  if (!archived.length) {
    const copy = emptyCopy("archive")
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
        el("span", { class: "nav-sub" }, [open ? t("openLabel", { n: open }) : (project.goal || t("tasksInPlace"))]),
      ]),
      el("button", {
        type: "button",
        class: "ghost-btn",
        onClick: () => {
          restoreProject(project.id)
          render()
        },
      }, [t("restore")]),
    ])
  }))
}

function renderBoard() {
  if (ui.view.type === "settings") {
    renderSettings()
    return
  }
  if (ui.view.type === "sync") {
    renderSync()
    return
  }
  if (ui.view.type === "archive" && !ui.query.trim()) {
    renderArchive()
    return
  }
  const tasks = visibleTasks(ui.store, ui.view, ui.query)
  const need = renderNeedStep()
  if (!tasks.length && !need.length) {
    const copy = ui.query.trim() ? emptyCopy("search") : emptyCopy(ui.view.type)
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
      el("h2", { class: "dev" }, [t("needStep", { n: need.length })]),
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
    placeholder: t("writeStep"),
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
    el("p", {}, [t("nextFor", { name: project.name })]),
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
          flashToast(t("skipStepToast"))
          render()
        },
      }, [t("skipStep")]),
    ]),
  )
  queueMicrotask(() => field.focus())
}

function renderToast() {
  if (!ui.toast) {
    toastEl.hidden = true
    toastEl.textContent = ""
    toastEl.onclick = null
    toastEl.classList.remove("is-action")
    return
  }
  toastEl.hidden = false
  toastEl.textContent = ui.toast.text
  toastEl.classList.toggle("is-action", Boolean(ui.toast.openSync))
  const stamp = ui.toast.at
  const openSync = ui.toast.openSync
  toastEl.onclick = openSync
    ? () => {
      ui.toast = null
      toastEl.hidden = true
      setView({ type: "sync" })
      render()
    }
    : null
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
  document.getElementById("urgent-chips")?.addEventListener("click", (event) => {
    const minutesBtn = event.target.closest("[data-urgent]")
    if (minutesBtn) {
      const minutes = Number(minutesBtn.dataset.urgent)
      ui.urgentMinutes = ui.urgentMinutes === minutes ? null : minutes
      if (ui.urgentMinutes && !ui.urgentAlert) ui.urgentAlert = "push"
      render()
      return
    }
    const alertBtn = event.target.closest("[data-alert]")
    if (!alertBtn || !ui.urgentMinutes) return
    ui.urgentAlert = alertBtn.dataset.alert
    render()
  })
  document.getElementById("urgent-clear")?.addEventListener("click", () => {
    const [task] = activeUrgent(ui.store)
    if (!task) return
    clearUrgentTask(task.id)
    render()
  })
  searchInput.addEventListener("input", () => onSearch(searchInput.value))
  document.getElementById("open-settings").addEventListener("click", () => {
    setView({ type: "settings" })
    render()
  })
  document.getElementById("sync-open")?.addEventListener("click", () => {
    setView({ type: "sync" })
    render()
  })
  document.getElementById("lang-switch")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-lang]")
    if (!btn) return
    applyLocale(btn.dataset.lang)
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
