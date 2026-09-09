"use strict";

const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("node:path");
const os = require("node:os");
const { createApp } = require("../server/app");
const { DEFAULT_PORT } = require("../server/config");

let mainWindow = null;
let httpServer = null;
let lanModeEnabled = false;

/** Starts (or restarts) the embedded server bound to the right interface for the current mode. */
function startServer() {
  return new Promise((resolve, reject) => {
    if (httpServer) {
      httpServer.close();
      httpServer = null;
    }
    const expressApp = createApp();
    const host = lanModeEnabled ? "0.0.0.0" : "127.0.0.1";
    httpServer = expressApp.listen(DEFAULT_PORT, host, () => resolve());
    httpServer.on("error", reject);
  });
}

function lanAddresses() {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const iface of Object.values(nets)) {
    for (const net of iface || []) {
      if (net.family === "IPv4" && !net.internal) addresses.push(net.address);
    }
  }
  return addresses;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await startServer();
  mainWindow.loadURL(`http://127.0.0.1:${DEFAULT_PORT}`);
}

// Renderer asks main to flip LAN mode on/off (rebinds the server to
// 0.0.0.0 vs 127.0.0.1) and to report the URLs to reach it from a phone.
ipcMain.handle("lan-mode:get", () => ({ enabled: lanModeEnabled, port: DEFAULT_PORT, addresses: lanAddresses() }));
ipcMain.handle("lan-mode:set", async (_event, enabled) => {
  lanModeEnabled = Boolean(enabled);
  await startServer();
  return { enabled: lanModeEnabled, port: DEFAULT_PORT, addresses: lanAddresses() };
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (httpServer) httpServer.close();
  if (process.platform !== "darwin") app.quit();
});
