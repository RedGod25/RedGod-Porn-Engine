"use strict";

const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { nanoid } = require("nanoid");
const { state } = require("../db/store");
const { rebuildIndex } = require("../db/rebuild-index");
const { requireWriteAccess } = require("./write-guard");
const { commitDataChange } = require("../git/sync");
const { DATA_DIR } = require("../config");

const router = express.Router();

function proposalPaths(entryId, proposalId) {
  return {
    rel: path.posix.join("data", "tags", entryId, `${proposalId}.json`),
    abs: path.join(DATA_DIR, "tags", entryId, `${proposalId}.json`),
  };
}

function readProposal(entryId, proposalId) {
  const { abs } = proposalPaths(entryId, proposalId);
  if (!fs.existsSync(abs)) return null;
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function writeProposal(entryId, proposalId, data) {
  const { abs, rel } = proposalPaths(entryId, proposalId);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(data, null, 2) + "\n");
  return rel;
}

// POST /api/entries/:entryId/tags — propose a new tag on a video or actor. Body: { tag }
router.post("/:entryId/tags", requireWriteAccess, (req, res) => {
  const { entryId } = req.params;
  const { tag } = req.body || {};

  if (!state.entries.has(entryId)) return res.status(404).json({ error: "entry_not_found" });

  const slug = normalizeTag(tag);
  if (!slug) return res.status(400).json({ error: "invalid_tag" });

  const id = `prop_${nanoid(10)}`;
  const proposal = {
    id,
    entryId,
    tag: slug,
    proposedBy: req.voterId,
    proposedAt: new Date().toISOString(),
    votes: [],
  };

  const relPath = writeProposal(entryId, id, proposal);

  try {
    commitDataChange([relPath], `Propose tag "${slug}" on ${entryId}`);
  } catch (err) {
    return res.status(502).json({ error: "commit_or_push_failed", reason: err.message });
  }

  rebuildIndex();
  res.status(201).json(proposal);
});

// POST /api/entries/:entryId/tags/:proposalId/vote — validate/reject a proposed tag. Body: { value: 1 | -1 }
router.post("/:entryId/tags/:proposalId/vote", requireWriteAccess, (req, res) => {
  const { entryId, proposalId } = req.params;
  const value = Number(req.body?.value);

  if (value !== 1 && value !== -1) {
    return res.status(400).json({ error: "invalid_value", reason: "value must be 1 or -1" });
  }

  const proposal = readProposal(entryId, proposalId);
  if (!proposal) return res.status(404).json({ error: "proposal_not_found" });

  proposal.votes = (proposal.votes || []).filter((v) => v.by !== req.voterId);
  proposal.votes.push({ by: req.voterId, value, at: new Date().toISOString() });

  const relPath = writeProposal(entryId, proposalId, proposal);

  try {
    commitDataChange([relPath], `Vote ${value > 0 ? "+1" : "-1"} on tag proposal ${proposalId}`);
  } catch (err) {
    return res.status(502).json({ error: "commit_or_push_failed", reason: err.message });
  }

  rebuildIndex();
  res.json(proposal);
});

function normalizeTag(tag) {
  if (!tag || typeof tag !== "string") return null;
  const slug = tag
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || null;
}

module.exports = { router };
