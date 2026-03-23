# DeskTalk - Overall Specification

## Overview

DeskTalk is a browser-based, OS-like desktop environment powered by an AI assistant. Users describe what they need in natural language, and the AI generates **LiveApps** — lightweight, interactive applications that run directly in the desktop. LiveApps are the primary way users create and use software in DeskTalk.

The system is distributed as a single npm package and started via a CLI command. Under the hood, DeskTalk also has a **MiniApp** architecture for built-in features (Note, Todo, File Explorer, etc.), but the user-facing experience centers on AI-generated LiveApps.

## Architecture

### Two App Models

DeskTalk has two distinct application models:

|                | LiveApp                                                                                  | MiniApp                                                 |
| -------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Created by** | AI assistant (via `create_liveapp`)                                                      | Developer (npm package)                                 |
| **Complexity** | Single HTML document + optional co-located assets                                        | Full backend + frontend with process isolation          |
| **Backend**    | None (frontend-only, with bash execution via bridge)                                     | Isolated Node.js child process per user                 |
| **Build step** | None                                                                                     | esbuild via `desktalk-build` CLI                        |
| **Storage**    | KV store + JSONL collections via bridge (see [liveapp-storage.md](./liveapp-storage.md)) | Scoped data dir, key-value store, filesystem hooks      |
| **Discovery**  | Auto-detected by scanning directory for `index.html`                                     | Registered at startup from npm packages                 |
| **Launchpad**  | Appears alongside MiniApps, display name from `<title>`                                  | Appears with manifest name and optional PNG icon        |
| **Rendering**  | Sandboxed iframe hosted by Preview MiniApp                                               | Own frontend module mounted into window                 |
| **Use case**   | User-requested tools, dashboards, visualizations, utilities                              | Core system features (notes, files, settings, terminal) |

### High-Level Stack

| Layer     | Technology                    |
| --------- | ----------------------------- |
| Frontend  | React                         |
| State     | Zustand                       |
| Styling   | CSS Modules                   |
| Backend   | Fastify (Node.js)             |
| WebSocket | @fastify/websocket            |
| Static    | @fastify/static               |
| AI        | @mariozechner/pi-coding-agent |
| Monorepo  | pnpm workspaces               |
| Packaging | npm                           |

### Project Structure

```
desktalk/
  packages/
    core/                  # @desktalk/core — main application shell (CLI, server, window manager, AI panel)
    sdk/                   # @desktalk/sdk — shared types and React hooks for MiniApp development
    miniapp-note/          # @desktalk/miniapp-note
    miniapp-todo/          # @desktalk/miniapp-todo
    miniapp-file-explorer/ # @desktalk/miniapp-file-explorer
    miniapp-preview/       # @desktalk/miniapp-preview (also serves as LiveApp renderer)
    miniapp-preference/    # @desktalk/miniapp-preference
    miniapp-terminal/      # @desktalk/miniapp-terminal
    miniapp-text-edit/     # @desktalk/miniapp-text-edit
  docs/
  pnpm-workspace.yaml
  package.json
```

### CLI

```bash
desktalk start [--host <host>] [--port <port>]
```

Starts the Fastify backend server and serves the frontend. The backend uses [Fastify](https://fastify.dev) for HTTP routing, `@fastify/websocket` for real-time AI event streaming and MiniApp messaging, and `@fastify/static` to serve the React build.

## LiveApp System

LiveApps are the core user-facing concept in DeskTalk. A user asks the AI for something ("build me a project tracker", "show me a chart of my disk usage"), and the AI generates a LiveApp — a self-contained, interactive HTML application that appears on the desktop and persists across sessions.

### What Is a LiveApp

A LiveApp is:

- A directory containing an `index.html` file and optional co-located assets (`.js`, `.css`, images)
- Rendered in a sandboxed iframe hosted by the Preview MiniApp
- Automatically saved to disk when generated
- Auto-detected and listed in the launchpad
- Fully interactive — can execute shell commands, read system state, and communicate with the desktop via the DeskTalk bridge

A LiveApp is **not**:

- A full MiniApp — it has no backend process, no manifest, no npm package
- Static — it can run JavaScript, make fetch requests, and interact with the system via the bridge
- Temporary — it persists on disk and survives restarts

### Lifecycle

```
1. User asks the AI for something
2. AI calls create_liveapp with title + HTML content
3. Core saves raw HTML to ~/.data/liveapps/<dir>/index.html
4. Preview window opens, streams themed/bridged HTML into sandboxed iframe
5. LiveApp is now running and persisted

On next launch:
6. GET /api/liveapps scans ~/.data/liveapps/ for directories with index.html
7. Parses <title> from each index.html for the display name
8. LiveApps appear in the launchpad alongside MiniApps
9. Clicking a LiveApp opens Preview with args pointing to its files
```

### File Structure

```
<data>/home/<username>/.data/liveapps/
  my-project-tracker_html-stream-1-1711036800000/
    index.html                          # Root document (required)
    icon.png                            # AI-generated icon (optional, created by generate_icon)
    chart.js                            # Optional co-located script
    styles.css                          # Optional co-located stylesheet
    logo.png                            # Optional co-located asset
    .index.html.history.jsonl           # Edit history (created after AI edits)
  disk-usage_html-stream-2-1711036801000/
    index.html
```

The directory name follows the pattern `<sanitized-title>_<streamId>`:

- `<sanitized-title>` — title lowercased, spaces replaced with `-`, non-alphanumeric characters stripped
- `<streamId>` — auto-generated identifier like `html-stream-1-1711036800000`

### Auto-Detection

LiveApps are discovered by scanning the `liveapps/` directory at the user home level. Any subdirectory containing an `index.html` is treated as a LiveApp. There is no registry file or manifest — **the filesystem is the registry**.

The display name shown in the launchpad is extracted from the `<title>` tag in `index.html`. If no `<title>` is found, the directory name is used as a fallback.

### LiveApp Identity

| Property | Source                                                              |
| -------- | ------------------------------------------------------------------- |
| **id**   | Directory name (e.g., `my-project-tracker_html-stream-1-...`)       |
| **name** | `<title>` tag parsed from `index.html`                              |
| **icon** | AI-generated `icon.png` if available; default emoji `"📄"` fallback |

### Rendering

LiveApps are rendered by the **Preview MiniApp** in a sandboxed iframe. When a LiveApp is launched from the launchpad:

1. The core activates the Preview MiniApp (if not already running)
2. A Preview window opens with args identifying the LiveApp (`{ liveAppId, streamId, title }`)
3. Preview loads `index.html` from the LiveApp directory
4. The core injects runtime resources into the HTML:
   - **Theme CSS** — DeskTalk design tokens (`--dt-*` custom properties)
   - **Bridge script** — `window.DeskTalk` API for system interaction
   - **UI script** — toolbar overlay for refresh, open-in-browser, etc.
5. The injected HTML is loaded into the sandboxed iframe

The raw HTML on disk is always clean — runtime injections are stripped before saving and re-injected at load time.

### The DeskTalk Bridge

Every LiveApp receives a `window.DeskTalk` bridge object in its iframe context. This provides:

| API                                  | Description                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `exec(command)` / `execute(command)` | Execute a shell command. Accepts a string (`"ls -la"`) or explicit args (`"ls", ["-la"]`).              |
| `getTheme()`                         | Read current theme preferences (accent color, light/dark mode).                                         |
| `onThemeChange(callback)`            | Subscribe to theme changes.                                                                             |
| `storage.get/set/delete/list`        | KV store for simple JSON values. See [liveapp-storage.md](./liveapp-storage.md).                        |
| `storage.collection(name)`           | Collection API for structured records (JSONL + SQLite). See [liveapp-storage.md](./liveapp-storage.md). |

The bridge communicates with the core via `postMessage` and a per-session `bridgeToken` for authentication.

### Multi-File LiveApps

The root file is always `index.html`. For complex applications, the HTML can reference co-located files in the same directory:

```html
<!-- Scripts -->
<script src="./app.js"></script>
<script src="./lib/chart.min.js"></script>

<!-- Stylesheets -->
<link rel="stylesheet" href="./styles.css" />

<!-- Images and assets -->
<img src="./logo.png" alt="Logo" />
```

All paths must be relative (`./`). The Preview MiniApp serves files from the LiveApp directory to the sandboxed iframe.

### Editing LiveApps

The AI can modify existing LiveApps using the `edit` tool:

1. User focuses a LiveApp window and asks for a change
2. AI calls the Preview `Get State` action to discover the file path
3. AI reads the file with the built-in `read` tool
4. AI calls `edit` with `{ path, oldText, newText }`
5. Core writes the updated file, records persistent edit history, and broadcasts a reload event
6. The LiveApp iframe reloads with the updated content

Edit history is stored as a co-located `.index.html.history.jsonl` file, enabling `undo_edit` and `redo_edit` across sessions.

### Design Tokens

LiveApps should use DeskTalk design tokens (CSS custom properties) to stay consistent with the desktop theme:

```css
/* Colors */
var(--dt-bg)                  /* Background */
var(--dt-bg-secondary)        /* Secondary background */
var(--dt-text)                /* Primary text */
var(--dt-text-muted)          /* Muted text */
var(--dt-accent)              /* Accent color */
var(--dt-border)              /* Border color */

/* Shadows */
var(--dt-shadow-sm)           /* Small shadow */
var(--dt-shadow-md)           /* Medium shadow */

/* Radii */
var(--dt-radius-sm)           /* Small border radius */
var(--dt-radius-md)           /* Medium border radius */
```

The AI is guided by a built-in manual (accessible via the `read_manual` tool) that covers tokens, components, layouts, bridge usage, and examples.

### Icon Generation

LiveApps can have custom AI-generated icons instead of the default `"📄"` emoji. The `generate_icon` tool is a standalone tool the AI calls explicitly after creating a LiveApp.

**How it works:**

1. The AI calls `generate_icon` with `{ liveAppId, description }` — e.g., `{ liveAppId: "project-tracker_html-stream-1-...", description: "a kanban board with colorful columns" }`.
2. The tool prepends a style prefix to the description: `"A minimal flat-design app icon: ${description}. Single centered symbol, solid color background, rounded square, clean and modern, no text, 256×256 pixels."`.
3. The tool selects an image-generation provider following the user's configured default (if it supports image generation), falling back through: OpenAI (DALL-E 3) → Google (Gemini) → OpenRouter (proxied DALL-E 3).
4. The generated image is resized to 256×256 PNG via `sharp` and saved as `icon.png` in the LiveApp directory.
5. Returns `{ ok: true, path: "icon.png" }` on success.

**Failure behavior:**

If icon generation fails (no provider configured, API error, unsupported provider), the tool returns `{ ok: false, reason: "..." }`. The AI should **not** retry or apologize — it continues its response normally. The LiveApp keeps the default emoji icon and remains fully functional.

**Supported providers:**

| Provider   | API                 | Notes                                        |
| ---------- | ------------------- | -------------------------------------------- |
| OpenAI     | DALL-E 3            | Primary — highest quality                    |
| Google     | Gemini image output | Fallback if OpenAI unavailable               |
| OpenRouter | Proxied DALL-E 3    | Fallback if neither OpenAI nor Google is set |

## MiniApp System

DeskTalk's built-in features are implemented as **MiniApps** — heavyweight, process-isolated npm packages with dedicated backend and frontend entry points. MiniApps provide the system-level functionality that LiveApps are rendered on top of.

For the full MiniApp system architecture (registration, activation, process isolation, installation, privileged access, and permissions), see [miniapp-system.md](./miniapp-system.md). For how to develop a MiniApp, see [miniapp-development.md](./miniapp-development.md).

### Built-in MiniApps

| MiniApp       | Summary                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Note          | Markdown note-taking with YAML front matter and Milkdown editor.                                                 |
| Todo          | Task management similar to macOS Reminders.                                                                      |
| File Explorer | Simple filesystem browser.                                                                                       |
| Preview       | Content viewer for images and HTML. **Also the LiveApp renderer** — hosts the sandboxed iframe for all LiveApps. |
| Preference    | App and window configuration. Privileged — sole MiniApp with write access to global config.                      |
| Terminal      | Terminal emulator powered by xterm.js.                                                                           |
| Text Edit     | Plain text file editor.                                                                                          |

## Workspace Directory

On first launch, the core creates workspace directories following **platform-standard paths** (XDG on Linux, `Application Support` on macOS, `%APPDATA%` on Windows). Use a library like [`env-paths`](https://www.npmjs.com/package/env-paths) to resolve these at runtime.

### Platform Paths

| Purpose | Linux (XDG)                     | macOS                                     | Windows                          |
| ------- | ------------------------------- | ----------------------------------------- | -------------------------------- |
| Config  | `~/.config/desktalk/`           | `~/Library/Application Support/DeskTalk/` | `%APPDATA%\DeskTalk\`            |
| Data    | `~/.local/share/desktalk/`      | `~/Library/Application Support/DeskTalk/` | `%LOCALAPPDATA%\DeskTalk\`       |
| Logs    | `~/.local/state/desktalk/logs/` | `~/Library/Logs/DeskTalk/`                | `%LOCALAPPDATA%\DeskTalk\logs\`  |
| Cache   | `~/.cache/desktalk/`            | `~/Library/Caches/DeskTalk/`              | `%LOCALAPPDATA%\DeskTalk\cache\` |

### Directory Layout

Using `<config>`, `<data>`, `<logs>`, `<cache>` as shorthand for the platform-resolved paths:

```
<config>/
  config.toml                  # Global app configuration (TOML format, managed by core)

<data>/
  miniapps/                    # Installed third-party MiniApp packages
  home/
    <username>/
      .data/
        liveapps/              # AI-generated LiveApps (auto-detected)
          my-app_stream-id/
            index.html
            app.js
        note/                  # MiniApp-private data directories
        todo/
        preview/
        <third-party-id>/
      .storage/
        liveapps/              # LiveApp application data (see liveapp-storage.md)
          my-app_stream-id/
            settings.json      # KV store file
            tasks.jsonl        # Collection op-log (source of truth)
        note.json              # MiniApp key-value stores
        todo.json
        preference.json
      .cache/
        liveapps/              # LiveApp query cache (disposable, see liveapp-storage.md)
          my-app_stream-id/
            tasks.sqlite
        note/
        todo/
      documents/               # User-visible files exposed through ctx.fs
      pictures/

<logs>/
  core.log
  <username>/
    note.log
    todo.log
    ...

<cache>/
  ...
```

| Path                                             | Purpose                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `<data>/home/<username>/.data/liveapps/`         | AI-generated LiveApps. Auto-detected by the core — each subdirectory with an `index.html` is a LiveApp.                         |
| `<data>/home/<username>/.storage/liveapps/<id>/` | LiveApp application data. KV store (`.json`) and collection op-logs (`.jsonl`). See [liveapp-storage.md](./liveapp-storage.md). |
| `<data>/home/<username>/.cache/liveapps/<id>/`   | LiveApp query cache. Disposable SQLite databases generated from JSONL op-logs. See [liveapp-storage.md](./liveapp-storage.md).  |
| `<data>/home/<username>/`                        | Scoped filesystem root for MiniApps. Paths passed to `ctx.fs` resolve relative to this.                                         |
| `<data>/home/<username>/.data/<id>/`             | MiniApp-private data directory (`ctx.paths.data`).                                                                              |
| `<data>/home/<username>/.storage/<id>.json`      | Scoped key-value store (`ctx.storage`).                                                                                         |
| `<logs>/<username>/<id>.log`                     | Scoped log output (`ctx.logger`).                                                                                               |
| `<data>/miniapps/`                               | Installed third-party MiniApp npm packages.                                                                                     |
| `<config>/config.toml`                           | Global app configuration (TOML). Managed by core; only Preference MiniApp has write access.                                     |

## Window Management

Window management is the central feature of DeskTalk.

### Global Layout

```
|-----------------------|
| Actions Bar           |
|----------------|------|
|                |      |
|   Window Area  | Info |
|                |      |
|----------------|------|
|     Dock              |
|-----------------------|
```

| Region      | Description                                                                                                                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actions Bar | A global bar at the top of the screen, similar to the macOS Menu Bar. Displays both **built-in window actions** (provided by the core) and **MiniApp-specific actions** (provided by the focused MiniApp via `<ActionsProvider>`).                              |
| Window Area | The main workspace where MiniApp windows and LiveApp windows are rendered. Supports opening, closing, moving, resizing, focusing, and minimizing. When the desktop WebSocket bridge is connecting/reconnecting, a blocking mask prevents operating stale state. |
| Info Panel  | A permanent right-side AI Assistant pane. Displays conversation messages, thinking state, and token/cost usage. Powered by pi.                                                                                                                                  |
| Dock        | A macOS-style dock at the bottom listing all available MiniApps and LiveApps for quick launch.                                                                                                                                                                  |

### Built-in Window Actions

| Action   | Description                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------- |
| Maximize | Toggle the focused window between maximized and normal size.                                        |
| Minimize | Minimize the focused window to the Dock.                                                            |
| Close    | Close the focused window. Triggers MiniApp deactivation if it was the last window for that MiniApp. |

### Window Lifecycle

1. User clicks an app icon in the Dock/Launchpad (or triggers an AI action).
2. The window manager checks for an existing window with the same `miniAppId` and shallow-equal launch `args`.
3. If such a window exists, the shell focuses it instead of opening a duplicate.
4. Otherwise, the window manager creates a new window instance and renders the app inside it.
5. The MiniApp registers its actions via `<ActionsProvider>` so they appear in the Actions Bar when focused.
6. The user (or AI) interacts with the window.
7. The window can be spotlight-maximized or closed.

### Desktop Connection Guard

- The desktop shell depends on a frontend-to-backend WebSocket bridge for window state sync, AI events, and MiniApp action brokering.
- On first load the shell shows a blocking `Connecting...` overlay until the bridge is ready.
- If the socket drops, the shell automatically retries with exponential backoff and shows a `Reconnecting...` overlay.
- This guard is desktop-only; login and onboarding pages do not render the shell overlay.

### Focus Model

- Only one window is focused at a time.
- Focusing a window brings it to the front and updates the Actions Bar with that window's actions.

## Actions System

Actions are the bridge between the AI and the MiniApp UI.

```jsx
<ActionsProvider>
  <Action
    name="Add a TODO"
    description="Create a new todo item"
    handler={async (params) => {
      /* ... */
    }}
  />
</ActionsProvider>
```

- Each `<Action>` declares a name, a human-readable description, and a handler.
- When a window is focused its actions are collected and displayed in the Actions Bar.
- The AI can invoke any action by name, making it a "skill" the AI can use on that page.

## AI Integration

DeskTalk uses [pi](https://pi.dev) (`@mariozechner/pi-coding-agent`) as its AI backend. Pi is embedded via its **SDK mode** — the core imports `createAgentSession` and runs pi in-process on the Node.js backend.

### Why pi

- **SDK mode** — `createAgentSession()` gives full programmatic control without spawning a subprocess.
- **15+ LLM providers** — Anthropic, OpenAI, Google, Bedrock, Mistral, xAI, OpenRouter, Ollama, etc.
- **Extensible** — Pi extensions, skills, and prompt templates can customize AI behaviour.
- **Tree-structured sessions** — Branching, compaction, and full history handled by pi's `SessionManager`.

### Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend (React)                               │
│                                                 │
│  ┌──────────────┐  ┌────────────────────────┐   │
│  │ Window Area   │  │  Info Panel            │   │
│  │ (LiveApps &   │  │  - Chat input          │   │
│  │  MiniApps)    │  │  - Messages            │   │
│  │               │  │  - Thinking blocks     │   │
│  │  <Action>     │  │  - Token/cost display  │   │
│  │  declarations │  │                        │   │
│  └──────┬───────┘  └──────────┬─────────────┘   │
│         │                     │                  │
│     actions list         user prompts            │
│         │              & streaming events         │
│─────────┴─────────────────────┴──────────────────│
│                  WebSocket                       │
│─────────────────────────────────────────────────│
│  Backend (Node.js)                              │
│                                                 │
│  ┌────────────────────────────────────────────┐ │
│  │ AI Service                                 │ │
│  │                                            │ │
│  │  AgentSession (from pi SDK)                │ │
│  │  - prompt(), steer(), followUp(), abort()  │ │
│  │  - subscribe() → streams events            │ │
│  │                                            │ │
│  │  Custom tools:                             │ │
│  │  - create_liveapp (creates LiveApps)        │ │
│  │  - generate_icon (AI-generated app icons)   │ │
│  │  - desktop (window management)             │ │
│  │  - action (invokes MiniApp actions)        │ │
│  │  - edit / undo_edit / redo_edit            │ │
│  │  - read_manual (DeskTalk reference)        │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Custom Tools

Pi's built-in tools stay tightly constrained in DeskTalk. The built-in `read` tool is enabled so the AI can inspect files when needed, but unrestricted filesystem and shell tools remain disabled. The AI interacts with DeskTalk through custom tools:

| Tool             | Description                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_liveapp` | **Creates a LiveApp.** Generates a self-contained HTML document, saves it to the `liveapps/` directory, and streams it into a Preview window's sandboxed iframe. |
| `generate_icon`  | **Generates a LiveApp icon.** Calls the user's configured image-generation provider to produce a 256×256 PNG icon, saved as `icon.png` in the LiveApp directory. |
| `desktop`        | Lists windows, exposes the focused window, and opens MiniApps.                                                                                                   |
| `action`         | Invokes a named action on a MiniApp window, usually the focused one.                                                                                             |
| `edit`           | Replaces one exact text match in a managed file (including LiveApp HTML), records persistent history, and broadcasts reload events.                              |
| `undo_edit`      | Restores the previous saved version of a managed file from persistent history.                                                                                   |
| `redo_edit`      | Re-applies the next saved version of a managed file from persistent history.                                                                                     |
| `read_manual`    | Returns paged DeskTalk manuals for HTML generation, desktop operations, actions, and editing workflows.                                                          |

### LiveApp Generation Flow

This is the primary AI interaction — creating a LiveApp:

1. User types a prompt: _"Build me a project tracker with columns for To Do, In Progress, and Done"_.
2. Backend calls `session.prompt(message)`.
3. Pi's LLM decides to call `create_liveapp` with `{ title: "Project Tracker", content: "<!DOCTYPE html>..." }`.
4. **Streaming path**: The `HtmlStreamCoordinator` intercepts partial JSON from the LLM, extracts the title early, opens a Preview window, and begins streaming HTML chunks into the iframe in real time.
5. **Save**: On finalization, the core saves the raw HTML to `~/.data/liveapps/<sanitized-title>_<streamId>/index.html`.
6. The LiveApp is now running in a Preview window and persisted on disk.
7. **Icon generation** (optional): Pi calls `generate_icon` with a short visual description. The tool calls the user's configured image-generation provider, saves the result as `icon.png` in the LiveApp directory, and returns `{ ok: true, path }`. If generation fails (no provider, API error), the tool returns `{ ok: false, reason }` and the AI continues without retrying — the LiveApp keeps its default emoji icon.
8. On next startup, the LiveApp appears in the launchpad automatically (with its custom icon if one was generated).

### Action Invocation Flow

1. User types a prompt, e.g. _"Create a note titled Shopping List"_.
2. Backend calls `session.prompt(message)`.
3. Pi calls `desktop` to see what windows are open and their available actions.
4. Pi calls `action` with `{ name: "Create Note", params: { title: "Shopping List" } }`.
5. The core resolves the handler registered by the Note MiniApp's `<Action>` component and executes it.
6. Pi generates a final text response: _"I've created a note titled 'Shopping List'."_

### File Edit Flow

1. The user focuses a LiveApp window and asks for a targeted change.
2. Pi calls the Preview `Get State` action to discover the current file path.
3. Pi reads the file contents with the built-in `read` tool.
4. Pi calls `edit` with `{ path, oldText, newText }`.
5. The core writes the updated file, records persistent history, and broadcasts `preview.file-changed`.
6. The LiveApp iframe reloads with the updated content.
7. If needed, Pi can call `undo_edit` or `redo_edit` on the same file path.

### Persistent Edit History

Each file edited through `edit` gets a co-located JSONL sidecar file. For `<dir>/index.html`, the history file is `<dir>/.index.html.history.jsonl`.

- Each version stores the full file contents.
- The last JSONL line stores the active history pointer.
- `undo_edit` moves the pointer back, `redo_edit` moves it forward.
- History persists on disk, so undo/redo survives app restarts.

### Event Streaming

The backend subscribes to `AgentSession` events and forwards them to the frontend over WebSocket:

| Event                                           | Frontend use                                         |
| ----------------------------------------------- | ---------------------------------------------------- |
| `message_update` (text_delta)                   | Append streaming text to the chat in the Info Panel. |
| `message_update` (thinking_delta)               | Show thinking content in a collapsible block.        |
| `tool_execution_start` / `tool_execution_end`   | Show which tool the AI is using.                     |
| `agent_start` / `agent_end`                     | Toggle "AI is thinking" indicator.                   |
| `turn_end`                                      | Update token/cost counters.                          |
| `auto_compaction_start` / `auto_compaction_end` | Show compaction status.                              |

### Frontend — Info Panel

The Info Panel is the user-facing AI interface, rendered as a permanent right-side pane.

| Section        | Content                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| **Chat**       | Scrollable list of user and assistant messages. Messages render Markdown. |
| **Thinking**   | Collapsible block showing the model's chain-of-thought.                   |
| **Tool Calls** | Inline indicators showing when the AI invokes tools.                      |
| **Status Bar** | Current model name, thinking level, token usage, and estimated cost.      |

### Authentication and Configuration

Pi credentials (API keys, OAuth tokens) are stored at `<config>/pi-auth.json` via pi's `AuthStorage`. The Preference MiniApp exposes settings for:

| Setting           | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| Default Provider  | Which provider to use by default (Anthropic, OpenAI, etc.) |
| Provider Model    | Which model to use within each configured provider         |
| Thinking Level    | off, minimal, low, medium, high                            |
| Provider API Key  | Per-provider API key entry                                 |
| Provider Base URL | Optional per-provider endpoint override                    |

### Session Persistence

Pi sessions are stored as JSONL files in `<data>/ai-sessions/`. Pi's `SessionManager` handles auto-save, compaction, and branching.

### Dependencies

| Package                         | Purpose                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `@mariozechner/pi-coding-agent` | SDK entry point: `createAgentSession`, `AuthStorage`, `ModelRegistry`, `SessionManager` |
| `@sinclair/typebox`             | JSON Schema definitions for custom tool parameters (peer dependency of pi)              |
| `better-sqlite3`                | Synchronous SQLite driver for LiveApp collection query cache                            |

## Engineering Guidelines

See [docs/engineering.md](./engineering.md).
