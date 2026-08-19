import { createServer, connect } from "node:net"
import { spawn } from "node:child_process"
import { diffStores, mergeStores, migrate, uid } from "../lib/domain.js"

const PORT = 17841
const SERVICE = "_tasktracker._tcp"
const MAC_NAMES = new Set(["Task Tracker Mac"])

function readFrame(socket, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0)
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error("lan timeout"))
    }, timeoutMs)
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk])
      if (buf.length < 4) return
      const length = buf.readUInt32BE(0)
      if (length <= 0 || length > 8_000_000) {
        cleanup()
        reject(new Error("bad frame"))
        return
      }
      if (buf.length >= 4 + length) {
        cleanup()
        resolve(buf.subarray(4, 4 + length))
      }
    }
    const onError = (error) => {
      cleanup()
      reject(error)
    }
    const cleanup = () => {
      clearTimeout(timer)
      socket.off("data", onData)
      socket.off("error", onError)
    }
    socket.on("data", onData)
    socket.on("error", onError)
  })
}

function writeFrame(socket, payload) {
  const body = Buffer.from(JSON.stringify(payload))
  const header = Buffer.alloc(4)
  header.writeUInt32BE(body.length)
  return new Promise((resolve, reject) => {
    socket.write(Buffer.concat([header, body]), (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function advertise(name) {
  const child = spawn("dns-sd", ["-R", name, SERVICE, "local", String(PORT)], { stdio: "ignore" })
  child.on("error", (error) => console.error("[task-tracker] dns-sd", error))
  return child
}

function isPhoneName(name) {
  if (!name || MAC_NAMES.has(name)) return false
  return /task tracker/i.test(name)
}

function browsePhones(onName) {
  const child = spawn("dns-sd", ["-B", SERVICE, "local"], { stdio: ["ignore", "pipe", "ignore"] })
  const seen = new Set()
  child.stdout.setEncoding("utf8")
  child.stdout.on("data", (chunk) => {
    for (const line of String(chunk).split("\n")) {
      if (!/\bAdd\b/.test(line) || !/_tasktracker\._tcp/i.test(line)) continue
      const name = line.replace(/^.*_tasktracker\._tcp\.\s+/i, "").trim()
      if (!isPhoneName(name) || seen.has(name)) continue
      seen.add(name)
      onName(name)
    }
  })
  child.on("error", (error) => console.error("[task-tracker] dns-sd browse", error))
  return child
}

function resolveService(name) {
  return new Promise((resolve) => {
    const child = spawn("dns-sd", ["-L", name, SERVICE, "local"], { stdio: ["ignore", "pipe", "ignore"] })
    let buf = ""
    const finish = (value) => {
      clearTimeout(timer)
      child.kill()
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), 4000)
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      buf += chunk
      const hit = buf.match(/can be reached at ([^\s]+):(\d+)/i)
      if (!hit) return
      finish({ host: hit[1].replace(/\.$/, ""), port: Number(hit[2]) })
    })
    child.on("error", () => finish(null))
  })
}

function storeFingerprint(store) {
  return JSON.stringify({
    t: (store?.tasks || []).map((row) => [row.id, row.updatedAt, row.done, row.urgentUntil, row.urgentAlert]),
    p: (store?.projects || []).map((row) => [row.id, row.updatedAt, row.status, row.name]),
    d: store?.deleted || {},
    s: store?.settings || {},
  })
}

async function applyMerge({ save, onMerged, local, incoming }) {
  const merged = mergeStores(local, incoming)
  if (storeFingerprint(merged) === storeFingerprint(local)) return local
  const diff = diffStores(local, incoming)
  await save(merged)
  onMerged?.(merged, diff)
  return merged
}

async function exchange(socket, { load, save, onMerged, getDeviceId }) {
  const local = await load()
  const deviceId = getDeviceId(local)
  await writeFrame(socket, { deviceId, store: local })
  const raw = await readFrame(socket)
  const envelope = JSON.parse(raw.toString("utf8"))
  if (!envelope?.store || envelope.deviceId === deviceId) return
  await applyMerge({ load, save, onMerged, local, incoming: migrate(envelope.store) })
}

export function startLanSync({ load, save, onMerged }) {
  let deviceId = ""
  const getDeviceId = (store) => {
    deviceId = store?.settings?.deviceId || deviceId || uid()
    return deviceId
  }

  const server = createServer(async (socket) => {
    try {
      const raw = await readFrame(socket)
      const envelope = JSON.parse(raw.toString("utf8"))
      if (!envelope?.store) return
      const local = await load()
      const id = getDeviceId(local)
      if (envelope.deviceId && envelope.deviceId === id) return
      const incoming = migrate(envelope.store)
      const merged = await applyMerge({ load, save, onMerged, local, incoming })
      await writeFrame(socket, { deviceId: id, store: merged })
    } catch (error) {
      console.error("[task-tracker] lan", error)
    } finally {
      socket.end()
    }
  })
  server.listen(PORT)
  server.on("error", (error) => console.error("[task-tracker] lan listen", error))

  const ads = [advertise("Task Tracker Mac")]

  const inflight = new Set()
  const pending = new Set()
  const pullPhone = async (name) => {
    if (inflight.has(name)) {
      pending.add(name)
      return
    }
    inflight.add(name)
    const target = await resolveService(name)
    if (!target) {
      inflight.delete(name)
      if (pending.has(name)) {
        pending.delete(name)
        void pullPhone(name)
      }
      return
    }
    const socket = connect({ port: target.port, host: target.host })
    try {
      await new Promise((resolve, reject) => {
        socket.once("connect", resolve)
        socket.once("error", reject)
        setTimeout(() => reject(new Error("connect timeout")), 4000)
      })
      await exchange(socket, { load, save, onMerged, getDeviceId })
    } catch (error) {
      console.error("[task-tracker] lan phone", name, error.message)
    } finally {
      socket.end()
      inflight.delete(name)
      if (pending.has(name)) {
        pending.delete(name)
        void pullPhone(name)
      }
    }
  }

  const phones = new Set()
  const browser = browsePhones((name) => {
    phones.add(name)
    void pullPhone(name)
  })
  const timer = setInterval(() => {
    for (const name of phones) void pullPhone(name)
  }, 6000)

  return {
    pushNow: () => {
      for (const name of phones) void pullPhone(name)
    },
    stop: () => {
      clearInterval(timer)
      server.close()
      ads.forEach((child) => child.kill())
      browser.kill()
    },
  }
}
