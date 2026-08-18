import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("tasksApi", {
  load: () => ipcRenderer.invoke("store:load"),
  save: (data) => ipcRenderer.invoke("store:save", data),
  meta: () => ipcRenderer.invoke("app:meta"),
  reveal: () => ipcRenderer.invoke("app:reveal"),
  setLocale: (locale) => ipcRenderer.invoke("app:locale", locale),
  onMenu: (handler) => {
    ipcRenderer.on("menu", (_event, payload) => handler(payload))
  },
  onSync: (handler) => {
    ipcRenderer.on("store:sync", (_event, payload) => handler(payload))
  },
})
