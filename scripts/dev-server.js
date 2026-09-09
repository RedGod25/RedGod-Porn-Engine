"use strict";

// Runs the API + frontend standalone (no Electron), for development and for
// verifying LAN access from a phone. By default it binds to all interfaces
// so it's reachable at http://<this-pc's-lan-ip>:PORT from other devices —
// pass --local to bind to 127.0.0.1 only.

const { createApp } = require("../server/app");
const { DEFAULT_PORT } = require("../server/config");

const localOnly = process.argv.includes("--local");
const host = localOnly ? "127.0.0.1" : "0.0.0.0";
const port = Number(process.env.PORT) || DEFAULT_PORT;

const app = createApp();
app.listen(port, host, () => {
  console.log(`RedGod-Porn-Engine listening on http://${host}:${port}`);
  if (!localOnly) {
    console.log("Reachable from other devices on this network at http://<this-pc-lan-ip>:" + port);
  }
});
