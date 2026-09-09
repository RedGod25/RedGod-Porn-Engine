"use strict";

const express = require("express");
const { state } = require("../db/store");

const router = express.Router();

// GET /api/search?q=...&kind=video|actor&sort=score|recent&limit=&offset=
router.get("/", (req, res) => {
  const { q = "", kind, sort = "score" } = req.query;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  let candidates;
  if (q.trim()) {
    candidates = state.searchIndex.search(q.trim()).map((r) => state.entries.get(r.id)).filter(Boolean);
  } else {
    candidates = [...state.entries.values()];
  }

  if (kind) candidates = candidates.filter((e) => e.kind === kind);

  candidates =
    sort === "recent"
      ? candidates.slice().sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)))
      : candidates.slice().sort((a, b) => b.score - a.score);

  const results = candidates.slice(offset, offset + limit).map(formatEntry);
  res.json({ results, total: candidates.length, limit, offset });
});

function formatEntry(e) {
  return {
    id: e.id,
    collection: e.collection,
    kind: e.kind,
    title: e.title,
    sourceUrl: e.sourceUrl,
    thumbnailUrl: e.thumbnailUrl,
    actorIds: e.actorIds,
    addedBy: e.addedBy,
    addedAt: e.addedAt,
    attributes: e.attributes,
    tags: e.tags,
    score: e.score,
  };
}

module.exports = { router, formatEntry };
