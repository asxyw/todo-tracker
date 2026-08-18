import { createServer, connect } from "node:net"
import { spawn } from "node:child_process"
import { diffStores, mergeStores, migrate, uid } from "../lib/domain.js"

const PORT = 17841
const SERVICE = "_zadachi._tcp"
const MAC_NAMES = new Set(["Задачи Mac", "Task Tracker Mac"])

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
  child.on("error", (error) => console.error("[задачи] dns-sd", error))
  return child
}

function isPhoneName(name) {
  if (!name || MAC_NAMES.has(name)) return false
  return /task tracker/i.test(name) || /задачи/i.test(name)
}

function browsePhones(onName) {
  const child = spawn("dns-sd", ["-B", SERVICE, "local"], { stdio: ["ignore", "pipe", "ignore"] })
  const seen = new Set()
  child.stdout.setEncoding("utf8")
  child.stdout.on("data", (chunk) => {
    for (const line of String(chunk).split("\n")) {
      if (!/\bAdd\b/.test(line) || !/_zadachi\._tcp/i.test(line)) continue
      const name = line.replace(/^.*_zadachi\._tcp\.\s+/i, "").trim()
      if (!isPhoneName(name) || seen.has(name)) continue
      seen.add(name)
      onName(name)
    }
  })
  child.on("error", (error) => console.error("[задачи] dns-sd browse", error))
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

async function exchange(socket, { load, save, onMerged, getDeviceId }) {
  const local = await load()
  const deviceId = getDeviceId(local)
  await writeFrame(socket, { deviceId, store: local })
  const raw = await readFrame(socket)
  const envelope = JSON.parse(raw.toString("utf8"))
  if (!envelope?.store || envelope.deviceId === deviceId) return
  const merged = mergeStores(local, migrate(envelope.store))
  const diff = diffStores(local, migrate(envelope.store))
  await save(merged)
  onMerged?.(merged, diff)
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
      const merged = mergeStores(local, incoming)
      const diff = diffStores(local, incoming)
      await save(merged)
      onMerged?.(merged, diff)
      await writeFrame(socket, { deviceId: id, store: merged })
    } catch (error) {
      console.error("[задачи] lan", error)
    } finally {
      socket.end()
    }
  })
  server.listen(PORT)
  server.on("error", (error) => console.error("[задачи] lan listen", error))

  const ads = [advertise("Task Tracker Mac"), advertise("Задачи Mac")]

  const pullPhone = async (name) => {
    const target = await resolveService(name)
    if (!target) return
    const socket = connect({ port: target.port, host: target.host })
    try {
      await new Promise((resolve, reject) => {
        socket.once("connect", resolve)
        socket.once("error", reject)
        setTimeout(() => reject(new Error("connect timeout")), 4000)
      })
      await exchange(socket, { load, save, onMerged, getDeviceId })
    } catch (error) {
      console.error("[задачи] lan phone", name, error.message)
    } finally {
      socket.end()
    }
  }

  const phones = new Set()
  const browser = browsePhones((name) => {
    phones.add(name)
    void pullPhone(name)
  })
  const timer = setInterval(() => {
    for (const name of phones) void pullPhone(name)
  }, 10000)

  return {
    stop: () => {
      clearInterval(timer)
      server.close()
      ads.forEach((child) => child.kill())
      browser.kill()
    },
  }
}
