# Note MiniApp Specification

## Overview

The Note MiniApp is a Markdown-based note-taking and management tool. It is modeled after the macOS Notes app but uses Markdown as the content format and supports YAML front matter for metadata such as tags.

## Features

### Core

- Create, read, update, and delete notes.
- Each note is stored as a Markdown file with optional YAML front matter.
- Notes can be organized in subdirectories — the note ID is the relative path without the `.md` extension (e.g., `work/meeting-notes` for `work/meeting-notes.md`).
- Notes are listed in a sidebar sorted by last-modified date (newest first).
- Full-text search across all notes (recursive).

### Markdown & Front Matter

Notes follow this format:

```markdown
---
title: Meeting Notes
tags:
  - work
  - meetings
created: 2026-03-13T10:00:00Z
---

# Meeting Notes

Action items from today's standup...
```

Supported front matter fields:

| Field     | Type       | Description                                              |
| --------- | ---------- | -------------------------------------------------------- |
| `title`   | `string`   | Display title (falls back to first heading or filename). |
| `tags`    | `string[]` | List of tags for filtering and organization.             |
| `created` | `string`   | ISO 8601 creation timestamp (auto-generated).            |

### Tag System

- Tags are defined in the YAML front matter.
- The sidebar includes a tag filter panel that lists all tags with note counts.
- Selecting a tag filters the note list to only show notes with that tag.
- Multiple tags can be selected (AND logic).

## UI Layout

```
|-------------------------------|
| Tag      | Note     |         |
| Filter   | List     | Editor  |
|          |          |         |
|-------------------------------|
```

Note: The Actions Bar is a global element managed by the core shell (see `docs/spec.md`). MiniApps register their actions via `<ActionsProvider>`, but the bar itself is not part of the MiniApp window.

| Panel      | Description                                                                   |
| ---------- | ----------------------------------------------------------------------------- |
| Tag Filter | Lists all tags. Click to filter the note list.                                |
| Note List  | Lists notes matching the current filter, showing title and a preview snippet. |
| Editor     | The Milkdown Markdown editor for the selected note.                           |

## Frontend

### Editor

Use [Milkdown](https://milkdown.dev/) as the WYSIWYG Markdown editor.

- Render Markdown with live preview (WYSIWYG mode).
- Support common Markdown features: headings, bold, italic, lists, code blocks, links, images.
- Provide a toolbar or slash-command menu for formatting.
- Auto-save changes after a short debounce (e.g., 500ms of inactivity).

### Components

| Component     | Responsibility                                                          |
| ------------- | ----------------------------------------------------------------------- |
| `NoteList`    | Displays the list of notes with title, preview, and last-modified time. |
| `NoteEditor`  | Wraps Milkdown. Loads and saves the selected note.                      |
| `TagFilter`   | Shows all available tags. Handles multi-select filtering.               |
| `NoteActions` | Provides actions via `<ActionsProvider>`.                               |

## Actions (AI-invokable)

| Action                | Description                                                                   | Parameters                                                               |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `List Notes`          | Return the 20 most recent notes with selection status.                        | —                                                                        |
| `Select Note`         | Select a note by ID and open it in the editor.                                | `id: string`                                                             |
| `Create Note`         | Create a new note with optional title, content, and path.                     | `title?: string`, `content?: string`, `tags?: string[]`, `path?: string` |
| `Delete Note`         | Delete the currently selected note.                                           | —                                                                        |
| `Search Notes`        | Search notes by keyword.                                                      | `query: string`                                                          |
| `Get Editing Context` | Return the current editor state for the selected note.                        | —                                                                        |
| `Edit Note`           | Apply a text replacement to the current note's body (including front matter). | `old_text: string`, `new_text: string`                                   |

**Tags are managed via front matter, not dedicated actions.** To add or remove tags, the AI uses `Edit Note` to modify the YAML front matter block directly (e.g., replace the `tags:` section). This avoids redundant actions and keeps the action surface small.

### AI Note Editing

The AI can modify the content of the currently open note through a two-step action-based flow. No built-in filesystem tools (edit/write) are used; all edits go through the MiniApp's own action broker so the editor stays in control.

#### Design Rationale

- **Action-based, not filesystem-based.** The MiniApp frontend owns the edit lifecycle. This means the editor can visualize changes (highlight diffs, animate insertions) and maintain consistent state without needing file watchers or event propagation from the core.
- **Mirrors `edit` tool semantics.** The `Edit Note` action uses `old_text` / `new_text` parameters — the same mental model as the pi-coding-agent's built-in `edit` tool — so the AI can reason about precise text replacements.
- **Separate context retrieval.** `Get Editing Context` is a dedicated action so the AI can inspect the note before editing. The desktop context block already tells the AI _which_ note is open and _what actions are available_, but not the full content. This action fills that gap.

#### `List Notes` Action

Returns the 20 most recently modified notes, including which one is currently selected.

**Parameters:** None.

**Returns:**

```ts
interface ListNotesResult {
  notes: Array<{
    id: string; // Note ID (relative path without .md, e.g. "work/meeting-notes")
    title: string; // Note title
    updatedAt: string; // ISO 8601
    selected: boolean; // true if this note is currently open in the editor
  }>;
}
```

The AI can use this to understand what notes exist and which one the user is looking at, then call `Select Note` to switch to a different note before editing.

#### `Select Note` Action

Selects a note by ID and opens it in the editor.

**Parameters:**

| Param | Type     | Required | Description                                        |
| ----- | -------- | -------- | -------------------------------------------------- |
| `id`  | `string` | yes      | The note ID (relative path without .md) to select. |

**Returns:** `{ success: true }` or `{ success: false, error: string }` if the note ID is not found.

After selection completes, the AI can call `Get Editing Context` to read the note's content.

#### Flow

```
User: "Fix the typos in this note"
  │
  ▼
AI calls action("Get Editing Context")
  │  ← returns { id, title, content (raw Markdown with front matter), cursorLine, selectedText }
  ▼
AI reasons about the content, identifies edits
  │
  ▼
AI calls action("Edit Note", { old_text: "teh", new_text: "the" })
  │
  ├─► Frontend handler:
  │     1. Finds `old_text` in current editor content
  │     2. Replaces with `new_text` via Milkdown editor API
  │     3. Triggers auto-save (debounced, same as manual edits)
  │     4. Stores edit metadata for visualization
  │     5. Returns { success, diff, firstChangedLine } to AI
  │
  ▼
AI may call Edit Note again for additional changes
  │
  ▼
AI responds to user with summary of changes
```

```
User: "Add a 'meeting' tag to the project plan note"
  │
  ▼
AI calls action("List Notes")
  │  ← returns list with IDs, titles, selected status
  ▼
AI calls action("Select Note", { id: "project-plan" })
  │
  ▼
AI calls action("Get Editing Context")
  │  ← returns content with front matter
  ▼
AI calls action("Edit Note", { old_text: "tags:\n  - work", new_text: "tags:\n  - work\n  - meeting" })
  │
  ▼
AI responds with confirmation
```

The AI may call `Edit Note` multiple times in sequence for multi-site edits. Each call is atomic — one replacement per invocation.

#### `Get Editing Context` Action

Returns the current editor state so the AI has full context before making edits.

**Parameters:** None.

**Returns:**

```ts
interface EditingContext {
  id: string; // Note ID (relative path without .md)
  title: string; // Note title
  content: string; // Full raw Markdown including YAML front matter
  cursorLine: number; // 1-indexed line number of the cursor
  selectedText: string; // Currently selected text (empty string if none)
}
```

If no note is selected, the action returns an error string.

#### `Edit Note` Action

Applies a single text replacement to the full note content (including YAML front matter) in the editor.

**Parameters:**

| Param      | Type     | Required | Description                                                                                                    |
| ---------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `old_text` | `string` | yes      | Exact text to find in the full note content (including front matter). Must match exactly and appear only once. |
| `new_text` | `string` | yes      | Replacement text.                                                                                              |

**Returns:**

```ts
interface EditNoteResult {
  success: boolean;
  diff: string; // Unified diff of the change
  firstChangedLine: number; // 1-indexed line of first change (for cursor positioning)
}
```

**Handling inserts and appends:**

There is no separate "insert" mode. All operations — replacements, insertions, and appends — use `old_text`/`new_text`. The AI uses `Get Editing Context` to read the full content and cursor position, then constructs the appropriate pair:

- **Insert at cursor:** Use the text on the cursor line as `old_text`, include the new content in `new_text`. Example: `old_text: "existing line"` → `new_text: "existing line\nnew content"`.
- **Append to end:** Use the last line of the note as `old_text`, append content in `new_text`.
- **Insert at beginning:** Use the first line as `old_text`, prepend content in `new_text`.
- **Empty note:** Use `Create Note` with content instead, or the action handler should treat `old_text: ""` as "insert at beginning" (the only case where empty `old_text` is valid).

This follows the same model as the pi-coding-agent's built-in `edit` tool, which handles all editing through text replacement alone.

**Error cases:**

- `old_text` not found → return `{ success: false, error: "Text not found in note" }`
- `old_text` found multiple times → return `{ success: false, error: "Text appears N times; provide more surrounding context to make it unique" }`
- No note selected → return `{ success: false, error: "No note is currently open" }`

#### Frontend Implementation Notes

The `Edit Note` action handler lives in `NoteActions.tsx` and operates on the full note content (including YAML front matter) programmatically:

1. **Reconstruct full content** by combining note metadata (title, tags, created date) with the live editor body via `serializeFrontMatter()`. This ensures we get the latest unsaved edits while preserving the front matter.
2. **Find `old_text`** using exact string match on the full reconstructed content. Reject if zero or multiple matches.
3. **Apply replacement** to produce new raw content, then parse with `parseFrontMatter()` to split into metadata + body.
4. **Update the editor** with the body portion via `setMarkdown()` (which calls `editor.action(replaceAll(newBody))`).
5. **Persist metadata changes** — if title or tags changed in front matter, call `notes.update` to sync.
6. **Compute diff** using a simple unified-diff utility.
7. **Trigger auto-save** — the `markdownUpdated` listener handles body saves via debounce.

To support this, `NoteEditor` exposes a `NoteEditorHandle` interface via `forwardRef` + `useImperativeHandle` with `getMarkdown()`, `setMarkdown()`, `getCursorLine()`, and `getSelectedText()` methods.

#### Visualization (Future)

Edit metadata stored by the action handler will be used to render visual indicators in the editor:

- Highlight the changed region (green for additions, red/strikethrough for deletions).
- Show a floating diff badge near the change.
- Animate the transition from old to new text.

This is out of scope for the initial implementation but the data model supports it from the start.

## Backend

The Note MiniApp does not implement its own HTTP server. All backend logic runs inside the `activate` function and communicates with the frontend via the core's messaging and storage hooks (see `docs/spec.md` — MiniApp System).

### Storage

Notes are persisted using `ctx.fs` (rooted at `ctx.paths.data`) as Markdown files organized in directories. The filesystem is the single source of truth — no separate index. Listing and searching scan all `.md` files recursively.

### Commands (via MessagingHook)

| Command        | Request                                                                | Response                           | Description                                                                              |
| -------------- | ---------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `notes.list`   | `{ tag?: string }`                                                     | `NoteMeta[]`                       | List all notes, optionally filtered by tag.                                              |
| `notes.get`    | `{ id: string }`                                                       | `Note`                             | Get a single note's full content.                                                        |
| `notes.create` | `{ title?: string, content?: string, tags?: string[], path?: string }` | `Note`                             | Create a new note. If `path` is provided, it becomes the note ID (e.g., `work/meeting`). |
| `notes.update` | `{ id: string, content?: string, tags?: string[] }`                    | `Note`                             | Update a note's content and/or front matter.                                             |
| `notes.delete` | `{ id: string }`                                                       | `void`                             | Delete a note.                                                                           |
| `notes.search` | `{ query: string }`                                                    | `NoteMeta[]`                       | Full-text search across notes.                                                           |
| `notes.tags`   | `void`                                                                 | `{ tag: string, count: number }[]` | List all unique tags with counts.                                                        |

### Data Model

```ts
interface Note {
  id: string; // Relative path without .md (e.g. "work/meeting-notes")
  title: string;
  tags: string[];
  content: string; // Raw Markdown including front matter
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
```
