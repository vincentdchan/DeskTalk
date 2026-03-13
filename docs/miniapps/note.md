# Note MiniApp Specification

## Overview

The Note MiniApp is a Markdown-based note-taking and management tool. It is modeled after the macOS Notes app but uses Markdown as the content format and supports YAML front matter for metadata such as tags.

## Features

### Core

- Create, read, update, and delete notes.
- Each note is stored as a Markdown file with optional YAML front matter.
- Notes are listed in a sidebar sorted by last-modified date (newest first).
- Full-text search across all notes.

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

| Field     | Type       | Description |
|-----------|------------|-------------|
| `title`   | `string`   | Display title (falls back to first heading or filename). |
| `tags`    | `string[]` | List of tags for filtering and organization. |
| `created` | `string`   | ISO 8601 creation timestamp (auto-generated). |

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

| Panel      | Description |
|------------|-------------|
| Tag Filter | Lists all tags. Click to filter the note list. |
| Note List  | Lists notes matching the current filter, showing title and a preview snippet. |
| Editor     | The Milkdown Markdown editor for the selected note. |

## Frontend

### Editor

Use [Milkdown](https://milkdown.dev/) as the WYSIWYG Markdown editor.

- Render Markdown with live preview (WYSIWYG mode).
- Support common Markdown features: headings, bold, italic, lists, code blocks, links, images.
- Provide a toolbar or slash-command menu for formatting.
- Auto-save changes after a short debounce (e.g., 500ms of inactivity).

### Components

| Component       | Responsibility |
|-----------------|---------------|
| `NoteList`      | Displays the list of notes with title, preview, and last-modified time. |
| `NoteEditor`    | Wraps Milkdown. Loads and saves the selected note. |
| `TagFilter`     | Shows all available tags. Handles multi-select filtering. |
| `NoteActions`   | Provides actions via `<ActionsProvider>`. |

## Actions (AI-invokable)

| Action          | Description | Parameters |
|-----------------|-------------|------------|
| `Create Note`   | Create a new note with optional title and content. | `title?: string`, `content?: string`, `tags?: string[]` |
| `Delete Note`   | Delete the currently selected note. | — |
| `Search Notes`  | Search notes by keyword. | `query: string` |
| `Add Tag`       | Add a tag to the current note. | `tag: string` |
| `Remove Tag`    | Remove a tag from the current note. | `tag: string` |

## Backend

The Note MiniApp does not implement its own HTTP server. All backend logic runs inside the `activate` function and communicates with the frontend via the core's messaging and storage hooks (see `docs/spec.md` — MiniApp System).

### Storage

Notes are persisted using `ctx.fs` (rooted at `ctx.paths.data`) for Markdown files and `ctx.storage` (backed by `ctx.paths.storage`) for the note index (id, title, tags, timestamps) used for fast listing and querying. All paths are provided by the core at activation.

### Commands (via MessagingHook)

| Command              | Request | Response | Description |
|----------------------|---------|----------|-------------|
| `notes.list`         | `{ tag?: string }` | `NoteMeta[]` | List all notes, optionally filtered by tag. |
| `notes.get`          | `{ id: string }` | `Note` | Get a single note's full content. |
| `notes.create`       | `{ title?: string, content?: string, tags?: string[] }` | `Note` | Create a new note. |
| `notes.update`       | `{ id: string, content?: string, tags?: string[] }` | `Note` | Update a note's content and/or front matter. |
| `notes.delete`       | `{ id: string }` | `void` | Delete a note. |
| `notes.search`       | `{ query: string }` | `NoteMeta[]` | Full-text search across notes. |
| `notes.tags`         | `void` | `{ tag: string, count: number }[]` | List all unique tags with counts. |

### Data Model

```ts
interface Note {
  id: string;          // Derived from filename (slug)
  title: string;
  tags: string[];
  content: string;     // Raw Markdown including front matter
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
}
```
