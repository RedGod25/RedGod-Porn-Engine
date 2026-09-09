"use strict";

// Rebuilds the in-memory search index from the git-synced JSON shards in
// data/ (videos/, actors/ — see data/README.md) plus the per-record
// tags/votes files. Safe to run any time (e.g. after `git pull` or a local
// write) — it's a full rebuild, not an incremental patch. Run directly with
// `npm run reindex`, or call rebuildIndex() from the server after a write.

const fs = require("node:fs");
const path = require("node:path");
const { DATA_DIR, TAG_VALIDATION_THRESHOLD, COLLECTIONS } = require("../config");
const { readAllEntries } = require("./shards");
const { state, reset } = require("./store");

function readJsonFilesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      } catch (err) {
        console.warn(`[reindex] skipping unreadable ${path.join(dir, f)}: ${err.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

function rebuildIndex() {
  reset();

  const tagsDir = path.join(DATA_DIR, "tags");
  const votesDir = path.join(DATA_DIR, "votes");

  for (const collection of COLLECTIONS) {
    for (const raw of readAllEntries(collection)) {
      if (!raw.id) continue;

      const record = {
        id: raw.id,
        collection, // 'videos' | 'actors'
        kind: raw.kind || (collection === "videos" ? "video" : "actor"),
        title: raw.title || raw.name || "",
        sourceUrl: raw.sourceUrl || null,
        thumbnailUrl: raw.thumbnailUrl || null,
        actorIds: raw.actorIds || [],
        addedBy: raw.addedBy || null,
        addedAt: raw.addedAt || null,
        attributes: raw.attributes || {},
        tags: new Set(raw.tags || []),
        score: 0,
      };

      // Entry-level votes fold straight into score.
      for (const vote of readJsonFilesIn(path.join(votesDir, raw.id))) {
        if (typeof vote.value === "number") record.score += vote.value;
      }

      // Tag proposals: score each from its embedded votes[], promote to the
      // entry's validated tag set once the threshold is crossed.
      const proposals = readJsonFilesIn(path.join(tagsDir, raw.id))
        .filter((p) => p.id && p.tag)
        .map((p) => {
          const score = (p.votes || []).reduce((sum, v) => sum + (v.value || 0), 0);
          const status = score >= TAG_VALIDATION_THRESHOLD ? "validated" : "pending";
          if (status === "validated") record.tags.add(p.tag);
          return {
            id: p.id,
            tag: p.tag,
            proposedBy: p.proposedBy || null,
            proposedAt: p.proposedAt || null,
            score,
            status,
          };
        })
        .sort((a, b) => b.score - a.score);

      record.tags = [...record.tags];
      state.entries.set(record.id, record);
      state.proposalsByEntry.set(record.id, proposals);
      state.searchIndex.add({ id: record.id, title: record.title, tags: record.tags.join(" ") });
    }
  }

  return { entryCount: state.entries.size };
}

if (require.main === module) {
  const { entryCount } = rebuildIndex();
  console.log(`[reindex] rebuilt index: ${entryCount} entries.`);
}

module.exports = { rebuildIndex };
