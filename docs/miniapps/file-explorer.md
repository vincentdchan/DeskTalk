# File Explorer MiniApp Specification

## Overview

The File Explorer MiniApp is a simple filesystem browser that lets users navigate directories, view files, and perform basic file operations. It operates on the server's filesystem.

## Features

### Core

- Browse directories and files in a tree or list view.
- Navigate using breadcrumbs and back/forward buttons.
- Open files for viewing (text files displayed inline, others show metadata).
- Create, rename, and delete files and directories.
- Copy and move files via context menu or actions.

### File Display

- Text files (`.md`, `.txt`, `.json`, `.ts`, `.js`, etc.) are displayed with syntax highlighting.
- Image files (`.png`, `.jpg`, `.gif`, `.svg`) are displayed inline.
- Other files show name, size, type, and last-modified metadata.

## UI Layout

```
|-------------------------------------|
| < > | /home/user/documents          |
|-------------------------------------|
|  Name          | Size   | Modified  |
|  docs/         |   --   | Mar 13    |
|  notes.md      | 2.4 KB | Mar 12    |
|  image.png     | 340 KB | Mar 10    |
|-------------------------------------|
```

Note: The Actions Bar is a global element managed by the core shell (see `docs/spec.md`). MiniApps register their actions via `<ActionsProvider>`, but the bar itself is not part of the MiniApp window.

| Element       | Description |
|---------------|-------------|
| Navigation    | Back/forward buttons and a breadcrumb path bar. |
| File List     | Table of directory contents with name, size, and last-modified columns. Sortable by clicking column headers. |

### Interactions

- Double-click a directory to navigate into it.
- Double-click a file to open a preview pane.
- Right-click for a context menu (rename, delete, copy, move).
- Drag and drop for moving files (optional stretch goal).

## Frontend Components

| Component          | Responsibility |
|--------------------|---------------|
| `FileBreadcrumb`   | Displays the current path as clickable breadcrumb segments. |
| `FileList`         | Table of files and directories with sorting. |
| `FilePreview`      | Displays file content or metadata. |
| `FileActions`      | Provides actions via `<ActionsProvider>`. |

## Actions (AI-invokable)

| Action            | Description | Parameters |
|-------------------|-------------|------------|
| `Navigate`        | Navigate to a directory. | `path: string` |
| `Create File`     | Create a new file. | `name: string`, `content?: string` |
| `Create Directory`| Create a new directory. | `name: string` |
| `Delete`          | Delete a file or directory. | `path: string` |
| `Rename`          | Rename a file or directory. | `path: string`, `newName: string` |

## Backend

The File Explorer MiniApp does not implement its own HTTP server. All backend logic runs inside the `activate` function and communicates with the frontend via the core's messaging and filesystem hooks (see `docs/spec.md` — MiniApp System).

### Root Directory

The file explorer operates within its scoped data directory (`ctx.paths.data`) via `ctx.fs`. All paths are resolved relative to this root by the core's `FileSystemHook`, which enforces scoping and prevents directory traversal. The path is provided by the core at activation.

### Commands (via MessagingHook)

| Command              | Request | Response | Description |
|----------------------|---------|----------|-------------|
| `files.list`         | `{ path: string }` | `FileEntry[]` | List directory contents. |
| `files.read`         | `{ path: string }` | `{ content: string, mimeType: string }` | Read a file's content. |
| `files.create`       | `{ path: string, type: 'file' \| 'directory', content?: string }` | `FileEntry` | Create a file or directory. |
| `files.rename`       | `{ path: string, newName: string }` | `FileEntry` | Rename a file or directory. |
| `files.delete`       | `{ path: string }` | `void` | Delete a file or directory. |
| `files.move`         | `{ source: string, destination: string }` | `FileEntry` | Move a file or directory. |
| `files.copy`         | `{ source: string, destination: string }` | `FileEntry` | Copy a file or directory. |

### Data Model

```ts
interface FileEntry {
  name: string;
  path: string;          // Relative to root
  type: 'file' | 'directory';
  size: number | null;   // Bytes, null for directories
  mimeType: string | null;
  modifiedAt: string;    // ISO 8601
}
```

### Security

- All paths are resolved by the core's `FileSystemHook`, which scopes access to the MiniApp's data directory and prevents directory traversal.
- Symlinks pointing outside the root are not followed.
