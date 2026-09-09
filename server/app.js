"use strict";

const express = require("express");
const path = require("node:path");
const { rebuildIndex } = require("./db/rebuild-index");
const { canWrite } = require("./git/identity");
const { router: searchRouter } = require("./routes/search");
const { createEntriesRouter } = require("./routes/entries");
const { router: tagsRouter } = require("./routes/tags");
const { router: votesRouter } = require("./routes/votes");

function createApp() {
  // Build the in-memory index fresh on every boot from the JSON shards.
  rebuildIndex();

  const app = express();
  app.use(express.json());

  // GET /api/status — whether *this* machine can vote/propose/index (see
  // data/README.md); the frontend uses this to show/hide write controls,
  // which matters when this server is reached from a phone over LAN.
  app.get("/api/status", async (req, res) => {
    const status = await canWrite();
    res.json({ voterId: status.voterId, canWrite: status.allowed, reason: status.reason || null });
  });

  app.use("/api/search", searchRouter);
  app.use("/api/videos", createEntriesRouter("videos"));
  app.use("/api/actors", createEntriesRouter("actors"));
  // Tag proposals and votes are addressed by entry id regardless of which
  // collection (videos/actors) the entry belongs to.
  app.use("/api/entries", tagsRouter);
  app.use("/api/entries", votesRouter);

  app.use(express.static(path.join(__dirname, "..", "frontend")));

  return app;
}

module.exports = { createApp };
