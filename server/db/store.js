"use strict";

// In-memory materialized view of the community catalog (see data/README.md).
// Rebuilt from the JSON shards in data/ on startup and after every write.
// It is deliberately not persisted anywhere itself (no SQLite, no native
// deps) — that keeps `npm install` free of any native build step, which
// matters for an app meant to run on any user's PC without a C++ toolchain.
// If it's ever wrong, there is nothing to migrate: just rebuild it.

const MiniSearch = require("minisearch");

const state = {
  /** @type {Map<string, object>} entry id -> record (video or actor, resolved tags/score) */
  entries: new Map(),
  /** @type {Map<string, object[]>} entry id -> tag proposal records */
  proposalsByEntry: new Map(),
  /** @type {MiniSearch|null} */
  searchIndex: null,
};

function reset() {
  state.entries.clear();
  state.proposalsByEntry.clear();
  state.searchIndex = new MiniSearch({
    fields: ["title", "tags"],
    idField: "id",
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 2 } },
  });
}

reset();

module.exports = { state, reset };
