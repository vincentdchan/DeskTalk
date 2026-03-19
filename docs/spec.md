# DeskTalk - Overall Specification

## Overview

DeskTalk is a browser-based, OS-like desktop environment with an AI assistant. It is distributed as a single npm package and started via a CLI command. The application follows a MiniApp architecture — similar to how VSCode uses extensions — where each feature is an independently publishable npm package. MiniApps do **not** run their own servers; they export well-defined interfaces and interact with the host through unified communication hooks provided by the DeskTalk core.

## Architecture

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
    miniapp-preview/       # @desktalk/miniapp-preview
    miniapp-preference/    # @desktalk/miniapp-preference
  docs/
  pnpm-workspace.yaml
  package.json
```

All packages are published under the `@desktalk` npm scope:

| Package       | npm name                          |
| ------------- | --------------------------------- |
| Core          | `@desktalk/core`                  |
| SDK           | `@desktalk/sdk`                   |
| Note          | `@desktalk/miniapp-note`          |
| Todo          | `@desktalk/miniapp-todo`          |
| File Explorer | `@desktalk/miniapp-file-explorer` |
| Preview       | `@desktalk/miniapp-preview`       |
| Preference    | `@desktalk/miniapp-preference`    |

The `@desktalk/core` package declares each built-in MiniApp as a dependency in its `package.json`. At build time all MiniApps are bundled together. At runtime the core discovers and registers them.

### CLI

```bash
desktalk start [--host <host>] [--port <port>]
```

Starts the Fastify backend server and serves the frontend. The backend uses [Fastify](https://fastify.dev) for HTTP routing, `@fastify/websocket` for real-time AI event streaming and MiniApp messaging, and `@fastify/static` to serve the React build. MiniApps never expose their own HTTP endpoints — all server-side communication goes through the core's unified hooks.

## MiniApp System

The MiniApp system follows the same principles as VSCode extensions:

- MiniApps are **npm packages** that export a set of well-defined interfaces.
- They are **discovered and activated** by the core host, not self-started.
- They communicate with the backend exclusively through **hooks provided by the core**, never by creating their own HTTP servers or routes.
- The core is the single authority for networking, storage, and lifecycle.
- The core enforces **permission-based access control** — certain privileged APIs (e.g., global configuration) are only available to authorized MiniApps (see [Privileged Access & Permissions](#privileged-access--permissions)).

### Workspace Directory

On first launch, the core creates workspace directories following **platform-standard paths** (XDG on Linux, `Application Support` on macOS, `%APPDATA%` on Windows). Use a library like [`env-paths`](https://www.npmjs.com/package/env-paths) to resolve these at runtime.

#### Platform Paths

| Purpose | Linux (XDG)                     | macOS                                     | Windows                          |
| ------- | ------------------------------- | ----------------------------------------- | -------------------------------- |
| Config  | `~/.config/desktalk/`           | `~/Library/Application Support/DeskTalk/` | `%APPDATA%\DeskTalk\`            |
| Data    | `~/.local/share/desktalk/`      | `~/Library/Application Support/DeskTalk/` | `%LOCALAPPDATA%\DeskTalk\`       |
| Logs    | `~/.local/state/desktalk/logs/` | `~/Library/Logs/DeskTalk/`                | `%LOCALAPPDATA%\DeskTalk\logs\`  |
| Cache   | `~/.cache/desktalk/`            | `~/Library/Caches/DeskTalk/`              | `%LOCALAPPDATA%\DeskTalk\cache\` |

#### Directory Layout

Using `<config>`, `<data>`, `<logs>`, `<cache>` as shorthand for the platform-resolved paths:

```
<config>/
  config.toml                  # Global app configuration (TOML format, managed by core; privileged — only Preference MiniApp may write)

<data>/
  miniapps/                    # Installed third-party MiniApp packages
  home/
    admin/
      .data/
        note/                  # @desktalk/miniapp-note private files
        todo/
        preference/
        <third-party-id>/
      .storage/
        note.json              # @desktalk/miniapp-note key-value store (ctx.storage)
        todo.json
        preference.json
        <third-party-id>.json
      .cache/
        note/
        todo/
        preference/
        <third-party-id>/
      documents/               # User-visible files exposed through ctx.fs
      pictures/

<logs>/
  core.log
  admin/
    note.log
    todo.log
    ...

<cache>/
  ...                          # Temporary/regenerable data
```

| Path                                        | Purpose                                                                                                                                                                                                   | Accessed via                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `<data>/home/<username>/`                   | Scoped filesystem root for MiniApps. Paths passed to `ctx.fs` resolve relative to the authenticated user's home directory.                                                                                | `ctx.fs`                                                  |
| `<data>/home/<username>/.data/<id>/`        | MiniApp-private data directory. The core exposes the absolute path as `ctx.paths.data`.                                                                                                                   | `ctx.paths.data`                                          |
| `<data>/home/<username>/.storage/<id>.json` | Scoped key-value store persisted as JSON.                                                                                                                                                                 | `ctx.storage`                                             |
| `<logs>/<username>/<id>.log`                | Scoped log output.                                                                                                                                                                                        | `ctx.logger`                                              |
| `<data>/miniapps/`                          | Installed third-party MiniApp npm packages.                                                                                                                                                               | Core only                                                 |
| `<config>/config.toml`                      | Global app configuration (TOML). Managed by the core. **Only** the Preference MiniApp has write access via `ctx.config` (enforced by the core; see [Privileged Access](#privileged-access--permissions)). | Core (read/write) / Preference MiniApp (via `ctx.config`) |

MiniApps never know or control other users' absolute paths. The core creates each user's home structure automatically, resolves all `ctx.fs` paths relative to `<data>/home/<username>/`, and still provides `ctx.paths.data` for the MiniApp's private directory inside that home.

### Installation

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
3. Built-in MiniApps (Note, Todo, File Explorer, Preference) ship with the core package and are always available — they follow the same interfaces as third-party MiniApps.

This is analogous to VSCode where built-in extensions (e.g., TypeScript, Git) coexist with marketplace extensions under the same API contract.

### Privileged Access & Permissions

The global configuration file (`<config>/config.toml`) stores all application settings in [TOML](https://toml.io) format. The core is the sole owner of this file — it handles all reads, writes, parsing, and serialization. MiniApps (including Preference) never touch the file directly; they go through the core's `ConfigHook` API. Because the config controls critical application behavior — server bind address, AI credentials, window defaults, dock layout, etc. — the core enforces strict access control.

#### Design Principle

Only the **Preference MiniApp** (`id: "preference"`) is authorized to read and write the global configuration. All other MiniApps — both built-in and third-party — are denied access. This is enforced at the core level, not by convention.

#### ConfigHook (Privileged)

The core provides a `ConfigHook` interface for reading and writing the global configuration. The core manages all file I/O internally (`<config>/config.toml`) — the hook exposes only a typed key-value API. This hook is **only** injected into the `MiniAppContext` when the MiniApp's manifest declares `id: "preference"`. For all other MiniApps, `ctx.config` is `undefined`.

```ts
interface ConfigHook {
  /** Get all settings as a flat key-value map. */
  getAll(): Promise<Config>;
  /** Get a single setting's value. Returns undefined if not set. */
  get(key: string): Promise<string | number | boolean | undefined>;
  /** Set a single setting's value. Core persists to <config>/config.toml immediately. */
  set(key: string, value: string | number | boolean): Promise<void>;
  /** Reset a single setting to its default value. */
  reset(key: string): Promise<void>;
  /** Reset all settings to defaults. */
  resetAll(): Promise<void>;
}
```

#### Enforcement Rules

| Rule                        | Description                                                                                                                                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manifest ID check**       | At activation time, the core checks `manifest.id`. Only `"preference"` receives `ctx.config`. All other IDs receive `ctx.config === undefined`.                                                                                                                                                    |
| **Built-in only**           | The Preference MiniApp ships as a built-in package (`@desktalk/miniapp-preference`). Third-party packages cannot claim the `"preference"` ID — the core rejects duplicate IDs, and built-in MiniApps take priority over installed packages.                                                        |
| **Command namespace guard** | The `preferences.*` command namespace is reserved. The core rejects any `ctx.messaging.onCommand('preferences.*', ...)` registration from MiniApps other than `"preference"`.                                                                                                                      |
| **Config file permissions** | The core writes `<config>/config.toml` with restricted filesystem permissions (`0600`) so only the current user can read it. This protects sensitive values like AI API keys.                                                                                                                      |
| **Read-only broadcast**     | When a config value changes, the core broadcasts a `config:changed` event to all MiniApps so they can react (e.g., the shell updates its theme). The event payload contains only the changed key and new value — never the full config or sensitive fields (API keys are omitted from broadcasts). |

#### How Other MiniApps React to Config Changes

MiniApps that need to respond to configuration changes (e.g., theme switching) subscribe to the `config:changed` event via `ctx.messaging`. They do **not** read `config.toml` directly — all file I/O is handled by the core.

```ts
// Inside any MiniApp's activate()
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
// Available to all MiniApps via ctx.messaging
ctx.messaging.onCommand('config.getPublic', async (data: { key: string }) => { ... });
```

This returns values for non-sensitive keys only (e.g., theme, language, window defaults). Requests for sensitive keys (e.g., `ai.apiKey`) return an error.

### MiniApp Development

For the full MiniApp development guide — package structure, exported interfaces, entry files, lifecycle, communication hooks, and the standard build toolchain — see [miniapp-development.md](./miniapp-development.md). For the app-wide localization design spanning core and MiniApps, see [i18n-proposal.md](./i18n-proposal.md).

**Key design points:**

- Each MiniApp has **two separate entry files**: a backend entry (`src/backend.ts`) that runs on the Node.js server, and a frontend entry (`src/frontend.tsx`) that runs in the browser.
- The backend entry exports `manifest`, `activate(ctx)`, and `deactivate()`. It handles command registration, storage, and filesystem access.
- The frontend entry exports an `activate(ctx)` hook that mounts its UI into the provided root element and returns a per-window cleanup handle for unmounting.
- The `@desktalk/sdk` package provides a standard build CLI (`desktalk-build`) so MiniApp authors do not need to configure their own bundler.

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

| Region      | Description                                                                                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Actions Bar | A global bar at the top of the screen, similar to the macOS Menu Bar. It is **not** part of any individual MiniApp window. It displays both **built-in window actions** (provided by the core) and **MiniApp-specific actions** (provided by the focused MiniApp via `<ActionsProvider>`). |

### Built-in Window Actions

The core provides a set of built-in actions that are always present in the Actions Bar for every window. These are managed by the window manager, not by MiniApps.

| Action   | Description                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------- |
| Maximize | Toggle the focused window between maximized and normal size.                                        |
| Minimize | Minimize the focused window to the Dock.                                                            |
| Close    | Close the focused window. Triggers MiniApp deactivation if it was the last window for that MiniApp. |

These built-in actions appear alongside any MiniApp-specific actions. For example, when a Note window is focused the Actions Bar shows: `Maximize | Minimize | Close | Create Note | Delete Note | Search Notes | ...`

| Region      | Description                                                                                                                                                                                                                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window Area | The main workspace where MiniApp windows are rendered. Supports opening, closing, moving, resizing, focusing, and minimizing windows. When the desktop WebSocket bridge is still connecting or reconnecting, the shell places a blocking mask over the desktop UI so the user cannot operate stale state.                                                                     |
| Info Panel  | A permanent right-side AI Assistant pane that displays conversation messages, thinking state, and token/cost usage. It is rendered with window chrome inside the shell layout but is not a normal MiniApp window. Powered by pi (see [AI Integration](#ai-integration)). Like the rest of the desktop shell, it is temporarily masked during desktop bridge reconnect states. |
| Dock        | A macOS-style dock at the bottom listing all available MiniApps for quick launch.                                                                                                                                                                                                                                                                                             |

### Window Lifecycle

1. User clicks a MiniApp icon in the Dock (or triggers an AI action).
2. The window manager checks for an existing window with the same `miniAppId` and shallow-equal launch `args`.
3. If such a window exists, the shell focuses it instead of opening a duplicate.
4. Otherwise, the window manager creates a new window instance and renders the MiniApp's root component inside it.
5. The MiniApp registers its actions via `<ActionsProvider>` so they appear in the Actions Bar when the window is focused.
6. The user (or AI) interacts with the window.
7. The window can be spotlight-maximized or closed.

### Desktop Connection Guard

- The desktop shell depends on a frontend-to-backend WebSocket bridge for window state sync, AI events, and MiniApp action brokering.
- On first load the shell shows a blocking `Connecting...` overlay until the bridge is ready.
- If the socket drops after the desktop has already loaded, the shell automatically retries with exponential backoff and shows a blocking `Reconnecting...` overlay with the next retry countdown.
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

DeskTalk uses [pi](https://pi.dev) (`@mariozechner/pi-coding-agent`) as its AI backend. Pi is embedded via its **SDK mode** — the core imports `createAgentSession` and runs pi in-process on the Node.js backend. There is no separate pi process; the agent lives inside the DeskTalk server.

### Why pi

- **SDK mode** — `createAgentSession()` gives full programmatic control without spawning a subprocess.
- **15+ LLM providers** — Anthropic, OpenAI, Google, Bedrock, Mistral, xAI, OpenRouter, Ollama, etc. Users authenticate once and switch models freely.
- **Extensible** — Pi extensions, skills, and prompt templates can be used to customize AI behaviour within DeskTalk.
- **Tree-structured sessions** — Branching, compaction, and full history are handled by pi's `SessionManager`.

### Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend (React)                               │
│                                                 │
│  ┌──────────────┐  ┌────────────────────────┐   │
│  │ Window Area   │  │  Info Panel            │   │
│  │ (MiniApps)    │  │  - Chat input          │   │
│  │               │  │  - Messages            │   │
│  │  <Action>     │  │  - Thinking blocks     │   │
│  │  declarations │  │  - Token/cost display  │   │
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
│  │  - session.messages, model, thinkingLevel  │ │
│  │                                            │ │
│  │  Custom tools:                             │ │
│  │  - invoke_action (calls MiniApp actions)   │ │
│  │  - list_actions (reads focused window)     │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Backend — AI Service

The core creates a single `AgentSession` at startup and keeps it alive for the application's lifetime.

```ts
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  type ToolDefinition,
} from '@mariozechner/pi-coding-agent';

const authStorage = AuthStorage.create(paths.config + '/pi-auth.json');
const modelRegistry = new ModelRegistry(authStorage);

const { session } = await createAgentSession({
  sessionManager: SessionManager.create(process.cwd(), paths.data + '/ai-sessions/'),
  authStorage,
  modelRegistry,
  customTools: [invokeActionTool, listActionsTool],
});
```

#### Custom Tools

Pi's built-in tools (`read`, `bash`, `edit`, `write`) are **disabled** for DeskTalk — the agent should not have direct filesystem or shell access. Instead, the AI interacts with DeskTalk through two custom tools:

| Tool            | Description                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_actions`  | Returns the list of `<Action>` declarations registered by the currently focused MiniApp window. Each entry includes the action's `name`, `description`, and parameter schema. |
| `invoke_action` | Calls a named action with parameters. The core resolves the action handler registered by the focused MiniApp and executes it. Returns the action's result.                    |
| `generate_html` | Generates a self-contained HTML document and streams it into a Preview window's sandboxed iframe. Used for charts, visualizations, reports, and any rich visual content.      |

```ts
import { Type } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

const listActionsTool: ToolDefinition = {
  name: 'list_actions',
  label: 'List Actions',
  description: 'List all actions available in the currently focused DeskTalk window.',
  parameters: Type.Object({}),
  execute: async () => {
    const actions = windowManager.getFocusedWindowActions();
    return {
      content: [{ type: 'text', text: JSON.stringify(actions, null, 2) }],
      details: {},
    };
  },
};

const invokeActionTool: ToolDefinition = {
  name: 'invoke_action',
  label: 'Invoke Action',
  description: 'Invoke a named action in the currently focused DeskTalk window.',
  parameters: Type.Object({
    name: Type.String({ description: 'The action name to invoke' }),
    params: Type.Optional(
      Type.Record(Type.String(), Type.Unknown(), {
        description: 'Parameters to pass to the action handler',
      }),
    ),
  }),
  execute: async (_id, { name, params }) => {
    const result = await windowManager.invokeAction(name, params);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      details: {},
    };
  },
};
```

#### Event Streaming

The backend subscribes to `AgentSession` events and forwards them to the frontend over the existing WebSocket connection:

```ts
session.subscribe((event) => {
  // Forward all pi events to connected frontend clients
  ws.broadcast({ type: 'ai:event', event });
});
```

Key event types forwarded to the frontend:

| Event                                           | Frontend use                                           |
| ----------------------------------------------- | ------------------------------------------------------ |
| `message_update` (text_delta)                   | Append streaming text to the chat in the Info Panel.   |
| `message_update` (thinking_delta)               | Show thinking content in a collapsible block.          |
| `tool_execution_start` / `tool_execution_end`   | Show which action the AI is invoking.                  |
| `agent_start` / `agent_end`                     | Toggle "AI is thinking" indicator.                     |
| `turn_end`                                      | Update token/cost counters from `event.message.usage`. |
| `auto_compaction_start` / `auto_compaction_end` | Show compaction status.                                |

### Frontend — Info Panel

The Info Panel is the user-facing AI interface, rendered as a permanent right-side AI Assistant pane in the shell. It is not managed by the normal MiniApp tiling tree.

#### Sections

| Section        | Content                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Chat**       | Scrollable list of user and assistant messages. User types prompts at the bottom. Messages render Markdown.        |
| **Thinking**   | Collapsible block showing the model's chain-of-thought when thinking is enabled.                                   |
| **Tool Calls** | Inline indicators showing when the AI invokes `list_actions` or `invoke_action`, including parameters and results. |
| **Status Bar** | Current model name, thinking level, token usage (input/output/cache), and estimated cost.                          |

#### Sending Prompts

The user types a message in the Info Panel's input field. The frontend sends it to the backend, which calls:

```ts
await session.prompt(userMessage);
```

If the AI is already streaming, the frontend can send steering or follow-up messages:

```ts
// Interrupt: delivered after current tool call
await session.steer(userMessage);

// Queue: delivered after the AI finishes its current run
await session.followUp(userMessage);
```

#### Model and Thinking Controls

The Info Panel's status bar includes controls to:

- **Switch models** — calls `session.setModel(model)` on the backend.
- **Cycle thinking level** — calls `session.cycleThinkingLevel()`.
- **Abort** — calls `session.abort()` to cancel the current operation.

Available models come from `modelRegistry.getAvailable()`, which checks which providers have valid API keys.

### Action Invocation Flow

This is the end-to-end flow when the AI decides to invoke a MiniApp action:

1. User types a prompt in the Info Panel, e.g. _"Create a note titled Shopping List"_.
2. Backend calls `session.prompt(message)`.
3. Pi's LLM decides to call `list_actions` to see what's available.
4. The `list_actions` tool reads the focused window's registered actions (e.g., `Create Note`, `Delete Note`, `Search Notes`).
5. Pi's LLM decides to call `invoke_action` with `{ name: "Create Note", params: { title: "Shopping List" } }`.
6. The core resolves the `Create Note` handler registered by the Note MiniApp's `<Action>` component and executes it.
7. The action handler uses `ctx.messaging` / `ctx.storage` to create the note and returns a result.
8. Pi receives the tool result and generates a final text response: _"I've created a note titled 'Shopping List'."_
9. The response streams to the Info Panel via WebSocket events.

### Authentication and Configuration

Pi credentials (API keys, OAuth tokens) are stored at `<config>/pi-auth.json` via pi's `AuthStorage`. The Preference MiniApp exposes settings for:

| Setting           | Description                                                      |
| ----------------- | ---------------------------------------------------------------- |
| Default Provider  | Which provider to use by default (Anthropic, OpenAI, etc.)       |
| Provider Model    | Which model to use within each configured provider               |
| Thinking Level    | off, minimal, low, medium, high                                  |
| Provider API Key  | Per-provider API key entry                                       |
| Provider Base URL | Optional per-provider endpoint override for compatible providers |

These settings map to `session.setModel()` and `session.setThinkingLevel()` calls on the backend.

### Session Persistence

Pi sessions are stored as JSONL files in `<data>/ai-sessions/`. Pi's `SessionManager` handles:

- **Auto-save** — messages persist automatically.
- **Compaction** — long conversations are summarized when approaching the context limit.
- **Branching** — the tree structure allows navigating back to earlier points (future feature for the Info Panel).

### Dependencies

| Package                         | Purpose                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `@mariozechner/pi-coding-agent` | SDK entry point: `createAgentSession`, `AuthStorage`, `ModelRegistry`, `SessionManager` |
| `@sinclair/typebox`             | JSON Schema definitions for custom tool parameters (peer dependency of pi)              |

The `@desktalk/core` package declares `@mariozechner/pi-coding-agent` as a dependency. No other DeskTalk packages need to depend on pi directly.

## Built-in MiniApps

DeskTalk ships with five built-in MiniApps. Each has its own detailed spec in `docs/miniapps/`.

| MiniApp       | Summary                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Note          | Markdown note-taking with YAML front matter and Milkdown editor.                                                                                              |
| Todo          | Task management similar to macOS Reminders.                                                                                                                   |
| File Explorer | Simple filesystem browser.                                                                                                                                    |
| Preview       | Content viewer supporting image files (zoom, pan, navigation) and HTML files (sandboxed iframe). Also renders streaming HTML generated by the AI assistant.   |
| Preference    | App and window configuration UI. **Privileged** — sole MiniApp with write access to global config (see [Privileged Access](#privileged-access--permissions)). |

## Engineering Guidelines

See [docs/engineering.md](./engineering.md).
