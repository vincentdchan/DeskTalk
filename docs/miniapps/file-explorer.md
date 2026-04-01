# File Explorer MiniApp Specification

## Overview

The File Explorer MiniApp is a system-level filesystem browser that lets users navigate directories, view files, and perform basic file operations within their home directory (`<data>/home/<username>/`). It cannot access the host OS filesystem, other users' home directories, or any path outside this sandbox. Core-managed dot-prefixed directories (`.data`, `.storage`, `.cache`, `.ai-sessions`) are hidden from listings by default. See [user-management.md](../user-management.md) for the full data directory layout.

## Features

### Core

- Browse directories and files in a tree or list view.
- Navigate using breadcrumbs and back/forward buttons.
- Open files in the appropriate MiniApp (text files in TextEdit, images in Preview).
- Create, rename, and delete files and directories.
- Copy and move files via context menu or actions.

### File Display

- Text files (`.md`, `.txt`, `.json`, `.ts`, `.js`, etc.) open in the **TextEdit** MiniApp on double-click.
- Image files (`.png`, `.jpg`, `.jpeg`, `.webp`) open in the **Preview** MiniApp on double-click.
- HTML files (`.html`) open in the **Preview** MiniApp for iframe rendering.
- Audio files (`.mp3`, `.wav`, `.ogg`, `.flac`, `.aac`, `.m4a`) open in the **Player** MiniApp on double-click.
- Video files (`.mp4`, `.webm`, `.mov`) open in the **Player** MiniApp on double-click.
- Other files show name, size, type, and last-modified metadata in an inline pane.

## UI Layout

```
|-------------------------------------|
| < > | ~ / documents                 |
|-------------------------------------|
|  Name          | Size   | Modified  |
|  docs/         |   --   | Mar 13    |
|  notes.md      | 2.4 KB | Mar 12    |
|  image.png     | 340 KB | Mar 10    |
|-------------------------------------|
```

The breadcrumb root `~` represents the user's home directory (`<data>/home/<username>/`). Users never see or interact with absolute OS paths. Dot-prefixed directories (`.data`, `.storage`, etc.) are hidden from listings.

Note: The Actions Bar is a global element managed by the core shell (see `docs/spec.md`). MiniApps register their actions via `<ActionsProvider>`, but the bar itself is not part of the MiniApp window.

| Element    | Description                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation | Back/forward buttons and a breadcrumb path bar. The root `~` represents the user's home directory. Includes a view mode toggle (list/icon). |
| File List  | Table of directory contents with name, size, and last-modified columns. Sortable by clicking column headers.                                |
| File Grid  | Icon/grid view showing thumbnails for images and icons for other files. Toggle with the view mode button.                                   |

### Interactions

- Double-click a directory to navigate into it.
- Double-click a text file (`.md`, `.txt`, `.json`, `.ts`, `.js`, `.py`, `.yaml`, `.toml`, `.css`, `.sh`, etc.) to open it in the **TextEdit** MiniApp.
- Double-click an `.html` file to open it in the **Preview** MiniApp (HTML mode).
- Double-click an image file (`.png`, `.jpg`, `.jpeg`, `.webp`) to open it in the **Preview** MiniApp.
- Double-click an audio file (`.mp3`, `.wav`, `.ogg`, `.flac`, `.aac`, `.m4a`) to open it in the **Player** MiniApp.
- Double-click a video file (`.mp4`, `.webm`, `.mov`) to open it in the **Player** MiniApp.
- Double-click other file types to open an inline metadata/preview pane.
- Right-click for a context menu with `Open`, `Open with`, rename, delete, copy, and move actions.
- Drag and drop for moving files (optional stretch goal).

### Integration with Other MiniApps

When a user double-clicks a file, the File Explorer determines which MiniApp to open based on the file extension:

| File type               | Target MiniApp | Launch `args`                 |
| ----------------------- | -------------- | ----------------------------- |
| Text / code / Markdown  | TextEdit       | `{ path: "<relative-path>" }` |
| HTML                    | Preview        | `{ path: "<relative-path>" }` |
| Image (JPEG, PNG, WebP) | Preview        | `{ path: "<relative-path>" }` |
| Audio (MP3, WAV, etc.)  | Player         | `{ path: "<relative-path>" }` |
| Video (MP4, WebM, MOV)  | Player         | `{ path: "<relative-path>" }` |
| Other                   | (inline pane)  | —                             |

The File Explorer opens the target MiniApp by requesting the core to launch a new window with the appropriate `miniAppId` and `args`. The `path` value is the file's path relative to the user's home directory (e.g., `"documents/notes.md"`). See [miniapp-development.md](../miniapp-development.md) — Launch Arguments for how `args` are passed to the target MiniApp's `activate(ctx)`.

The `Open` context menu entry uses the same default app resolution as double-click.

The `Open with` context menu entry lets the user choose a MiniApp manually, overriding the default extension-based routing. It only shows MiniApps whose manifest declares support for the file's extension or MIME type.

## Frontend Components

| Component        | Responsibility                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `FileBreadcrumb` | Displays the current path as clickable breadcrumb segments. The root segment shows `~` to represent the user's home directory. |
| `FileList`       | Table of files and directories with sorting.                                                                                   |
| `FileGrid`       | Icon/grid view showing thumbnails for images and icons for other files.                                                        |
| `FilePreview`    | Displays file content or metadata.                                                                                             |
| `FileActions`    | Provides actions via `<ActionsProvider>`.                                                                                      |

### View Modes

The File Explorer supports two view modes:

- **List view**: Table layout with columns for name, size, and modification date. Supports sorting by clicking column headers.
- **Icon view**: Grid layout showing thumbnails for images and large icons for other files and directories.

Users can toggle between view modes using the buttons in the navigation bar (☰ for list, ⊞ for icons). The view mode preference is persisted to `ctx.storage` (`<data>/home/<username>/.storage/file-explorer.json`) and restored on the next session.

## Actions (AI-invokable)

| Action             | Description                                                                                            | Parameters                         |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `List Files`       | List files and directories in the current folder. Returns up to `limit` entries (default 50, max 200). | `limit?: number`                   |
| `Navigate`         | Navigate to a directory.                                                                               | `path: string`                     |
| `Create File`      | Create a new file.                                                                                     | `name: string`, `content?: string` |
| `Create Directory` | Create a new directory.                                                                                | `name: string`                     |
| `Delete`           | Delete a file or directory.                                                                            | `path: string`                     |
| `Rename`           | Rename a file or directory.                                                                            | `path: string`, `newName: string`  |

## Backend

The File Explorer MiniApp does not implement its own HTTP server. All backend logic runs inside the `activate` function and communicates with the frontend via the core's messaging and filesystem hooks (see `docs/spec.md` — MiniApp System).

### Root Directory

The file explorer operates within the authenticated user's home directory (`<data>/home/<username>/`) via `ctx.fs`. All paths in commands and UI are relative to this root — `"."` means the home directory itself, `"documents"` means `<data>/home/<username>/documents`, etc. Core-managed dot-prefixed directories (`.data`, `.storage`, `.cache`, `.ai-sessions`) are excluded from directory listings by default. The core's `FileSystemHook` enforces scoping to the home directory and prevents directory traversal. The MiniApp never sees or exposes absolute OS paths.

### Commands (via MessagingHook)

| Command        | Request                                                           | Response                                | Description                 |
| -------------- | ----------------------------------------------------------------- | --------------------------------------- | --------------------------- |
| `files.list`   | `{ path: string }`                                                | `FileEntry[]`                           | List directory contents.    |
| `files.read`   | `{ path: string }`                                                | `{ content: string, mimeType: string }` | Read a file's content.      |
| `files.create` | `{ path: string, type: 'file' \| 'directory', content?: string }` | `FileEntry`                             | Create a file or directory. |
| `files.rename` | `{ path: string, newName: string }`                               | `FileEntry`                             | Rename a file or directory. |
| `files.delete` | `{ path: string }`                                                | `void`                                  | Delete a file or directory. |
| `files.move`   | `{ source: string, destination: string }`                         | `FileEntry`                             | Move a file or directory.   |
| `files.copy`   | `{ source: string, destination: string }`                         | `FileEntry`                             | Copy a file or directory.   |
| `prefs.get`    | `void`                                                            | `{ viewMode: 'list' \| 'icon' }`        | Get view mode preference.   |
| `prefs.set`    | `{ viewMode: 'list' \| 'icon' }`                                  | `void`                                  | Set view mode preference.   |

### Thumbnail API

Image thumbnails for the icon view are served via an HTTP endpoint:

```
GET /api/files/thumbnail?path=<relative-path>&size=<64|96|128>
```

**Query Parameters:**

- `path` (required): Relative path to the image file within the user's home directory.
- `size` (optional): Thumbnail size in pixels. Supported: 64, 96, 128. Default: 96.

**Response:**

- Success: `200 OK` with `image/png` body
- Error: `400` (invalid path), `403` (access denied), `404` (not found or not an image), `500` (thumbnail generation failed)

**Features:**

- Thumbnails are generated on-demand using `sharp` and cached to disk at `<data>/home/<username>/.cache/file-explorer/thumbs/<hash>_<size>.png`.
- Cache is invalidated automatically when the source file's modification time changes.
- Supported image formats: PNG, JPEG, WebP, GIF, BMP.
- Returns appropriate `Cache-Control` headers for browser caching.

### Data Model

```ts
interface FileEntry {
  name: string;
  path: string; // Relative to root
  type: 'file' | 'directory';
  size: number | null; // Bytes, null for directories
  mimeType: string | null;
  modifiedAt: string; // ISO 8601
}
```

### Security

- All paths are resolved by the core's `FileSystemHook`, which scopes access to the authenticated user's home directory and prevents directory traversal.
- Core-managed dot-prefixed directories (`.data`, `.storage`, `.cache`, `.ai-sessions`) are hidden from listings.
- Symlinks pointing outside the home directory are not followed.
- Users cannot access other users' home directories or any system-level paths. See [user-management.md](../user-management.md) for the isolation model.
