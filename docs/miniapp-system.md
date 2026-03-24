# MiniApp System

This document describes the MiniApp architecture — the heavyweight, process-isolated application model in DeskTalk. MiniApps are the foundation for built-in features (File Explorer, Preview, Preference, Terminal, Text Edit). For the overall system spec and the lightweight AI-generated LiveApp model, see [spec.md](./spec.md). For how to build a MiniApp, see [miniapp-development.md](./miniapp-development.md).

## Overview

The MiniApp system follows the same principles as VSCode extensions:

- MiniApps are **npm packages** that export a set of well-defined interfaces.
- They are **discovered and activated** by the core host, not self-started.
- They communicate with the backend exclusively through **hooks provided by the core**, never by creating their own HTTP servers or routes.
- The core is the single authority for networking, storage, and lifecycle.
- The core enforces **permission-based access control** — certain privileged APIs (e.g., global configuration) are only available to authorized MiniApps (see [Privileged Access & Permissions](#privileged-access--permissions)).

## MiniApp Manifest

Each MiniApp exports a `MiniAppManifest`:

```ts
interface MiniAppManifest {
  id: string; // Unique identifier, e.g. "file-explorer"
  name: string; // Display name shown in the Dock
  icon: string; // Emoji fallback
  iconPng?: string; // Optional PNG icon URL served by core
  version: string; // SemVer version
  description?: string; // Human-readable description
}
```

## Registration and Activation

1. **Built-in MiniApps** — the core dynamically imports each built-in backend module (e.g., `@desktalk/miniapp-file-explorer/backend`), reads its manifest, and registers it at startup.
2. **Third-party MiniApps** — installed via `desktalk install <package-name>` into `<data>/miniapps/`. The core reads each installed package's exported manifest to register it.
3. **Activation** — when a user opens a MiniApp, the core spawns an isolated child process for that (MiniApp, user) pair via `BackendProcessManager`. Each process gets scoped paths, storage, and messaging hooks.
4. **Deactivation** — when the last window for a MiniApp is closed, the core kills the child process.

### Process Isolation

Each activated MiniApp runs in its own Node.js child process, forked from the core. This provides:

- **Fault isolation** — a crash in one MiniApp does not affect others.
- **Resource scoping** — each process has its own memory space and event loop.
- **Security boundary** — MiniApps cannot directly access each other's state.

## Installation

MiniApps are installed and managed via the CLI, similar to `code --install-extension`:

```bash
# Install a MiniApp from npm
desktalk install <package-name>

# Uninstall a MiniApp
desktalk uninstall <package-name>

# List installed MiniApps
desktalk list
```

**How it works:**

1. `desktalk install` runs `pnpm install <package-name>` into the MiniApp packages directory (`<data>/miniapps/`).
2. The core reads each installed package's exported manifest to register it.
3. Built-in MiniApps ship with the core package and are always available — they follow the same interfaces as third-party MiniApps.

## Workspace Directory (MiniApp Scoping)

Each MiniApp gets scoped paths under the user's home directory:

| Path                                        | Purpose                        | Accessed via      |
| ------------------------------------------- | ------------------------------ | ----------------- |
| `<data>/home/<username>/.data/<id>/`        | MiniApp-private data directory | `ctx.paths.data`  |
| `<data>/home/<username>/.storage/<id>.json` | Scoped key-value store (JSON)  | `ctx.storage`     |
| `<logs>/<username>/<id>.log`                | Scoped log output              | `ctx.logger`      |
| `<data>/home/<username>/.cache/<id>/`       | Scoped cache directory         | `ctx.paths.cache` |

MiniApps never know or control other users' absolute paths. The core creates each user's home structure automatically and resolves all `ctx.fs` paths relative to `<data>/home/<username>/`.

## Privileged Access & Permissions

The global configuration file (`<config>/config.toml`) stores all application settings in [TOML](https://toml.io) format. The core is the sole owner of this file — it handles all reads, writes, parsing, and serialization. MiniApps (including Preference) never touch the file directly; they go through the core's `ConfigHook` API. Because the config controls critical application behavior — server bind address, AI credentials, window defaults, dock layout, etc. — the core enforces strict access control.

### Design Principle

Only the **Preference MiniApp** (`id: "preference"`) is authorized to read and write the global configuration. All other MiniApps — both built-in and third-party — are denied access. This is enforced at the core level, not by convention.

### ConfigHook (Privileged)

The core provides a `ConfigHook` interface for reading and writing the global configuration. The core manages all file I/O internally (`<config>/config.toml`) — the hook exposes only a typed key-value API. This hook is **only** injected into the `MiniAppContext` when the MiniApp's manifest declares `id: "preference"`. For all other MiniApps, `ctx.config` is `undefined`.

```ts
interface ConfigHook {
  getAll(): Promise<Config>;
  get(key: string): Promise<string | number | boolean | undefined>;
  set(key: string, value: string | number | boolean): Promise<void>;
  reset(key: string): Promise<void>;
  resetAll(): Promise<void>;
}
```

### Enforcement Rules

| Rule                        | Description                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manifest ID check**       | At activation time, the core checks `manifest.id`. Only `"preference"` receives `ctx.config`. All other IDs receive `ctx.config === undefined`.                                                       |
| **Built-in only**           | The Preference MiniApp ships as a built-in package. Third-party packages cannot claim the `"preference"` ID — the core rejects duplicate IDs, and built-in MiniApps take priority.                    |
| **Command namespace guard** | The `preferences.*` command namespace is reserved. The core rejects any `ctx.messaging.onCommand('preferences.*', ...)` registration from MiniApps other than `"preference"`.                         |
| **Config file permissions** | The core writes `<config>/config.toml` with restricted filesystem permissions (`0600`) so only the current user can read it.                                                                          |
| **Read-only broadcast**     | When a config value changes, the core broadcasts a `config:changed` event to all MiniApps. The event payload contains only the changed key and new value — never the full config or sensitive fields. |

### How Other MiniApps React to Config Changes

MiniApps that need to respond to configuration changes subscribe to the `config:changed` event via `ctx.messaging`:

```ts
ctx.messaging.onEvent(
  'config:changed',
  (change: { key: string; value: string | number | boolean }) => {
    if (change.key === 'general.theme') {
      // React to theme change
    }
  },
);
```

The core also provides a read-only API for non-sensitive settings that any MiniApp can query:

```ts
ctx.messaging.onCommand('config.getPublic', async (data: { key: string }) => { ... });
```

## Entry Points

Each MiniApp has **two separate entry files**:

- **Backend** (`src/backend.ts`) — exports `manifest`, `activate(ctx)`, and `deactivate()`. Handles command registration, storage, and filesystem access.
- **Frontend** (`src/frontend.tsx`) — exports an `activate(ctx)` hook that mounts UI into the provided root element and returns a per-window cleanup handle.

The `@desktalk/sdk` package provides a standard build CLI (`desktalk-build`) so MiniApp authors do not need to configure their own bundler.

For the full development guide, see [miniapp-development.md](./miniapp-development.md).

## Built-in MiniApps

DeskTalk ships with five built-in MiniApps. Each has its own detailed spec in `docs/miniapps/`.

| MiniApp       | Summary                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File Explorer | Simple filesystem browser.                                                                                                                                    |
| Preview       | Content viewer supporting images and HTML files. Also serves as the **LiveApp renderer** — it hosts the sandboxed iframe that displays AI-generated LiveApps. |
| Preference    | App and window configuration UI. Privileged — sole MiniApp with write access to global config.                                                                |
| Terminal      | Terminal emulator powered by xterm.js.                                                                                                                        |
| Text Edit     | Plain text file editor.                                                                                                                                       |
