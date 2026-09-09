"use strict";

// Wraps the git operations needed to treat data/ as a synced community
// database: pulling latest shards, and committing (+ optionally pushing)
// new/changed ones written locally. See data/README.md for the data model.

const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { REPO_ROOT } = require("./identity");
const { rebuildIndex } = require("../db/rebuild-index");

function runGit(args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Pulls the latest community data and rebuilds the local search index from it. */
function pullAndReindex() {
  runGit(["pull", "--ff-only", "origin"]);
  return rebuildIndex();
}

/**
 * Commits one or more just-written files under data/ and, if `push` is true,
 * pushes immediately. Pushing can fail (e.g. someone else pushed first) —
 * callers should catch and surface that as "please sync and retry" rather
 * than silently losing the local commit.
 */
function commitDataChange(relativeFilePaths, message, { push = true } = {}) {
  for (const relPath of relativeFilePaths) {
    runGit(["add", "--", relPath]);
  }
  runGit(["commit", "-m", message]);
  if (push) {
    runGit(["push", "origin", "HEAD"]);
  }
}

if (require.main === module) {
  const { mediaCount } = pullAndReindex();
  console.log(`[sync] pulled latest data, reindexed ${mediaCount} media entries.`);
}

module.exports = { pullAndReindex, commitDataChange, runGit, DATA_DIR_REL: path.posix.join("data") };
