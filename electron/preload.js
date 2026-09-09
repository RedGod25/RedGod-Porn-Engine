"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Exposes just the LAN-mode toggle to the renderer — everything else (search,
// voting, tags) goes through the normal HTTP API served by the same window.
contextBridge.exposeInMainWorld("lanMode", {
  get: () => ipcRenderer.invoke("lan-mode:get"),
  set: (enabled) => ipcRenderer.invoke("lan-mode:set", enabled),
});
