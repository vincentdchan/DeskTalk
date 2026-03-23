# LiveApp Storage

This document specifies the storage layer for LiveApps — how AI-generated applications persist and query application data at runtime.

## Overview

LiveApps run as sandboxed iframes with no backend process. They need a way to persist user data (task lists, settings, bookmarks, rows in a table, etc.) that survives page reloads and app restarts. The storage layer provides two tiers:

| Tier           | API                                 | Backing format              | Use case                                             |
| -------------- | ----------------------------------- | --------------------------- | ---------------------------------------------------- |
| **KV Store**   | `DeskTalk.storage.get/set`          | Single JSON file per key    | Small config, settings, simple state                 |
| **Collection** | `DeskTalk.storage.collection(name)` | JSONL op-log + SQLite cache | Structured record collections (tasks, entries, rows) |

Data is stored **separately from code**. LiveApp source files (HTML, JS, CSS) live in `.data/liveapps/<id>/`, while application data lives in `.storage/liveapps/<id>/` and disposable cache in `.cache/liveapps/<id>/`. This mirrors the existing MiniApp convention where code, data, and cache each have their own directory tree. The bridge mediates all I/O — LiveApps never touch the filesystem directly.

## Architecture

```
LiveApp iframe (sandboxed)
  │
  │  window.DeskTalk.storage.*
  │
  ▼
Preview MiniApp frontend (postMessage relay)
  │
  │  preview.bridge.storage command
  │
  ▼
Preview MiniApp backend (Node.js)
  │
  ├─ KV: read/write .storage/liveapps/<id>/<name>.json
  │
  └─ Collection:
      ├─ Write: append op to .storage/liveapps/<id>/<name>.jsonl
      ├─ Read: query .cache/liveapps/<id>/<name>.sqlite
      └─ Compaction: rewrite JSONL from SQLite state
```

This follows the same pattern as `DeskTalk.exec()` — the LiveApp calls a bridge method, the Preview frontend relays it via `postMessage`, and the Preview backend performs the actual I/O.

## File Layout

Using `<home>` as shorthand for `<data>/home/<username>/`:

```
<home>/
  .data/
    liveapps/
      my-tracker_html-stream-1-xxx/
        index.html                    # LiveApp source code
        icon.png                      # App icon (optional)
        chart.js                      # Co-located script (optional)
        .index.html.history.jsonl     # Edit history (optional)
  .storage/
    liveapps/
      my-tracker_html-stream-1-xxx/   # Matches the LiveApp directory name
        settings.json                 # KV store file
        tasks.jsonl                   # Collection op-log (source of truth)
  .cache/
    liveapps/
      my-tracker_html-stream-1-xxx/
        tasks.sqlite                  # Auto-generated SQLite query cache (disposable)
```

Key properties:

- **Code and data are separate.** The LiveApp directory (`.data/liveapps/<id>/`) contains only source files. Application data lives in `.storage/liveapps/<id>/` and cache in `.cache/liveapps/<id>/`. This follows the same separation used by MiniApps (`.data/<id>/` for code, `.storage/<id>.json` for data, `.cache/<id>/` for cache).
- **Storage directory mirrors the LiveApp id.** The subdirectory name under `.storage/liveapps/` and `.cache/liveapps/` matches the LiveApp's directory name, so the mapping is trivial.
- **Cache is disposable.** Delete `.cache/liveapps/<id>/` and it regenerates from the JSONL files on next access.
- The AI can `read` any `.json` or `.jsonl` file for inspection or migration. The AI can `edit` them using the existing `edit` tool.

## Tier 1: KV Store

Simple whole-file JSON storage for small, unstructured data.

### API

```js
// Read a JSON value from .storage/liveapps/<id>/<name>.json
const settings = await DeskTalk.storage.get('settings');

// Write a JSON value to .storage/liveapps/<id>/<name>.json
await DeskTalk.storage.set('settings', { theme: 'kanban', columns: 3 });

// Delete .storage/liveapps/<id>/<name>.json
await DeskTalk.storage.delete('settings');

// List all stored key names (both .json and .jsonl, without extensions)
await DeskTalk.storage.list();
// → ["settings", "tasks"]
```

### Implementation

- `get(name)` reads `.storage/liveapps/<id>/<name>.json`, parses JSON, returns the value. Returns `undefined` if the file does not exist.
- `set(name, value)` serializes `value` as JSON and writes `.storage/liveapps/<id>/<name>.json`. Creates the directory if it does not exist.
- `delete(name)` removes `.storage/liveapps/<id>/<name>.json`. Returns `true` if the file existed.
- `list()` scans `.storage/liveapps/<id>/` for `.json` and `.jsonl` files, returns names without extensions.

### Validation

- `name` must match `/^[a-z0-9][a-z0-9-]*$/` (lowercase alphanumeric + hyphens, no path separators).
- Maximum name length: 64 characters.
- The backend validates that the resolved path stays within the LiveApp's storage directory (no path traversal).

### When to use

KV is appropriate for:

- App-level settings and preferences
- Small state objects (< ~50 KB)
- Data that is always read and written as a whole

For collections of records (lists of tasks, rows, entries), use the Collection API instead.

## Tier 2: Collection API

Record-oriented storage backed by an append-only JSONL op-log with a SQLite query cache.

### API

```js
const tasks = DeskTalk.storage.collection('tasks');

// Insert a new record (id is required)
await tasks.insert({ id: 'a1', title: 'Buy milk', status: 'todo' });

// Update fields on an existing record (merges with existing data)
await tasks.update('a1', { status: 'done' });

// Delete a record
await tasks.delete('a1');

// Query
const task = await tasks.findById('a1');
const done = await tasks.find({ status: 'done' });
const page = await tasks.find(
  { status: 'todo' },
  { sort: 'createdAt', order: 'desc', limit: 20, offset: 0 },
);
const all = await tasks.findAll();
const count = await tasks.count({ status: 'done' });
```

### Record conventions

- Every record **must** have a string `id` field. Inserts without `id` are rejected.
- Records are flat JSON objects. Nested objects are stored as-is but not queryable at depth — queries match only top-level fields.
- The collection does not enforce a schema. Different records in the same collection can have different fields.

### JSONL op-log format

The source of truth for each collection is `.storage/liveapps/<id>/<name>.jsonl`. Each line is a JSON object representing one operation:

```jsonl
{"op":"insert","id":"a1","data":{"id":"a1","title":"Buy milk","status":"todo"},"ts":1711036800000}
{"op":"update","id":"a1","data":{"status":"done"},"ts":1711036801000}
{"op":"delete","id":"a2","ts":1711036802000}
```

| Field  | Description                                                                            |
| ------ | -------------------------------------------------------------------------------------- |
| `op`   | Operation type: `"insert"`, `"update"`, or `"delete"`                                  |
| `id`   | Record identifier                                                                      |
| `data` | For `insert`: full record. For `update`: partial fields to merge. Absent for `delete`. |
| `ts`   | Unix timestamp in milliseconds                                                         |

**Write path:** Every mutation (`insert`, `update`, `delete`) appends a single line to the JSONL file using `fs.appendFileSync`. This is an O(1) operation regardless of collection size. The same operation is applied to the in-memory SQLite cache in the same call.

**Crash safety:** Append-only writes mean a crash can corrupt at most the last line. On replay, the backend detects and discards incomplete trailing lines.

### SQLite query cache

Queries are served from a SQLite database (via `better-sqlite3`) that materializes the current state from the JSONL op-log.

**Schema:** Each collection gets a single table:

```sql
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL  -- full record as JSON
);
```

Individual top-level fields from the JSON are **not** stored as separate columns. Queries use SQLite's `json_extract()` function:

```sql
-- find({ status: "done" }, { sort: "createdAt", order: "desc", limit: 20 })
SELECT data FROM records
WHERE json_extract(data, '$.status') = 'done'
ORDER BY json_extract(data, '$.createdAt') DESC
LIMIT 20;
```

**Cache lifecycle:**

| Event                        | Action                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| First access to a collection | Read JSONL, replay all ops into a new SQLite database. Store in `.cache/liveapps/<id>/<name>.sqlite`. |
| Subsequent writes            | Append to JSONL **and** apply to SQLite in the same call.                                             |
| LiveApp reopened             | If SQLite cache exists and `mtime(sqlite) >= mtime(jsonl)`, reuse it. Otherwise, rebuild from JSONL.  |
| Cache deleted                | Automatically rebuilt on next access. The JSONL is always authoritative.                              |

SQLite databases are stored in `.cache/liveapps/<id>/` to make it clear they are derived and disposable.

### Compaction

Over time, the JSONL file accumulates superseded operations (e.g., an insert followed by 50 updates). Compaction rewrites the file with only the latest state of each live record, expressed as `insert` ops:

```jsonl
{"op":"insert","id":"a1","data":{"id":"a1","title":"Buy milk","status":"done","createdAt":1711036800000},"ts":1711036900000}
{"op":"insert","id":"a3","data":{"id":"a3","title":"Walk dog","status":"todo","createdAt":1711036802000},"ts":1711036900000}
```

After compaction:

- Deleted records are gone (no tombstones).
- Each surviving record is a single `insert` op with the fully merged data.
- The `ts` on each line is set to the compaction timestamp.
- The SQLite cache is rebuilt.

**Compaction triggers:**

| Trigger            | Condition                                          |
| ------------------ | -------------------------------------------------- |
| Op count threshold | After 200 ops since the last compaction            |
| LiveApp close      | When the Preview window for this LiveApp is closed |
| Explicit call      | `await tasks.compact()` from the LiveApp           |

Compaction is performed by reading the current materialized state from SQLite and rewriting the JSONL file atomically (write to a temp file, then rename).

### Limitations

- **No cross-collection queries.** Each collection is independent. Joins must be done in LiveApp JS.
- **No indexing beyond primary key.** `find()` with field filters uses `json_extract()` which scans all rows. This is fast enough for LiveApp-scale data (up to ~50,000 records) but not suitable for millions of rows.
- **No nested field queries.** `find({ "address.city": "NYC" })` is not supported. Flatten data or filter in JS after `findAll()`.
- **No transactions.** Each operation is independent. For multi-record atomicity, use the KV store to write a batch as a single value, or accept eventual consistency.

## Bridge Protocol

Storage operations use the existing `postMessage` bridge protocol with a new `kind: 'storage'`:

```js
// Request (iframe → parent)
{
  type: "desktalk:bridge-request",
  streamId: "...",
  token: "...",
  requestId: "req-123",
  kind: "storage",
  payload: {
    action: "collection.insert",
    collection: "tasks",
    params: { id: "a1", title: "Buy milk", status: "todo" }
  }
}

// Response (parent → iframe)
{
  type: "desktalk:bridge-response",
  requestId: "req-123",
  result: { ok: true }
}
```

**Action types:**

| Action                | Params                               | Returns                               |
| --------------------- | ------------------------------------ | ------------------------------------- |
| `kv.get`              | `{ name }`                           | `{ value }` or `{ value: undefined }` |
| `kv.set`              | `{ name, value }`                    | `{ ok: true }`                        |
| `kv.delete`           | `{ name }`                           | `{ deleted: boolean }`                |
| `kv.list`             | `{}`                                 | `{ names: string[] }`                 |
| `collection.insert`   | `{ collection, params: record }`     | `{ ok: true }`                        |
| `collection.update`   | `{ collection, id, params: fields }` | `{ ok: true }`                        |
| `collection.delete`   | `{ collection, id }`                 | `{ ok: true }`                        |
| `collection.findById` | `{ collection, id }`                 | `{ record }` or `{ record: null }`    |
| `collection.find`     | `{ collection, filter?, options? }`  | `{ records: record[] }`               |
| `collection.findAll`  | `{ collection }`                     | `{ records: record[] }`               |
| `collection.count`    | `{ collection, filter? }`            | `{ count: number }`                   |
| `collection.compact`  | `{ collection }`                     | `{ ok: true }`                        |

## Data Migration

When the AI edits a LiveApp to change the expected data shape (e.g., "add a priority field to tasks"), it must also migrate existing data. The storage layer does not provide an automatic migration framework — **the AI is the migration engine**.

### Migration workflow

1. The AI reads the current data files with the built-in `read` tool:
   - For KV: `read .storage/liveapps/<id>/settings.json`
   - For collections: `read .storage/liveapps/<id>/tasks.jsonl`
2. The AI edits the data files using the `edit` tool to match the new shape.
   - For JSONL, the AI can edit individual lines or append new ops.
3. The AI edits the LiveApp code (HTML/JS) to use the new data shape.
4. If a SQLite cache exists, the backend detects the JSONL was modified externally (mtime changed) and rebuilds the cache on next access.

### Defensive coding convention

The AI should generate LiveApps that handle missing or outdated fields gracefully:

```js
const tasks = await DeskTalk.storage.collection('tasks').findAll();
const normalized = tasks.map((t) => ({
  priority: 'medium', // default for records created before this field existed
  tags: [], // default for records without tags
  ...t,
}));
```

This ensures the LiveApp does not crash if the AI forgets to migrate data or if a user manually edits a data file.

### Version marker convention

Collections may optionally include a version marker in the KV store:

```js
const meta = await DeskTalk.storage.get('tasks-meta');
// { _version: 2, migratedAt: 1711036900000 }
```

The AI can check this and decide whether migration is needed. This is a convention, not enforced by the storage layer.

### Undo/redo support

Data files edited through the `edit` tool automatically get persistent edit history (`.storage/liveapps/<id>/.tasks.jsonl.history.jsonl`), the same as HTML files. This means `undo_edit` and `redo_edit` work on data migrations, giving the user a safety net.

## Security

- **Name validation:** Storage key and collection names must match `/^[a-z0-9][a-z0-9-]*$/`. Maximum 64 characters.
- **Path confinement:** The backend resolves all storage paths and validates they stay within the LiveApp's scoped directories (`.storage/liveapps/<id>/` for data, `.cache/liveapps/<id>/` for cache). Path traversal attempts (e.g., `../`) are rejected.
- **Bridge authentication:** Storage operations use the same `bridgeToken` + `streamId` authentication as `exec()`. Each LiveApp window has its own token — one LiveApp cannot access another's storage.
- **No cross-LiveApp access:** Each LiveApp's storage is scoped to its own `<id>` subdirectory. There is no shared storage between LiveApps.
