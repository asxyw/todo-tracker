import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, shell } from "electron"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { copyFile } from "node:fs/promises"
import { dataDir, loadStore, saveStore, storePath } from "./main/repository.js"
import { startLanSync } from "./main/lan-sync.js"
import { smartCounts } from "./lib/selectors.js"
import { locale, setLocale, t } from "./lib/i18n.js"

const root = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

nativeTheme.themeSource = "dark"
app.setName("Task Tracker")
app.setPath("userData", join(homedir(), "Library/Application Support/Задачи"))

let win
let lan

function sendMenu(action, payload) {
  const target = BrowserWindow.getFocusedWindow() || win
  target?.webContents.send("menu", { action, payload })
}

function updateBadge(store) {
  const count = store ? smartCounts(store).today : 0
  app.dock?.setBadge(count ? String(count) : "")
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      role: "appMenu",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: t("settingsShort"), accelerator: "CmdOrCtrl+,", click: () => sendMenu("settings") },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: t("file"),
      submenu: [
        { label: t("newTask"), accelerator: "CmdOrCtrl+N", click: () => sendMenu("new-task") },
        { label: t("newProject"), accelerator: "CmdOrCtrl+Shift+L", click: () => sendMenu("new-project") },
        { label: t("newFocusProject"), accelerator: "CmdOrCtrl+Shift+D", click: () => sendMenu("new-focus-project") },
        { type: "separator" },
        { label: t("settingsShort"), click: () => sendMenu("settings") },
        { type: "separator" },
        {
          label: t("showInFinder"),
          click: () => shell.showItemInFolder(storePath()),
        },
        {
          label: t("exportCopy"),
          click: async () => {
            const { filePath, canceled } = await dialog.showSaveDialog(win, {
              defaultPath: "tasks.json",
              filters: [{ name: "JSON", extensions: ["json"] }],
            })
            if (canceled || !filePath) return
            try { await copyFile(storePath(), filePath) } catch (error) {
              console.error("[задачи] export", error)
            }
          },
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    { role: "editMenu" },
    {
      label: t("view"),
      submenu: [
        { label: t("today"), accelerator: "CmdOrCtrl+1", click: () => sendMenu("view", "today") },
        { label: t("upcoming"), accelerator: "CmdOrCtrl+2", click: () => sendMenu("view", "upcoming") },
        { label: t("inbox"), accelerator: "CmdOrCtrl+3", click: () => sendMenu("view", "inbox") },
        { label: t("all"), accelerator: "CmdOrCtrl+4", click: () => sendMenu("view", "all") },
        { label: t("archive"), accelerator: "CmdOrCtrl+5", click: () => sendMenu("view", "archive") },
        { type: "separator" },
        { label: t("search"), accelerator: "CmdOrCtrl+F", click: () => sendMenu("search") },
      ],
    },
    {
      label: t("taskMenu"),
      submenu: [
        { label: t("undo"), accelerator: "CmdOrCtrl+Shift+Z", click: () => sendMenu("undo") },
        { type: "separator" },
        { label: t("markDone"), accelerator: "CmdOrCtrl+Return", click: () => sendMenu("toggle-done") },
        { label: t("deleteTask"), accelerator: "CmdOrCtrl+Backspace", click: () => sendMenu("delete-task") },
      ],
    },
    { role: "windowMenu" },
  ]))
}

function applyStoreLocale(store) {
  const prev = locale()
  const next = setLocale(store?.settings?.locale)
  if (next !== prev) buildMenu()
  return next
}

async function applyNativeGlass(window) {
  const mark = () => window.webContents.executeJavaScript(
    `document.documentElement.classList.add("native-glass")`,
  ).catch(() => {})
  if (typeof window.setGlassEffect === "function") {
    try {
      const supported = typeof window.isGlassEffectSupported !== "function" || window.isGlassEffectSupported()
      if (supported) {
        window.setGlassEffect({ style: "regular", tintColor: "#141416D0" })
        await mark()
        return true
      }
    } catch (error) {
      console.error("[задачи] setGlassEffect", error)
    }
  }
  try {
    const packed = require("electron-liquid-glass")
    const api = packed?.default || packed
    if (api?.addView) {
      const glassId = api.addView(window.getNativeWindowHandle(), {
        tintColor: "#141416D0",
      })
      if (typeof api.unstable_setScrim === "function" && glassId >= 0) {
        api.unstable_setScrim(glassId, 1)
      }
      await mark()
      return true
    }
  } catch (error) {
    console.error("[задачи] liquid-glass", error)
  }
  return false
}

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 780,
    minHeight: 520,
    title: "Task Tracker",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    transparent: true,
    visualEffectState: "active",
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(root, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  win.setWindowButtonVisibility(true)
  void win.loadFile(join(root, "index.html"))
  win.webContents.on("did-fail-load", (_event, code, desc) => {
    console.error("[задачи] load fail", code, desc)
  })
  win.webContents.on("did-finish-load", async () => {
    const glass = await applyNativeGlass(win)
    if (!glass) win.setVibrancy("under-window")
  })
}

app.whenReady().then(async () => {
  const iconPath = join(root, "..", "build", "icon.png")
  if (existsSync(iconPath)) app.dock?.setIcon(nativeImage.createFromPath(iconPath))
  console.log("[задачи]", app.getVersion(), dataDir())
  const store = await loadStore()
  setLocale(store.settings?.locale)
  updateBadge(store)
  ipcMain.handle("store:load", async () => {
    const next = await loadStore()
    applyStoreLocale(next)
    updateBadge(next)
    return next
  })
  ipcMain.handle("store:save", async (_e, data) => {
    const next = await saveStore(data)
    applyStoreLocale(next)
    updateBadge(next)
    return next
  })
  ipcMain.handle("app:meta", () => ({ version: app.getVersion(), dataDir: dataDir() }))
  ipcMain.handle("app:reveal", () => {
    shell.showItemInFolder(storePath())
  })
  ipcMain.handle("app:locale", (_e, code) => {
    const prev = locale()
    const next = setLocale(code)
    if (next !== prev) buildMenu()
    return next
  })
  buildMenu()
  createWindow()
  lan = startLanSync({
    load: loadStore,
    save: saveStore,
    onMerged: (merged) => {
      applyStoreLocale(merged)
      updateBadge(merged)
      win?.webContents.send("store:sync", merged)
    },
  })
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
