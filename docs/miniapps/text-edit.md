# TextEdit MiniApp Specification

## Overview

The TextEdit MiniApp is a code and plain-text editor powered by [Monaco Editor](https://microsoft.github.io/monaco-editor/) (the editor component from VS Code). It opens text files, source code, and Markdown as raw text, treating every file as plain text with syntax highlighting determined by the file extension.

TextEdit is launched from the File Explorer when a user opens a text-based file, or by the AI when it needs to view or edit a file's raw content.

## Features

### Core

- Open and edit text files, source code, and Markdown from the user's home directory.
- Syntax highlighting for common languages (TypeScript, JavaScript, Python, JSON, HTML, CSS, Markdown, YAML, TOML, Shell, etc.) — detected from file extension.
- Standard editor features provided by Monaco: line numbers, minimap, bracket matching, auto-indent, find & replace, multi-cursor, code folding.
- Save files manually (Cmd/Ctrl+S) or via auto-save after a configurable debounce (default 1 second of inactivity).
- Read-only mode for files opened as view-only.
- Display unsaved-changes indicator in the tab/title.

### Integration with File Explorer

- Double-clicking a supported text file in the File Explorer opens TextEdit.
- TextEdit receives the file path via launch `args`.
- If the file cannot be read (binary, too large, not found), TextEdit shows an error message.

### Supported File Types

TextEdit opens any file whose content is valid UTF-8 text. Language detection for syntax highlighting is based on the file extension:

| Extensions                             | Language   |
| -------------------------------------- | ---------- |
| `.ts`, `.tsx`                          | TypeScript |
| `.js`, `.jsx`, `.mjs`, `.cjs`          | JavaScript |
| `.py`                                  | Python     |
| `.json`, `.jsonc`                      | JSON       |
| `.html`, `.htm`                        | HTML       |
| `.css`                                 | CSS        |
| `.scss`, `.sass`                       | SCSS       |
| `.md`, `.markdown`                     | Markdown   |
| `.yaml`, `.yml`                        | YAML       |
| `.toml`                                | TOML       |
| `.sh`, `.bash`, `.zsh`                 | Shell      |
| `.xml`, `.svg`                         | XML        |
| `.sql`                                 | SQL        |
| `.rs`                                  | Rust       |
| `.go`                                  | Go         |
| `.java`                                | Java       |
| `.c`, `.h`                             | C          |
| `.cpp`, `.hpp`, `.cc`                  | C++        |
| `.rb`                                  | Ruby       |
| `.txt`, `.log`, and unknown extensions | Plain Text |

Monaco ships with built-in language support for most of these. No additional grammar packages are required for the initial version.

## UI Layout

```
|----------------------------------------------|
| filename.ts (modified)          [Save] [···]  |
|----------------------------------------------|
|                                              |
|   Monaco Editor                              |
|   (full window, syntax highlighted)          |
|                                              |
|----------------------------------------------|
| Ln 42, Col 18    UTF-8    TypeScript    LF   |
|----------------------------------------------|
```

Note: The Actions Bar is a global element managed by the core shell (see `docs/spec.md`). MiniApps register their actions via `<ActionsProvider>`, but the bar itself is not part of the MiniApp window.

| Element    | Description                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| Title Bar  | Shows the filename, modified indicator, a Save button (disabled when clean), and an overflow menu.              |
| Editor     | Full-window Monaco Editor instance. Fills all available space between the title bar and the status bar.         |
| Status Bar | Shows cursor position (line/column), file encoding (UTF-8), detected language, and line ending style (LF/CRLF). |

## Frontend

### Editor

Use [Monaco Editor](https://microsoft.github.io/monaco-editor/) via the `monaco-editor` npm package.

- Render the editor in a single full-window pane — no sidebar or split view.
- Detect language from the file extension and set the Monaco language mode accordingly.
- Enable built-in features: line numbers, minimap, bracket matching, auto-indent, code folding, find & replace (Cmd/Ctrl+F).
- Listen for model content changes to track dirty state and trigger auto-save.
- Auto-save after 1 second of inactivity (debounced). Show a brief "Saved" indicator on auto-save.
- Support Cmd/Ctrl+S for manual save.
- Resize the editor when the window resizes (`editor.layout()`).

### Components

| Component         | Responsibility                                                              |
| ----------------- | --------------------------------------------------------------------------- |
| `TextEditApp`     | Root component. Manages file state, initializes Monaco, handles save logic. |
| `EditorTitleBar`  | Displays filename, modified indicator, Save button.                         |
| `EditorStatusBar` | Displays cursor position, encoding, language, line endings.                 |
| `TextEditActions` | Provides actions via `<ActionsProvider>`.                                   |

## Actions (AI-invokable)

| Action                | Description                                             | Parameters                             |
| --------------------- | ------------------------------------------------------- | -------------------------------------- |
| `Open File`           | Open a file by path in the editor.                      | `path: string`                         |
| `Get Editing Context` | Return the current editor state for the open file.      | —                                      |
| `Edit File`           | Apply a text replacement to the current file's content. | `old_text: string`, `new_text: string` |
| `Save`                | Save the current file immediately.                      | —                                      |

### AI File Editing

The AI can read and modify the content of the currently open file through an action-based flow. All edits go through the MiniApp's action broker so the editor stays in control of the edit lifecycle.

#### Design Rationale

- **Action-based, not filesystem-based.** The MiniApp frontend owns the edit lifecycle. The Monaco editor can visualize diffs, highlight changes, and maintain undo history without external file watchers.
- **Mirrors `edit` tool semantics.** The `Edit File` action uses `old_text` / `new_text` parameters — the same model as the pi-coding-agent's built-in `edit` tool.
- **Separate context retrieval.** `Get Editing Context` provides the full file content and cursor state so the AI can reason about precise replacements.

#### `Get Editing Context` Action

Returns the current editor state so the AI has full context before making edits.

**Parameters:** None.

**Returns:**

```ts
interface EditingContext {
  path: string; // Relative file path (e.g. "src/index.ts")
  language: string; // Detected language (e.g. "typescript")
  content: string; // Full file content
  cursorLine: number; // 1-indexed line number of the cursor
  cursorColumn: number; // 1-indexed column number of the cursor
  selectedText: string; // Currently selected text (empty string if none)
  isDirty: boolean; // true if there are unsaved changes
  totalLines: number; // Total number of lines in the file
}
```

If no file is open, the action returns an error string.

#### `Edit File` Action

Applies a single text replacement to the file content in the editor.

**Parameters:**

| Param      | Type     | Required | Description                                                                      |
| ---------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `old_text` | `string` | yes      | Exact text to find in the file content. Must match exactly and appear only once. |
| `new_text` | `string` | yes      | Replacement text.                                                                |

**Returns:**

```ts
interface EditFileResult {
  success: boolean;
  diff: string; // Unified diff of the change
  firstChangedLine: number; // 1-indexed line of first change
}
```

**Edit mechanics:**

- The replacement is applied via the Monaco editor API (`editor.executeEdits`) so it integrates with the undo stack.
- After applying, the editor scrolls to `firstChangedLine` and briefly highlights the changed region.
- Auto-save triggers normally after the edit (debounced).

**Handling inserts and appends:**

All operations use `old_text`/`new_text`:

- **Insert at cursor:** Use the text on the cursor line as `old_text`, include the new content in `new_text`.
- **Append to end:** Use the last line as `old_text`, append content in `new_text`.
- **Insert at beginning:** Use the first line as `old_text`, prepend content in `new_text`.
- **Empty file:** `old_text: ""` is treated as "insert at beginning."

**Error cases:**

- `old_text` not found → `{ success: false, error: "Text not found in file" }`
- `old_text` found multiple times → `{ success: false, error: "Text appears N times; provide more surrounding context to make it unique" }`
- No file open → `{ success: false, error: "No file is currently open" }`

#### Flow

```
User: "Fix the bug on line 15"
  │
  ▼
AI calls action("Get Editing Context")
  │  ← returns { path, language, content, cursorLine, ... }
  ▼
AI reasons about the content, identifies the fix
  │
  ▼
AI calls action("Edit File", { old_text: "if (x = 5)", new_text: "if (x === 5)" })
  │
  ├─► Frontend handler:
  │     1. Finds `old_text` in the Monaco model content
  │     2. Applies replacement via editor.executeEdits (preserves undo stack)
  │     3. Scrolls to the changed line and highlights it
  │     4. Triggers auto-save (debounced)
  │     5. Returns { success, diff, firstChangedLine } to AI
  │
  ▼
AI responds to user with summary of changes
```

```
User: "Open my config file and add a new entry"
  │
  ▼
AI calls action("Open File", { path: "config.json" })
  │
  ▼
AI calls action("Get Editing Context")
  │  ← returns full file content
  ▼
AI calls action("Edit File", { old_text: "\"key\": \"value\"\n}", new_text: "\"key\": \"value\",\n  \"newKey\": \"newValue\"\n}" })
  │
  ▼
AI responds with confirmation
```

## Backend

The TextEdit MiniApp does not implement its own HTTP server. All backend logic runs inside the `activate` function and communicates with the frontend via the core's messaging and filesystem hooks (see `docs/spec.md` — MiniApp System).

### Root Directory

Operates within the authenticated user's home directory via `ctx.fs` (`<data>/home/<username>/`). All file paths in commands are relative to this root. The core's `FileSystemHook` enforces scoping and prevents directory traversal.

### Commands (via MessagingHook)

| Command         | Request                             | Response                                  | Description                                        |
| --------------- | ----------------------------------- | ----------------------------------------- | -------------------------------------------------- |
| `textedit.open` | `{ path: string }`                  | `TextEditFile`                            | Read a file and return its content for the editor. |
| `textedit.save` | `{ path: string, content: string }` | `{ success: boolean, updatedAt: string }` | Write content back to the file.                    |

The backend is intentionally minimal — TextEdit's core operations are read and write. The frontend handles all editor state, language detection, and dirty tracking.

### Data Model

```ts
interface TextEditFile {
  path: string; // Relative to user home (e.g. "src/index.ts")
  name: string; // Filename (e.g. "index.ts")
  content: string; // Full file content as UTF-8 text
  size: number; // File size in bytes
  modifiedAt: string; // ISO 8601 last-modified timestamp
}
```

### Size Limit

Files larger than 5 MB are rejected by the `textedit.open` command with an error message. This prevents the browser from stalling on very large files. The limit can be adjusted in a future version.

### Security

- All paths are resolved by the core's `FileSystemHook`, which scopes access to the authenticated user's home directory and prevents directory traversal.
- Binary files are detected by checking for null bytes in the first 8 KB; if found, the open command returns an error.
- Core-managed dot-prefixed directories (`.data`, `.storage`, `.cache`, `.ai-sessions`) are accessible for editing (unlike File Explorer which hides them) since developers may need to inspect configuration or data files.
