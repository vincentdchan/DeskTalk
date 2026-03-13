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
  config.json                  # Global app configuration (managed by Preference MiniApp)

<data>/
  miniapps/                    # Installed third-party MiniApp packages
  data/
    note/                      # @desktalk/miniapp-note file storage (ctx.fs root)
    todo/                      # @desktalk/miniapp-todo file storage
    file-explorer/             # @desktalk/miniapp-file-explorer file storage
    preference/                # @desktalk/miniapp-preference file storage
    <third-party-id>/          # Any installed MiniApp gets its own directory
  storage/
    note.json                  # @desktalk/miniapp-note key-value store (ctx.storage)
    todo.json                  # @desktalk/miniapp-todo key-value store
    file-explorer.json         # @desktalk/miniapp-file-explorer key-value store
    preference.json            # @desktalk/miniapp-preference key-value store
    <third-party-id>.json      # Any installed MiniApp gets its own store

<logs>/
  core.log
  note.log
  todo.log
  ...

<cache>/
  ...                          # Temporary/regenerable data
```

| Path                       | Purpose                                                                      | Accessed via              |
| -------------------------- | ---------------------------------------------------------------------------- | ------------------------- |
| `<data>/data/<id>/`        | Scoped filesystem for the MiniApp. Files the MiniApp reads/writes live here. | `ctx.fs`                  |
| `<data>/storage/<id>.json` | Scoped key-value store persisted as JSON.                                    | `ctx.storage`             |
| `<logs>/<id>.log`          | Scoped log output.                                                           | `ctx.logger`              |
| `<data>/miniapps/`         | Installed third-party MiniApp npm packages.                                  | Core only                 |
| `<config>/config.json`     | Global app configuration.                                                    | Core / Preference MiniApp |

MiniApps never know or control their absolute paths. The core creates these directories automatically when a MiniApp is first activated, and all `ctx.fs` paths are resolved relative to `<data>/data/<id>/`. This is analogous to VSCode where extensions access `context.storageUri` without knowing the underlying filesystem location.

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

### MiniApp Development

For the full MiniApp development guide — package structure, exported interfaces, entry files, lifecycle, communication hooks, and the standard build toolchain — see [miniapp-development.md](./miniapp-development.md).

**Key design points:**

- Each MiniApp has **two separate entry files**: a backend entry (`src/backend.ts`) that runs on the Node.js server, and a frontend entry (`src/frontend.tsx`) that runs in the browser.
- The backend entry exports `manifest`, `activate(ctx)`, and `deactivate()`. It handles command registration, storage, and filesystem access.
- The frontend entry exports a default React component rendered inside a DeskTalk window. It communicates with the backend exclusively through SDK hooks (`useCommand`, `useEvent`).
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

| Region      | Description                                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window Area | The main workspace where MiniApp windows are rendered. Supports opening, closing, moving, resizing, focusing, and minimizing windows.                                        |
| Info Panel  | A right-side panel that displays AI session information: thinking state, conversation messages, and token/cost usage. Powered by pi (see [AI Integration](#ai-integration)). |
| Dock        | A macOS-style dock at the bottom listing all available MiniApps for quick launch.                                                                                            |

### Window Lifecycle

1. User clicks a MiniApp icon in the Dock (or triggers an AI action).
2. The window manager creates a new window instance and renders the MiniApp's root component inside it.
3. The MiniApp registers its actions via `<ActionsProvider>` so they appear in the Actions Bar when the window is focused.
4. The user (or AI) interacts with the window.
5. The window can be minimized (hides to dock), maximized, or closed.

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

The Info Panel is the user-facing AI interface, rendered as a permanent right-side panel in the shell (not inside any MiniApp window).

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

| Setting        | Description                                     |
| -------------- | ----------------------------------------------- |
| LLM Provider   | Which provider to use (Anthropic, OpenAI, etc.) |
| Model          | Which model to use within the provider          |
| Thinking Level | off, minimal, low, medium, high                 |
| API Key        | Per-provider API key entry                      |

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

DeskTalk ships with four built-in MiniApps. Each has its own detailed spec in `docs/miniapps/`.

| MiniApp       | Summary                                                          |
| ------------- | ---------------------------------------------------------------- |
| Note          | Markdown note-taking with YAML front matter and Milkdown editor. |
| Todo          | Task management similar to macOS Reminders.                      |
| File Explorer | Simple filesystem browser.                                       |
| Preference    | App and window configuration UI.                                 |

## Engineering Guidelines

See [docs/engineering.md](./engineering.md).
