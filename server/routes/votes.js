"use strict";

const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { state } = require("../db/store");
const { rebuildIndex } = require("../db/rebuild-index");
const { requireWriteAccess } = require("./write-guard");
const { commitDataChange } = require("../git/sync");
const { DATA_DIR } = require("../config");

const router = express.Router();

// POST /api/entries/:entryId/vote — up/down vote on a video or actor. Body: { value: 1 | -1 }
router.post("/:entryId/vote", requireWriteAccess, (req, res) => {
  const { entryId } = req.params;
  const value = Number(req.body?.value);

  if (value !== 1 && value !== -1) {
    return res.status(400).json({ error: "invalid_value", reason: "value must be 1 or -1" });
  }
  if (!state.entries.has(entryId)) return res.status(404).json({ error: "entry_not_found" });

  const vote = { entryId, by: req.voterId, value, at: new Date().toISOString() };
  const relPath = path.posix.join("data", "votes", entryId, `${req.voterId}.json`);
  const absPath = path.join(DATA_DIR, "votes", entryId, `${req.voterId}.json`);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(vote, null, 2) + "\n");

  try {
    commitDataChange([relPath], `Vote ${value > 0 ? "+1" : "-1"} on ${entryId}`);
  } catch (err) {
    return res.status(502).json({ error: "commit_or_push_failed", reason: err.message });
  }

  rebuildIndex();
  res.json(vote);
});

module.exports = { router };
