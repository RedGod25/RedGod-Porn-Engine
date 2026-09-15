"use strict";

// Read/append helpers for sharded collections (data/shards/videos/,
// data/shards/actors/).
// Each shard is a JSON file holding up to SHARD_MAX_ENTRIES records:
//   { entries: [ {...}, {...}, ... ] }
// New entries are appended to the last shard until it's full, then a new
// shard file is started. See data/README.md for why (git-friendliness at
// catalog scale) and the trade-off it implies (concurrent additions can
// land in the same shard file and conflict on push — see git/sync.js).

const fs = require("node:fs");
const path = require("node:path");
const { DATA_DIR, SHARD_MAX_ENTRIES } = require("../config");

// Collections live under data/shards/ rather than directly under data/, which
// keeps them from colliding with the sibling tags/ and votes/ trees. Stated
// once here: reads and the path returned for committing must never disagree,
// or entries get written somewhere the index will not look for them.
const SHARDS_SUBDIR = "shards";

function collectionDir(collection) {
  return path.join(DATA_DIR, SHARDS_SUBDIR, collection);
}

function shardFileName(n) {
  return `shard-${String(n).padStart(5, "0")}.json`;
}

function listShardFiles(collection) {
  const dir = collectionDir(collection);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^shard-\d+\.json$/.test(f))
    .sort();
}

function readShard(collection, fileName) {
  const abs = path.join(collectionDir(collection), fileName);
  if (!fs.existsSync(abs)) return { entries: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch (err) {
    console.warn(`[shards] skipping unreadable ${abs}: ${err.message}`);
    return { entries: [] };
  }
}

/** Every entry across every shard of a collection, in shard order. */
function readAllEntries(collection) {
  const out = [];
  for (const file of listShardFiles(collection)) {
    out.push(...readShard(collection, file).entries);
  }
  return out;
}

/**
 * Appends `entry` to the last shard of `collection` (creating the
 * collection's first shard, or a new shard past the size cap, as needed).
 * Returns the shard file's path relative to the repo root, for committing.
 */
function appendEntry(collection, entry) {
  const dir = collectionDir(collection);
  fs.mkdirSync(dir, { recursive: true });

  const files = listShardFiles(collection);
  let targetFile = files[files.length - 1];
  let shard = targetFile ? readShard(collection, targetFile) : { entries: [] };

  if (!targetFile || shard.entries.length >= SHARD_MAX_ENTRIES) {
    const nextIndex = files.length + 1;
    targetFile = shardFileName(nextIndex);
    shard = { entries: [] };
  }

  shard.entries.push(entry);
  fs.writeFileSync(path.join(dir, targetFile), JSON.stringify(shard, null, 2) + "\n");

  return path.posix.join("data", SHARDS_SUBDIR, collection, targetFile);
}

module.exports = { listShardFiles, readShard, readAllEntries, appendEntry };
