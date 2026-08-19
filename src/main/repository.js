import { appendFile, copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { app } from "electron"
import { emptyStore, migrate } from "../lib/domain.js"

const repoDir = dirname(fileURLToPath(import.meta.url))

function projectRoot() {
  return dirname(dirname(repoDir))
}

export function dataDir() {
  return app.getPath("userData")
}

export function storePath() {
  return join(dataDir(), "tasks.json")
}

const backupFile = () => join(dataDir(), "tasks.backup.json")
const logFile = () => join(dataDir(), "changes.log")
const historyDir = () => join(dataDir(), "history")

function siblingDataFile() {
  if (app.isPackaged) {
    const appBundle = resolve(dirname(process.execPath), "..", "..")
    return join(dirname(appBundle), "data", "tasks.json")
  }
  return join(projectRoot(), "data", "tasks.json")
}

async function legacyStoreFiles() {
  const home = homedir()
  const support = join(home, "Library/Application Support")
  const candidates = [
    siblingDataFile(),
    join(projectRoot(), "data", "tasks.json"),
    // Folder used before the app was renamed to Task Tracker.
    join(support, "Задачи/tasks.json"),
    join(support, "todo-tracker/tasks.json"),
    join(support, "Electron/tasks.json"),
  ]
  const found = []
  const seen = new Set()
  for (const path of candidates) {
    if (!path || seen.has(path) || path === storePath() || !existsSync(path)) continue
    seen.add(path)
    try {
      found.push({ path, at: (await stat(path)).mtimeMs })
    } catch {
      /* unreadable */
    }
  }
  return found.sort((a, b) => b.at - a.at).map((row) => row.path)
}

function stamp() {
  return new Date().toISOString()
}

function summarize(store) {
  const open = store.tasks.filter((task) => !task.done).length
  const view = store.settings?.lastView
  const viewLabel = view?.type === "project" ? `project:${view.id || "?"}` : (view?.type || "?")
  return `projects=${store.projects.length} tasks=${store.tasks.length} open=${open} view=${viewLabel}`
}

async function ensureDataDir() {
  const dir = dataDir()
  if (!existsSync(dir)) await mkdir(dir, { recursive: true })
  return dir
}

async function logChange(line) {
  try {
    await ensureDataDir()
    await appendFile(logFile(), `${stamp()}  ${line}\n`, "utf8")
  } catch (error) {
    console.error("[task-tracker] log", error)
  }
}

async function readJson(path) {
  return migrate(JSON.parse(await readFile(path, "utf8")))
}

async function snapshotHistory(store) {
  try {
    const dir = historyDir()
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    const day = stamp().slice(0, 10)
    await writeFile(join(dir, `${day}.json`), JSON.stringify(store, null, 2))
  } catch {
    /* ignore */
  }
}

async function copySidecar(fromDir) {
  const oldBackup = join(fromDir, "tasks.backup.json")
  if (existsSync(oldBackup)) {
    try { await copyFile(oldBackup, backupFile()) } catch { /* ignore */ }
  }
}

async function migrateFromLegacy() {
  for (const path of await legacyStoreFiles()) {
    try {
      const store = await readJson(path)
      if (!store.tasks.length && !store.projects.length) continue
      const dest = storePath()
      await ensureDataDir()
      await writeFile(dest, JSON.stringify(store, null, 2))
      await copySidecar(dirname(path))
      await logChange(`migrate  from=${path}  to=${dest}  ${summarize(store)}`)
      return store
    } catch {
      /* try next */
    }
  }
  return null
}

export async function loadStore() {
  const path = storePath()
  try {
    const store = await readJson(path)
    if (!store.tasks.length && !store.projects.length) {
      const migrated = await migrateFromLegacy()
      if (migrated) return migrated
    }
    await logChange(`load  from=${path}  ${summarize(store)}`)
    return store
  } catch {
    const migrated = await migrateFromLegacy()
    if (migrated) return migrated
    const empty = emptyStore()
    await ensureDataDir()
    const tmp = `${path}.tmp`
    await writeFile(tmp, JSON.stringify(empty, null, 2))
    await rename(tmp, path)
    await logChange(`load  empty  created=${path}`)
    return empty
  }
}

export async function saveStore(data) {
  const next = migrate(data)
  const path = storePath()
  await ensureDataDir()
  if (existsSync(path)) {
    try { await copyFile(path, backupFile()) } catch { /* ignore */ }
  }
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(next, null, 2))
  await rename(tmp, path)
  await snapshotHistory(next)
  await logChange(`save  ${summarize(next)}  file=${path}`)
  return next
}
