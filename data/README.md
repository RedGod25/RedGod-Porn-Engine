# Community data (git-synced shards)

This directory is the **source of truth** for the whole catalog — videos,
actors, tag proposals, and votes. It is plain JSON so that:

- every change is a normal, reviewable git diff / commit;
- a machine can only write here (new entries, tag proposals, votes) if it
  has push access to this repository (or submits a PR a maintainer merges)
  — that's the whole anti-spam model, there is no separate account system.

The local search index (`server/db/store.js`) is **not** authoritative —
it's an in-memory index rebuilt from these JSON files on every startup and
after every write (pure JS, no SQLite/native deps, so `npm install` never
needs a C++ toolchain on the user's machine). If it's ever wrong, there's
nothing to migrate or repair: it's just rebuilt.

## Layout

```
data/
  shards/videos/shard-00001.json   catalog entries, kind: "video" — up to 5000 per shard
  shards/actors/shard-00001.json   catalog entries, kind: "actor" — up to 5000 per shard
  shards/images/                   not implemented yet — shape TBD
  tags/<entryId>/<proposalId>.json     one file per tag proposal on an entry
  votes/<entryId>/<voterId>.json        one file per (entry, voter) pair
```

`shards/videos/` and `shards/actors/` are **sharded**: entries are appended to the last
shard file until it reaches `SHARD_MAX_ENTRIES` (5000, see
`server/config.js`), then a new shard file is started. This keeps the
catalog from turning into hundreds of thousands of one-line files (which
git and GitHub both handle poorly at scale), at the cost of more merge
conflicts on the shard file that's currently being appended to when two
machines add entries concurrently — `npm run sync` (pull, rebuild, retry)
is the expected recovery path for that.

`tags/` and `votes/` stay one-file-per-record (not sharded): they're
naturally small, independent, high-churn records where per-file granularity
avoids conflicts almost entirely — the opposite trade-off from the catalog.

## `shards/videos/shard-NNNNN.json` / `shards/actors/shard-NNNNN.json`

```json
{
  "entries": [
    {
      "id": "video_ab12cd34",
      "kind": "video",
      "title": "Example title",
      "sourceUrl": "https://example.com/watch/123",
      "thumbnailUrl": "https://example.com/thumb/123.jpg",
      "actorIds": ["actor_9f8e7d6c"],
      "addedBy": "alice",
      "addedAt": "2026-09-09T12:00:00.000Z",
      "attributes": { "durationSeconds": 720, "resolution": "1080p" },
      "tags": ["tag-slug-1", "tag-slug-2"]
    }
  ]
}
```

```json
{
  "entries": [
    {
      "id": "actor_9f8e7d6c",
      "kind": "actor",
      "title": "Example Name",
      "addedBy": "bob",
      "addedAt": "2026-09-09T12:05:00.000Z",
      "attributes": {},
      "tags": []
    }
  ]
}
```

`tags` on an entry are the **validated** tags only (promoted from proposals
once they cross the validation threshold — see `server/db/rebuild-index.js`).

## `tags/<entryId>/<proposalId>.json`

```json
{
  "id": "prop_9f8e7d6c",
  "entryId": "video_ab12cd34",
  "tag": "tag-slug-3",
  "proposedBy": "bob",
  "proposedAt": "2026-09-09T12:05:00.000Z",
  "votes": [
    { "by": "alice", "value": 1, "at": "2026-09-09T12:10:00.000Z" }
  ]
}
```

## `votes/<entryId>/<voterId>.json`

Entry-level vote (not to be confused with votes on a tag proposal above):

```json
{
  "entryId": "video_ab12cd34",
  "by": "alice",
  "value": 1,
  "at": "2026-09-09T12:00:00.000Z"
}
```

`value` is `1` or `-1`. One file per `(entryId, voterId)` — writing again
just overwrites the file, which is how a user changes or retracts their
vote.
