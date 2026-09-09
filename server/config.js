"use strict";

const path = require("node:path");

module.exports = {
  DATA_DIR: path.resolve(__dirname, "..", "data"),
  DEFAULT_PORT: 4173,
  // A proposed tag is promoted onto an entry's validated `tags` list once
  // its cumulative vote score reaches this threshold.
  TAG_VALIDATION_THRESHOLD: 3,
  // Catalog entries (videos, actors — images later) are stored as shard
  // files of up to this many entries each, rather than one file per entry:
  // see data/README.md.
  SHARD_MAX_ENTRIES: 5000,
  // Implemented catalog collections. 'images' is deliberately not listed
  // yet — its shape (and whether it even reuses the video/actor split) is
  // still to be decided.
  COLLECTIONS: ["videos", "actors"],
};
