# MiniApp Development Guide

This document describes how to build a MiniApp for DeskTalk. It covers the package structure, entry files, exported interfaces, lifecycle, communication hooks, and the standard build toolchain.

For the overall system architecture, workspace directories, and installation mechanics, see [spec.md](./spec.md).

## Package Structure

Every MiniApp is an npm package with **two separate entry files** — one for the backend (Node.js) and one for the frontend (browser). The core loads each independently: the backend entry runs on the server, and the frontend entry is bundled for the browser.

```
miniapp-note/
  src/
    backend.ts          # Backend entry — exports manifest, activate(), deactivate()
    frontend.tsx        # Frontend entry — exports activate() and returns cleanup per window
  icons/
    miniapp-note-icon.png
    components/         # React components (imported by frontend.tsx)
    ...
  package.json
  tsconfig.build.json
```

### package.json

```json
{
  "name": "@desktalk/miniapp-note",
  "version": "0.1.0",
  "type": "module",
  "icon": "./icons/miniapp-note-icon.png",
  "exports": {
    "./backend": {
      "types": "./dist/backend.d.ts",
      "import": "./dist/backend.js"
    },
    "./frontend": {
      "types": "./dist/frontend.d.ts",
      "import": "./dist/frontend.js"
    }
  },
  "scripts": {
    "build": "desktalk-build"
  },
  "dependencies": {
    "@desktalk/sdk": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

The two sub-path exports (`./backend` and `./frontend`) allow the core to import them separately:

```ts
// Server-side — imports only the backend entry
import { manifest, activate, deactivate } from '@desktalk/miniapp-note/backend';

// Frontend bundle — imports only the frontend entry
import { activate, deactivate } from '@desktalk/miniapp-note/frontend';
```

If `package.json` includes a top-level `icon` field pointing to a PNG file, `desktalk-build` records that file in `dist/meta.json` and the core exposes it as `manifest.iconPng` through a backend-served URL for the Dock. Keep `manifest.icon` as a text fallback for cases where the packaged image is missing.

### Icon config

- Put the Dock icon in a PNG file inside the MiniApp package, for example `./icons/miniapp-note-icon.png`.
- Reference that file from the top-level `icon` field in `package.json`.
- Keep `manifest.icon` in `src/backend.ts` as a fallback emoji or short text icon.
- `desktalk-build` reads the PNG path and writes that metadata into `dist/meta.json`.
- At runtime the core serves the icon through its backend and merges the resulting URL into `manifest.iconPng`, so the Dock prefers `manifest.iconPng` and falls back to `manifest.icon`.

## Backend Entry (`backend.ts`)

The backend entry runs on the DeskTalk Node.js server. It exports the MiniApp's metadata and lifecycle hooks. It should **never** import React or any browser-only code.

```ts
import type { MiniAppManifest, MiniAppContext, MiniAppBackendActivation } from '@desktalk/sdk';

/**
 * Static metadata — read by the core at discovery time.
 * Analogous to the `contributes` section in a VSCode extension's package.json.
 */
export const manifest: MiniAppManifest = {
  id: 'note',
  name: 'Note',
  icon: '\uD83D\uDDD2\uFE0F',
  version: '1.0.0',
  description: 'Markdown note-taking with tags and YAML front matter',
};

/**
 * Called once when the MiniApp is activated (window first opened).
 * Receives a context object with hooks for communicating with the host.
 * Analogous to VSCode's `activate(context: ExtensionContext)`.
 */
export function activate(ctx: MiniAppContext): MiniAppBackendActivation {
  // Register backend command handlers
  ctx.messaging.onCommand('notes.list', async () => {
    const notes = await ctx.storage.query<Note>({ prefix: 'note:' });
    return notes;
  });

  ctx.messaging.onCommand('notes.create', async (data: { title: string; content: string }) => {
    const note = { id: slug(data.title), ...data, createdAt: new Date().toISOString() };
    await ctx.storage.set(`note:${note.id}`, note);
    return note;
  });

  return {};
}

/**
 * Called when the MiniApp is deactivated (all windows closed, or uninstall).
 * Clean up resources. Analogous to VSCode's `deactivate()`.
 */
export function deactivate(): void {
  // cleanup
}
```

## Frontend Entry (`frontend.tsx`)

The frontend entry runs in the browser. It exports `activate()` and returns a per-window cleanup handle. The core provides a root DOM element and metadata via a `MiniAppFrontendContext`, and the MiniApp mounts its own UI into that element.

React is the recommended framework, but MiniApps can use any framework. The core exposes `React` and `ReactDOM` on `window`, so MiniApps share the core's single React instance rather than bundling their own copies. The build tool (`desktalk-build`) automatically resolves React imports to these window globals.

```tsx
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { MiniAppFrontendActivation, MiniAppFrontendContext } from '@desktalk/sdk';
import {
  useCommand,
  ActionsProvider,
  Action,
  MiniAppIdProvider,
  WindowIdProvider,
} from '@desktalk/sdk';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

function NoteApp() {
  const listNotes = useCommand<void, Note[]>('notes.list');
  const createNote = useCommand<{ title: string; content: string }, Note>('notes.create');
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    listNotes().then(setNotes);
  }, []);

  return (
    <ActionsProvider>
      <Action
        name="Create Note"
        description="Create a new note"
        handler={async (params) => {
          const note = await createNote(params as { title: string; content: string });
          setNotes((prev) => [...prev, note]);
          return note;
        }}
      />
      <div>
        <h2>Notes</h2>
        {notes.map((n) => (
          <div key={n.id}>{n.title}</div>
        ))}
      </div>
    </ActionsProvider>
  );
}

export function activate(ctx: MiniAppFrontendContext): MiniAppFrontendActivation {
  const root = createRoot(ctx.root);
  root.render(
    <WindowIdProvider windowId={ctx.windowId}>
      <MiniAppIdProvider miniAppId={ctx.miniAppId}>
        <NoteApp />
      </MiniAppIdProvider>
    </WindowIdProvider>,
  );

  return {
    deactivate() {
      root.unmount();
    },
  };
}
```

## Exported Interfaces

### MiniAppManifest

```ts
export interface MiniAppManifest {
  /** Unique identifier, e.g. "note" */
  id: string;
  /** Display name shown in the Dock */
  name: string;
  /** Icon fallback (emoji/text) */
  icon: string;
  /** Optional packaged PNG icon served by the core as a URL */
  iconPng?: string;
  /** SemVer version */
  version: string;
  /** Optional human-readable description */
  description?: string;
}
```

### MiniAppBackendActivation

```ts
export interface MiniAppBackendActivation {
  /**
   * Reserved for future use (e.g., contribution points).
   * Backend activate() no longer returns a React component.
   */
}
```

### MiniAppFrontendActivation

Returned from the frontend `activate()` function. Each open window gets its own activation object so cleanup stays instance-safe even when multiple windows of the same MiniApp are open.

```ts
export interface MiniAppFrontendActivation {
  deactivate(): void;
}
```

### MiniAppFrontendContext

The context object passed to the frontend `activate()` function. Contains the root DOM element where the MiniApp should mount its UI, plus metadata about the MiniApp and window.

```ts
export interface MiniAppFrontendContext {
  /** Root DOM element where the MiniApp should mount its UI */
  root: HTMLElement;
  /** The MiniApp's unique identifier */
  miniAppId: string;
  /** The window's unique identifier */
  windowId: string;
  /** Optional launch arguments passed when the window was opened (e.g. by the AI). */
  args?: Record<string, unknown>;
}
```

## Lifecycle

| Phase            | Trigger                                    | What happens                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Discovery**    | `desktalk start`                           | Core scans installed packages and reads each `manifest` export from the backend entry. Icons appear in the Dock.                                                                                                                                                                                                              |
| **Activation**   | User opens the MiniApp (or AI triggers it) | Core calls the backend entry's `activate(ctx)` to set up command handlers, then loads the frontend entry and calls its `activate(ctx)` with a root DOM element to mount into. `activate(ctx)` returns a per-window cleanup handle. When the AI opens the window, optional launch `args` are included in the frontend context. |
| **Running**      | User/AI interacts                          | Frontend uses SDK hooks (`useCommand`, `useEvent`) to communicate with backend handlers.                                                                                                                                                                                                                                      |
| **Deactivation** | A window is closed                         | Core calls the returned frontend cleanup handle for that specific window to unmount the UI. When all windows of the MiniApp are closed, the backend entry's `deactivate()` runs and releases backend resources.                                                                                                               |
| **Uninstall**    | `desktalk uninstall <name>`                | Core calls `deactivate()` if active, then removes the package.                                                                                                                                                                                                                                                                |

## Launch Arguments

When the AI opens a MiniApp via the `desktop` tool, it can pass an optional `args` object that is forwarded to the frontend's `activate(ctx)` as `ctx.args`. This allows the AI to provide initial context — for example, telling Preview which file to open immediately.

### How it works

1. **AI tool call** — The AI calls the `desktop` tool with `action: "open"`, `miniAppId`, and an optional `args` object:
   ```json
   { "action": "open", "miniAppId": "preview", "args": { "path": "photos/cat.png" } }
   ```
2. **Core relays** — The core forwards `args` through the WebSocket message to the frontend shell, which stores it in `WindowState` and passes it to `MiniAppFrontendContext`.
3. **Frontend receives** — The MiniApp's `activate(ctx)` receives `ctx.args` and can use it to set initial state.

### Persistence

Launch arguments are persisted as part of `WindowState`. If the user refreshes the browser, the MiniApp window re-opens with the same `args` so `activate()` can restore its initial state.

### Example: Preview MiniApp

```tsx
export function activate(ctx: MiniAppFrontendContext): MiniAppFrontendActivation {
  const initialPath = typeof ctx.args?.path === 'string' ? ctx.args.path : undefined;
  const root = createRoot(ctx.root);
  root.render(
    <WindowIdProvider windowId={ctx.windowId}>
      <MiniAppIdProvider miniAppId={ctx.miniAppId}>
        <PreviewApp initialPath={initialPath} />
      </MiniAppIdProvider>
    </WindowIdProvider>,
  );

  return {
    deactivate() {
      root.unmount();
    },
  };
}
```

Inside `PreviewApp`, use an effect to auto-open the file on mount:

```tsx
useEffect(() => {
  if (!initialPath) return;
  openFile({ path: initialPath }).then(handleFileOpened).catch(console.error);
}, []);
```

### Guidelines for MiniApp authors

- Always validate `ctx.args` defensively — it may be `undefined` or contain unexpected keys.
- Use `args` for initial state only. Do not rely on it for ongoing communication; use `useCommand` and `useEvent` instead.
- Dock-initiated launches (user clicking the icon) do not provide `args`; handle the `undefined` case gracefully.

## Communication Hooks (MiniAppContext)

MiniApps **never** create their own HTTP servers, routes, or direct database connections. Instead, the core provides a `MiniAppContext` object (passed to the backend `activate`) containing hooks for all backend communication. This is analogous to the `vscode` API namespace that VSCode extensions import.

```ts
export interface MiniAppContext {
  /**
   * Resolved absolute paths for this MiniApp, provided by the core.
   * MiniApps should use these instead of constructing paths themselves.
   * Analogous to VSCode's `ExtensionContext.storageUri` / `logUri`.
   */
  paths: MiniAppPaths;

  /**
   * Scoped key-value storage for this MiniApp.
   * Analogous to VSCode's `ExtensionContext.globalState` / `workspaceState`.
   */
  storage: StorageHook;

  /**
   * Filesystem access scoped to the authenticated user's home directory.
   * Analogous to a sandboxed home folder view.
   */
  fs: FileSystemHook;

  /**
   * Send messages between frontend and backend within this MiniApp.
   * Analogous to VSCode's `Webview.postMessage` / `onDidReceiveMessage`.
   */
  messaging: MessagingHook;

  /**
   * Register disposable resources cleaned up on deactivation.
   * Analogous to VSCode's `ExtensionContext.subscriptions`.
   */
  subscriptions: Disposable[];

  /**
   * Logger scoped to this MiniApp.
   */
  logger: Logger;

  /**
   * Privileged access to the global configuration (<config>/config.toml).
   * Only available to the Preference MiniApp (manifest.id === "preference").
   * For all other MiniApps this is `undefined`.
   * The core manages all TOML file I/O internally — the hook exposes only
   * a typed key-value API.
   * See docs/spec.md — Privileged Access & Permissions.
   */
  config?: ConfigHook;
}
```

### MiniAppPaths

The core resolves all platform-specific directories and passes them to the MiniApp at activation. MiniApps never hardcode or guess paths -- they always receive them from the core.

```ts
export interface MiniAppPaths {
  /** Scoped data directory for this MiniApp (e.g., <data>/home/alice/.data/note/) */
  data: string;
  /** Scoped storage file for this MiniApp (e.g., <data>/home/alice/.storage/note.json) */
  storage: string;
  /** Scoped log file for this MiniApp (e.g., <logs>/alice/note.log) */
  log: string;
  /** Scoped cache directory for this MiniApp (e.g., <data>/home/alice/.cache/note/) */
  cache: string;
}
```

### StorageHook

A scoped key-value store persisted by the core at `ctx.paths.storage`. MiniApps never manage their own persistence files. Analogous to VSCode's `ExtensionContext.globalState`.

```ts
interface StorageHook {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
  /** Query entries by prefix or filter */
  query<T>(options: { prefix?: string; filter?: (v: T) => boolean }): Promise<T[]>;
}
```

### FileSystemHook

Scoped filesystem access rooted at the authenticated user's home directory (`<data>/home/<username>/`). All paths passed to these methods are resolved relative to that root. The core prevents traversal outside it. Use `ctx.paths.data` when you need the absolute MiniApp-private directory (`<data>/home/<username>/.data/<miniapp-id>/`). Analogous to a sandboxed `vscode.workspace.fs` rooted at the user's DeskTalk home.

```ts
interface FileSystemHook {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  readDir(path: string): Promise<FileEntry[]>;
  mkdir(path: string): Promise<void>;
  stat(path: string): Promise<FileStat>;
  exists(path: string): Promise<boolean>;
}
```

### MessagingHook

Bidirectional message passing between the MiniApp's frontend (React) and backend (activate context). This replaces direct HTTP endpoints.

```ts
// Backend side (inside activate)
interface MessagingHook {
  /** Register a handler for a named command from the frontend */
  onCommand<TReq, TRes>(command: string, handler: (data: TReq) => Promise<TRes>): Disposable;
  /** Push an event to the frontend */
  emit(event: string, data: unknown): void;
}

// Frontend side (React hooks provided by @desktalk/sdk)
function useCommand<TReq, TRes>(command: string): (data: TReq) => Promise<TRes>;
function useEvent<T>(event: string, handler: (data: T) => void): void;
```

## Build Toolchain

The `@desktalk/sdk` package provides a standard build CLI: **`desktalk-build`**. MiniApp authors do not need to configure esbuild, Vite, or TypeScript output settings themselves.

### Usage

```bash
# In a MiniApp package directory
desktalk-build
```

Or in `package.json`:

```json
{
  "scripts": {
    "build": "desktalk-build"
  }
}
```

### What it does

`desktalk-build` performs two code builds from the MiniApp's package root and also emits MiniApp metadata:

| Output             | Source              | Target           | Format | Notes                                                                                                                                                                                                                                             |
| ------------------ | ------------------- | ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dist/backend.js`  | `src/backend.ts`    | Node.js (es2022) | ESM    | No bundling of `node_modules` -- external dependencies are resolved at runtime.                                                                                                                                                                   |
| `dist/frontend.js` | `src/frontend.tsx`  | Browser (es2022) | ESM    | Bundled with all non-`@desktalk/sdk` imports inlined. React/ReactDOM imports are resolved to window globals provided by the core shell. Imported CSS is compiled and injected automatically from the JS bundle. `@desktalk/sdk` remains external. |
| `dist/meta.json`   | `package.json#icon` | N/A              | JSON   | Optional build metadata. When `package.json.icon` points to a PNG, the relative file path is recorded here so the core can serve it to the Dock UI.                                                                                               |

Both outputs include TypeScript declaration files (`*.d.ts`) and source maps.

### Conventions

- Backend source must be at `src/backend.ts` (or `.js`, `.mjs`).
- Frontend source must be at `src/frontend.tsx` (or `.ts`, `.jsx`, `.js`).
- Dock PNG icons are declared with the top-level `icon` field in `package.json`.
- CSS Modules (`*.module.css`) are supported in frontend builds and auto-injected into `dist/frontend.js`.
- The tool reads `tsconfig.build.json` if present, otherwise uses sensible defaults.

### Configuration (optional)

For advanced cases, a `desktalk.config.ts` file in the package root can override defaults:

```ts
import type { MiniAppBuildConfig } from '@desktalk/sdk/build';

export default {
  backend: {
    entry: 'src/backend.ts', // default
    external: [], // additional externals
  },
  frontend: {
    entry: 'src/frontend.tsx', // default
    external: [], // additional externals beyond react/@desktalk/sdk
  },
} satisfies MiniAppBuildConfig;
```

## Styling

MiniApp frontends import CSS normally and the build tool injects the compiled stylesheet automatically from `dist/frontend.js`. MiniApp authors should not manually create `<style>` tags or maintain separate runtime CSS loader files.

### CSS imports

Place styles in regular CSS files or CSS Modules anywhere in the frontend source tree, then import them from the component that uses them.

```
src/
  styles/
    NoteApp.module.css
  components/
    NoteList.tsx
    NoteEditor.tsx
  frontend.tsx
```

```tsx
import styles from '../styles/NoteApp.module.css';

function NoteList() {
  return <div className={styles.listPanel}>...</div>;
}
```

`desktalk-build` collects every CSS import reachable from `src/frontend.tsx`, compiles it, and prepends a small loader function to `dist/frontend.js`. That loader injects the final stylesheet into `document.head` automatically when the MiniApp frontend module runs.

This works for:

- CSS Modules (`*.module.css`)
- regular CSS files (`*.css`)
- third-party package CSS imported from npm dependencies

There is no separate `dist/frontend.css` artifact to load manually.

### CSS Modules

CSS Modules are processed with esbuild's `local-css` loader, so class names stay scoped to the MiniApp bundle.

To satisfy TypeScript, add a `css-modules.d.ts` declaration file in `src/`:

```ts
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
```

### Global CSS

If you need global rules such as `@keyframes`, resets, or styles for third-party DOM, put them in a normal imported CSS file instead of a manual runtime injection helper. For example:

```tsx
import './styles/editor.css';
import styles from './styles/NoteApp.module.css';
```

Both files will be compiled into the injected stylesheet automatically.

### Summary

| Layer            | File                   | Scope                  | Use for                                               |
| ---------------- | ---------------------- | ---------------------- | ----------------------------------------------------- |
| CSS Modules      | `src/**/*.module.css`  | Locally scoped         | Component layout, colors, spacing, hover/focus states |
| Global CSS       | `src/**/*.css`         | Bundle-wide stylesheet | `@keyframes`, resets, third-party DOM, shared rules   |
| Type declaration | `src/css-modules.d.ts` | N/A                    | TypeScript support for `*.module.css` imports         |
