"use strict";

const express = require("express");
const { nanoid } = require("nanoid");
const { state } = require("../db/store");
const { rebuildIndex } = require("../db/rebuild-index");
const { appendEntry } = require("../db/shards");
const { formatEntry } = require("./search");
const { requireWriteAccess } = require("./write-guard");
const { commitDataChange } = require("../git/sync");

// One router per catalog collection (videos, actors — see data/README.md).
// Each collection has its own required fields, but shares the same
// shard-append/commit/reindex plumbing.
const VALIDATORS = {
  videos: (body) => {
    const { title, sourceUrl, thumbnailUrl, actorIds, attributes } = body || {};
    if (!title || typeof title !== "string") return { error: "invalid_title" };
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
      return { error: "invalid_source_url", reason: "sourceUrl must be an http(s) URL" };
    }
    return {
      entry: {
        kind: "video",
        title,
        sourceUrl,
        thumbnailUrl: thumbnailUrl || null,
        actorIds: Array.isArray(actorIds) ? actorIds : [],
        attributes: attributes && typeof attributes === "object" ? attributes : {},
      },
    };
  },
  actors: (body) => {
    const { name, attributes } = body || {};
    if (!name || typeof name !== "string") return { error: "invalid_name" };
    return {
      entry: {
        kind: "actor",
        title: name,
        attributes: attributes && typeof attributes === "object" ? attributes : {},
      },
    };
  },
};

function createEntriesRouter(collection) {
  const router = express.Router();
  const validate = VALIDATORS[collection];
  const idPrefix = collection === "videos" ? "video" : "actor";

  // GET /api/<collection>/:id — full detail, including pending tag proposals.
  router.get("/:id", (req, res) => {
    const entry = state.entries.get(req.params.id);
    if (!entry || entry.collection !== collection) return res.status(404).json({ error: "not_found" });

    const proposals = state.proposalsByEntry.get(req.params.id) || [];
    res.json({ ...formatEntry(entry), tagProposals: proposals });
  });

  // POST /api/<collection> — add a new entry to the catalog.
  router.post("/", requireWriteAccess, (req, res) => {
    const result = validate(req.body);
    if (result.error) return res.status(400).json(result);

    const id = `${idPrefix}_${nanoid(10)}`;
    const entry = {
      id,
      ...result.entry,
      addedBy: req.voterId,
      addedAt: new Date().toISOString(),
      tags: [],
    };

    const relPath = appendEntry(collection, entry);

    try {
      commitDataChange([relPath], `Add ${idPrefix}: ${entry.title}`);
    } catch (err) {
      return res.status(502).json({ error: "commit_or_push_failed", reason: err.message });
    }

    rebuildIndex();
    res.status(201).json(entry);
  });

  return router;
}

module.exports = { createEntriesRouter };
