"use strict";

const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const path = require("node:path");

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

// `git push --dry-run` hits the network. GIT_TERMINAL_PROMPT=0 stops git
// from blocking forever on an interactive credential prompt when the
// remote needs auth that isn't cached — it fails fast instead, which is
// exactly what we want here (this whole check must never hang the server).
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "" };
const GIT_TIMEOUT_MS = 10_000;

async function runGit(args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: GIT_ENV,
    timeout: GIT_TIMEOUT_MS,
  });
  return stdout.trim();
}

/**
 * The "voter id" for this machine: the configured git user.name, slugified.
 * This is what gets used as the filename for votes/<entryId>/<voterId>.json
 * and as the `by` field on tag-proposal votes.
 */
async function getVoterId() {
  let name;
  try {
    name = await runGit(["config", "user.name"]);
  } catch {
    return null;
  }
  if (!name) return null;
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Cached briefly so every vote/tag-proposal request doesn't have to re-hit
// the network to re-verify push access.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached = null;
let cachedAt = 0;
let inFlight = null;

/**
 * Whether this machine is allowed to write votes / tag proposals / new
 * catalog entries: it must have a git identity configured AND actual push
 * access to the configured remote. This is the entire anti-spam model
 * described in data/README.md — no separate account system.
 *
 * Push access is checked with `git push --dry-run`, which contacts the
 * remote but does not change anything. Result is cached for a few minutes;
 * concurrent callers during a cache miss share one in-flight check.
 */
async function canWrite({ skipCache = false } = {}) {
  if (!skipCache && cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }
  if (!inFlight) {
    inFlight = computeCanWrite().finally(() => {
      inFlight = null;
    });
  }
  cached = await inFlight;
  cachedAt = Date.now();
  return cached;
}

async function computeCanWrite() {
  const voterId = await getVoterId();
  if (!voterId) {
    return { allowed: false, voterId: null, reason: "no git user.name configured" };
  }

  let remote;
  try {
    remote = await runGit(["remote", "get-url", "origin"]);
  } catch {
    return { allowed: false, voterId, reason: "no git remote 'origin' configured" };
  }

  try {
    const branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    await runGit(["push", "--dry-run", "origin", branch]);
    return { allowed: true, voterId, remote };
  } catch (err) {
    return {
      allowed: false,
      voterId,
      remote,
      reason: "no push access to origin (dry-run failed): " + err.message,
    };
  }
}

module.exports = { getVoterId, canWrite, REPO_ROOT };
