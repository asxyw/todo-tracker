import {
  addTask,
  completeSelected,
  cycleRepeat,
  firstZoneId,
  loadInto,
  markLater,
  moveSelection,
  nudgeSelectedDue,
  pinNext,
  removeSelected,
  setSelectedDue,
  setView,
  skipNextPrompt,
  ui,
  undo,
} from "./controller.js"
import { bindChrome, focusComposer, render } from "./ui.js"
import { addDaysIso, todayIso } from "../lib/dates.js"
import { syncDiffCount } from "../lib/domain.js"
import { t } from "../lib/i18n.js"

function isField(target) {
  return target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable='true']")
}

window.tasksApi.onFullscreen((on) => {
  document.documentElement.classList.toggle("is-fullscreen", Boolean(on))
})

bindChrome({
  onAdd: (title, due) => {
    const extra = {}
    if (ui.urgentMinutes) {
      extra.urgentUntil = Date.now() + ui.urgentMinutes * 60 * 1000
      extra.urgentAlert = ui.urgentAlert || "push"
    }
    if (addTask(title, due || null, extra)) {
      ui.urgentMinutes = null
      ui.urgentAlert = "push"
      ui.urgentPickCustom = false
      render()
    }
  },
  onSearch: (query) => {
    ui.query = query
    render()
  },
})

window.addEventListener("keydown", (event) => {
  const meta = event.metaKey || event.ctrlKey
  if (event.key === "Escape" && ui.pendingNext) {
    event.preventDefault()
    skipNextPrompt()
    render()
    return
  }
  if (meta && event.key.toLowerCase() === "z" && !event.shiftKey && !isField(event.target)) {
    event.preventDefault()
    if (undo()) render()
  }
  if (meta && event.key.toLowerCase() === "f") {
    event.preventDefault()
    document.getElementById("search").focus()
  }
  if (meta && event.key === ",") {
    event.preventDefault()
    setView({ type: "settings" })
    render()
  }
  if (isField(event.target) || meta) return
  if (event.code === "KeyJ" || event.key === "ArrowDown") {
    event.preventDefault()
    moveSelection(1)
    render()
    return
  }
  if (event.code === "KeyK" || event.key === "ArrowUp") {
    event.preventDefault()
    moveSelection(-1)
    render()
    return
  }
  if (event.code === "Space" && ui.selectedId) {
    event.preventDefault()
    completeSelected()
    render()
    return
  }
  if (!ui.selectedId) return
  if (event.code === "KeyT") {
    event.preventDefault()
    if (setSelectedDue(todayIso())) render()
  }
  if (event.code === "KeyM") {
    event.preventDefault()
    if (setSelectedDue(addDaysIso(todayIso(), 1))) render()
  }
  if (event.code === "KeyW") {
    event.preventDefault()
    if (nudgeSelectedDue(7)) render()
  }
  if (event.key === "]" || event.key === ".") {
    event.preventDefault()
    if (nudgeSelectedDue(1)) render()
  }
  if (event.key === "[" || event.key === ",") {
    event.preventDefault()
    if (nudgeSelectedDue(-1)) render()
  }
  if (event.key === "0") {
    event.preventDefault()
    if (setSelectedDue(null)) render()
  }
  if (event.code === "KeyN") {
    event.preventDefault()
    pinNext(ui.selectedId)
    render()
  }
  if (event.code === "KeyL") {
    event.preventDefault()
    markLater(ui.selectedId)
    render()
  }
  if (event.code === "KeyR") {
    event.preventDefault()
    cycleRepeat(ui.selectedId)
    render()
  }
  if (event.code === "KeyE") {
    event.preventDefault()
    document.querySelector(".task.selected .title")?.focus()
  }
})

window.tasksApi.onMenu(({ action, payload }) => {
  if (action === "new-task") {
    ui.addingZone = null
    render()
    focusComposer()
  }
  if (action === "new-project") {
    ui.addingZone = firstZoneId("dates") || firstZoneId()
    render()
  }
  if (action === "new-focus-project") {
    ui.addingZone = firstZoneId("focus") || firstZoneId()
    render()
  }
  if (action === "settings") {
    setView({ type: "settings" })
    render()
  }
  if (action === "sync") {
    setView({ type: "sync" })
    render()
  }
  if (action === "toggle-done") {
    completeSelected()
    render()
  }
  if (action === "delete-task") {
    removeSelected()
    render()
  }
  if (action === "undo") {
    if (undo()) render()
  }
  if (action === "search") document.getElementById("search").focus()
  if (action === "view") {
    setView(payload === "upcoming" ? { type: "upcoming" } : { type: payload })
    render()
    focusComposer()
  }
})

Promise.all([window.tasksApi.load(), window.tasksApi.meta()]).then(([data, meta]) => {
  const versionEl = document.getElementById("app-version")
  versionEl.hidden = false
  versionEl.textContent = meta.version
  versionEl.dataset.dir = meta.dataDir
  versionEl.title = t("versionTip", { dir: meta.dataDir })
  versionEl.addEventListener("click", () => window.tasksApi.reveal())
  loadInto(data)
  render()
  focusComposer()
  window.Notification?.requestPermission?.()
  window.tasksApi.onSync((payload) => {
    const next = payload?.store || payload
    loadInto(next, { keepView: true })
    if (payload?.diff && syncDiffCount(payload.diff)) {
      ui.syncDiff = payload.diff
      if (ui.view.type !== "sync") {
        ui.toast = { text: t("syncReviewToast"), at: Date.now(), openSync: true }
      }
    }
    render()
  })
  let day = todayIso()
  window.setInterval(() => {
    const next = todayIso()
    if (next !== day) {
      day = next
      render()
    }
  }, 60_000)
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) render()
  })
}).catch((error) => {
  const pre = document.createElement("pre")
  pre.style.cssText = "margin:64px 20px 0;color:#ff8b80;white-space:pre-wrap"
  pre.textContent = String(error?.stack || error)
  document.body.prepend(pre)
})
