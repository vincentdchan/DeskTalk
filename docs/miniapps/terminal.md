# Terminal MiniApp Specification

## Overview

The Terminal MiniApp is a full-featured terminal emulator modeled after the macOS Terminal app. It provides a tabbed interface for running interactive shell sessions inside DeskTalk, powered by [xterm.js](https://xtermjs.org/) on the frontend and [node-pty](https://github.com/nicedoc/node-pty) on the backend. Each tab spawns an isolated pseudo-terminal running the user's default shell (e.g., `/bin/bash`, `/bin/zsh`).

Beyond interactive use, the Terminal MiniApp is the **designated execution surface for the pi coding agent**. Instead of a built-in bash tool, the agent opens (or reuses) a Terminal window with the same shallow-equal launch arguments and executes commands through it — so the user can observe every command the AI runs and intervene if necessary.

> **Safety-critical MiniApp.** The Terminal MiniApp has direct access to the host operating system's shell. To mitigate risk, all commands — whether entered by the user or dispatched by the AI agent — pass through a **command safety analyzer** that inspects destructive operations (e.g., `rm`, `rm -rf`, `chmod`, `mkfs`) and requires explicit user confirmation before execution.

## Features

### Core

- Spawn interactive shell sessions in pseudo-terminals (PTY).
- Multi-tab interface — create, close, rename, and switch between tabs.
- Full terminal emulation via xterm.js (colors, cursor movement, scrollback, resize).
- Configurable default shell and startup directory.
- Copy and paste support within the terminal viewport.
- Scrollback buffer with configurable line limit.

### Multi-Tab

- Each tab runs an independent PTY session.
- Tabs display the running process name or a user-defined label.
- Closing a tab sends `SIGHUP` to the PTY process and cleans up resources.
- A "+" button creates a new tab; tabs can also be closed via a per-tab close button or keyboard shortcut.
- Tab order is preserved; the active tab is visually highlighted.

### Command Safety Analysis

All input lines submitted to a PTY — whether typed by the user or sent programmatically by the AI agent — are intercepted and analyzed before being forwarded to the shell.

**Analyzed commands:**

| Pattern                         | Risk                          | Behavior                                                  |
| ------------------------------- | ----------------------------- | --------------------------------------------------------- | --------------------- |
| `rm` (with any flags)           | Destructive file deletion     | Prompt user confirmation; show expanded paths if possible |
| `rm -rf /` or `rm -rf /*`       | Catastrophic                  | **Block unconditionally** with an error message           |
| `chmod 777` on sensitive paths  | Permission escalation         | Prompt user confirmation                                  |
| `mkfs`, `dd if=... of=/dev/...` | Disk destruction              | Prompt user confirmation                                  |
| `:(){ :                         | : & };:` (fork bomb patterns) | System DoS                                                | Block unconditionally |
| `> /dev/sda` or similar         | Disk destruction              | Block unconditionally                                     |

**Analysis approach:**

1. **Tokenize** — Split the input line by shell operators (`;`, `&&`, `||`, `|`, `\n`) into individual command segments.
2. **Match** — Check each segment's leading command against a configurable blocklist/warnlist.
3. **Classify** — Assign a risk level: `safe`, `warn` (requires confirmation), or `block` (rejected outright).
4. **Gate** — For `warn` commands, the frontend shows a confirmation dialog before forwarding the input to the PTY. For `block` commands, the input is rejected with an explanatory message. For `safe` commands, input is forwarded immediately.

The safety analyzer runs on the **backend** so it cannot be bypassed by a modified frontend. The frontend is responsible only for rendering the confirmation UI.

## UI Layout

```
|---------------------------------------------|
| Tab 1  | Tab 2  | Tab 3           |  [+]   |
|---------------------------------------------|
|                                             |
|  user@host:~$ ls -la                        |
|  total 32                                   |
|  drwxr-xr-x  5 user user 4096 Mar 15 ...   |
|  -rw-r--r--  1 user user  220 Mar 15 ...   |
|                                             |
|  user@host:~$ _                             |
|                                             |
|---------------------------------------------|
```

Note: The Actions Bar is a global element managed by the core shell (see `docs/spec.md`). MiniApps register their actions via `<ActionsProvider>`, but the bar itself is not part of the MiniApp window.

| Element             | Description                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab Bar             | Horizontal row of tabs, each representing a PTY session. Includes the active tab indicator, per-tab close button, and a "+" button to create a new tab. |
| Terminal Viewport   | The xterm.js canvas filling the remaining window area. Handles keyboard input, mouse selection, scrollback, and resize.                                 |
| Confirmation Dialog | Modal overlay shown when the safety analyzer flags a `warn`-level command. Displays the flagged command, the risk reason, and Confirm / Cancel buttons. |

### Interactions

- Click a tab to switch sessions; the terminal viewport swaps to the selected tab's PTY output.
- Click "+" or use a keyboard shortcut (e.g., `Cmd+T` / `Ctrl+Shift+T`) to create a new tab.
- Click the tab close button or use `Cmd+W` / `Ctrl+Shift+W` to close a tab (with confirmation if a process is running).
- Right-click in the viewport for a context menu (copy, paste, clear, select all).
- Terminal resizes dynamically when the window is resized — the backend PTY columns/rows are updated accordingly.

## Frontend

### Technology

Use [xterm.js](https://xtermjs.org/) as the terminal renderer. Key addons:

| Addon                    | Purpose                                           |
| ------------------------ | ------------------------------------------------- |
| `@xterm/addon-fit`       | Auto-resize the terminal to fit its container.    |
| `@xterm/addon-web-links` | Detect and make URLs clickable.                   |
| `@xterm/addon-search`    | In-terminal text search (Ctrl+Shift+F).           |
| `@xterm/addon-webgl`     | GPU-accelerated rendering (with canvas fallback). |

### Components

| Component             | Responsibility                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `TerminalTabBar`      | Renders tab headers with active indicator, close buttons, and "+" button. Handles tab reordering (optional).             |
| `TerminalView`        | Wraps a single xterm.js `Terminal` instance. Manages the addon lifecycle, input/output streaming, and resize events.     |
| `TerminalContainer`   | Manages the collection of `TerminalView` instances keyed by tab ID. Shows the active tab's view, hides others.           |
| `SafetyConfirmDialog` | Modal dialog rendered when the backend flags a command. Shows the command, risk description, and confirm/cancel buttons. |
| `TerminalActions`     | Provides actions via `<ActionsProvider>`.                                                                                |

### Frontend ↔ Backend Communication

The terminal requires **low-latency, bidirectional streaming** — standard command/response messaging is not suitable for PTY I/O. The recommended approach:

- **PTY output** (backend → frontend): The backend emits `terminal.output` events containing raw PTY data chunks. The frontend subscribes via `useEvent('terminal.output', ...)` and writes each chunk to the xterm.js `Terminal` instance.
- **PTY input** (frontend → backend): The frontend sends `terminal.input` commands containing the user's keystrokes. xterm.js's `onData` callback fires on every keystroke and sends it to the backend.
- **Resize**: On window/container resize, the frontend calls `terminal.resize` with the new columns and rows.

This keeps the architecture consistent with the existing MiniApp messaging model while supporting streaming data.

## Actions (AI-invokable)

| Action       | Description                                                            | Parameters                          |
| ------------ | ---------------------------------------------------------------------- | ----------------------------------- |
| `List Tabs`  | List all open terminal tabs with their IDs and labels.                 | —                                   |
| `Create Tab` | Open a new terminal tab and make it active.                            | `label?: string`, `cwd?: string`    |
| `Close Tab`  | Close a terminal tab by ID.                                            | `tabId: string`                     |
| `Focus Tab`  | Switch the viewport to a specific tab.                                 | `tabId: string`                     |
| `Execute`    | Send a command string to the active (or specified) tab's PTY.          | `command: string`, `tabId?: string` |
| `Get Output` | Return recent terminal output (last N lines of scrollback) from a tab. | `tabId?: string`, `lines?: number`  |

The `Execute` action is the primary mechanism for the pi coding agent to run shell commands (see [AI Agent Integration](#ai-agent-integration) below).

## Backend

The Terminal MiniApp does not implement its own HTTP server. All backend logic runs inside the `activate` function and communicates with the frontend via the core's messaging hooks (see `docs/spec.md` — MiniApp System).

### Technology

Use [node-pty](https://github.com/microsoft/node-pty) to spawn pseudo-terminal processes. Each tab maps to one `node-pty` instance.

### PTY Lifecycle

1. **Create** — `terminal.create` spawns a new PTY with the configured shell, initial working directory, and environment variables. Returns a `tabId`.
2. **I/O** — `terminal.input` writes to the PTY's stdin; `terminal.output` events stream the PTY's stdout/stderr to the frontend.
3. **Resize** — `terminal.resize` updates the PTY's columns and rows.
4. **Close** — `terminal.close` sends `SIGHUP`, waits briefly, then force-kills the PTY process and frees resources.
5. **Exit** — When the shell process exits on its own, the backend emits a `terminal.exit` event with the exit code.

### Commands (via MessagingHook)

| Command              | Request                                         | Response                                 | Description                                                                                                                                                                                                                                                     |
| -------------------- | ----------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `terminal.create`    | `{ label?: string, cwd?: string }`              | `{ tabId: string }`                      | Spawn a new PTY session.                                                                                                                                                                                                                                        |
| `terminal.input`     | `{ tabId: string, data: string }`               | `void`                                   | Write data (keystrokes) to a PTY. Passes through the safety analyzer first.                                                                                                                                                                                     |
| `terminal.resize`    | `{ tabId: string, cols: number, rows: number }` | `void`                                   | Resize a PTY.                                                                                                                                                                                                                                                   |
| `terminal.close`     | `{ tabId: string }`                             | `void`                                   | Kill and clean up a PTY session.                                                                                                                                                                                                                                |
| `terminal.list`      | `void`                                          | `TerminalTab[]`                          | List all active tabs.                                                                                                                                                                                                                                           |
| `terminal.getOutput` | `{ tabId: string, lines?: number }`             | `{ output: string }`                     | Return recent scrollback output.                                                                                                                                                                                                                                |
| `terminal.execute`   | `{ tabId: string, command: string }`            | `{ accepted: boolean, reason?: string }` | Submit a command line for execution. Runs the safety analyzer; if the command is `block`-level, returns `accepted: false` with a reason. If `warn`-level, emits a `terminal.confirm` event to the frontend. If `safe`, writes the command + newline to the PTY. |

### Events (backend → frontend)

| Event              | Payload                                                               | Description                                                                   |
| ------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `terminal.output`  | `{ tabId: string, data: string }`                                     | Raw PTY output chunk for rendering.                                           |
| `terminal.exit`    | `{ tabId: string, exitCode: number }`                                 | PTY process exited.                                                           |
| `terminal.confirm` | `{ tabId: string, command: string, risk: string, requestId: string }` | Safety analyzer flagged a command — frontend should show confirmation dialog. |

The frontend responds to `terminal.confirm` by sending a `terminal.confirmResponse` command:

| Command                    | Request                                     | Response | Description                                                                                         |
| -------------------------- | ------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `terminal.confirmResponse` | `{ requestId: string, confirmed: boolean }` | `void`   | User's response to a safety confirmation prompt. If confirmed, the command is forwarded to the PTY. |

### Data Model

```ts
interface TerminalTab {
  tabId: string;
  label: string; // User-defined or auto-generated (e.g., "bash", "zsh")
  cwd: string; // Current working directory (best-effort, read from /proc or lsof)
  pid: number; // PTY child process PID
  running: boolean; // Whether the shell process is still alive
  createdAt: string; // ISO 8601
}

interface SafetyAnalysisResult {
  level: 'safe' | 'warn' | 'block';
  command: string; // The original command string
  reason?: string; // Human-readable explanation (for warn/block)
  segments: CommandSegment[];
}

interface CommandSegment {
  raw: string; // The raw command segment
  program: string; // Detected program name (e.g., "rm", "chmod")
  level: 'safe' | 'warn' | 'block';
  reason?: string;
}
```

### Security

- **Process isolation.** Each PTY runs in the MiniApp's child process (per the standard DeskTalk backend model). If the MiniApp is killed, all PTY sessions are terminated with it.
- **Safety analyzer is backend-side.** The command analysis logic runs in the backend, not the frontend, so it cannot be bypassed by a modified UI.
- **No shell injection via messaging.** The `terminal.input` command writes raw bytes to the PTY — the backend never wraps input in `sh -c` or similar constructs that could introduce injection vectors.
- **Scrollback isolation.** Each tab maintains its own scrollback buffer. The `terminal.getOutput` command only returns output from the requested tab.
- **Configurable blocklist.** The safety analyzer's command patterns are loaded from a configuration file at activation time, allowing administrators to customize which commands require confirmation or are blocked entirely.
- **Audit logging.** All commands sent to PTY sessions — including the safety analysis result — are written to the MiniApp's logger (`ctx.logger`), providing an audit trail of what was executed and by whom (user vs. AI agent).

## AI Agent Integration

### Motivation

The pi coding agent (see `packages/core/src/services/ai/`) currently has three tools: `read`, `desktop`, and `action`. It has **no built-in bash/shell execution tool**. This is intentional — shell access is a high-risk capability, and DeskTalk's design philosophy is that all user-visible work happens through MiniApp windows where users can observe and control it.

The Terminal MiniApp closes this gap by giving the agent a **supervised bash execution path**:

1. The user can see every command the agent runs in a real terminal window.
2. The safety analyzer applies the same protections to AI-dispatched commands as to user-typed ones.
3. The user can intervene (cancel, modify) before destructive commands execute.
4. The terminal output is visible, so the user understands what happened.

### New Agent Tool: `bash`

A new `bash` tool is added to the pi coding agent's tool set (alongside `read`, `desktop`, and `action`). This tool does **not** execute commands directly — it routes them through the Terminal MiniApp.

**Tool definition:**

```
### bash
Execute a bash command in the Terminal MiniApp.
The command runs in a visible terminal window so the user can observe execution.
Destructive commands (rm, chmod, etc.) require user confirmation before executing.

Parameters:
  - command (string, required): The bash command to execute.
  - tabId (string, optional): Target terminal tab. If omitted, uses the most recent tab or creates a new one.
```

**Execution flow:**

```
AI decides to run a command
  │
  ▼
AI calls bash(command="ls -la")
  │
  ▼
bash tool handler in pi-session-service:
  1. Check if a Terminal window is open
     ├─ No  → Call desktop(action="open", miniAppId="terminal")
     │        Wait for window to be ready
     └─ Yes → Use existing window
  │
  ▼
  2. Call action(name="Execute", params={ command: "ls -la" })
     on the Terminal window
  │
  ▼
  3. Terminal backend runs safety analysis
     ├─ safe  → Execute immediately
     ├─ warn  → Frontend shows confirmation dialog
     │          User confirms or cancels
     └─ block → Return error to agent
  │
  ▼
  4. Wait for command to complete (heuristic: watch for
     shell prompt to reappear in output)
  │
  ▼
  5. Call action(name="Get Output", params={ lines: 50 })
     to read the result
  │
  ▼
  6. Return output to agent
```

### Completion Detection

Detecting when a command has finished executing in an interactive PTY is non-trivial. Recommended approaches (in order of reliability):

1. **Shell integration (preferred)** — Configure the shell prompt to emit an OSC escape sequence (e.g., `\e]133;D\a`) after each command completes. xterm.js and the backend can watch for this marker.
2. **Prompt detection** — Watch PTY output for the shell prompt pattern (e.g., `$`, `#`, or a custom `PS1` marker) appearing after command output.
3. **Timeout** — Fall back to a configurable timeout (e.g., 30 seconds) and return whatever output has accumulated.

The `bash` tool should use approach 1 if shell integration is available, falling back to 2, then 3.

### System Prompt Update

The pi coding agent's system prompt (in `pi-session-service.ts`) is updated to include the new tool:

```
## Tools

### read
Read a file from the workspace by path.

### desktop
Manage windows on the desktop.

### action
Invoke a MiniApp action by name with JSON parameters.

### bash
Execute a bash command in the Terminal MiniApp.
The command runs in a visible terminal window so the user can observe execution.
Destructive commands (rm, chmod, etc.) require user confirmation.

Parameters:
  - command (string, required): The bash command to execute.
  - tabId (string, optional): Target terminal tab ID.

Returns the command output (stdout + stderr).
If the command was blocked by the safety analyzer, returns an error with the reason.
```

### Example Agent Interaction

```
User: "Install lodash in my project"
  │
  ▼
[Desktop Context]
Focused: "Terminal" (w-3, miniapp: terminal)
Windows:
  w-3: "Terminal" (miniapp: terminal, focused)
MiniApps:
  terminal: Terminal
  notes: Notes
  ...
Actions (w-3):
  List Tabs: List all open terminal tabs | params: {}
  Create Tab: Open a new terminal tab | params: {label: string (optional), cwd: string (optional)}
  Execute: Send a command to the PTY | params: {command: string (required), tabId: string (optional)}
  Get Output: Return recent output | params: {tabId: string (optional), lines: number (optional)}
[/Desktop Context]
  │
  ▼
AI calls bash(command="npm install lodash")
  │
  ▼
Terminal window shows: $ npm install lodash
                       added 1 package in 2.1s
  │
  ▼
AI receives output: "added 1 package in 2.1s"
  │
  ▼
AI responds: "Done! I've installed lodash. You can see the output in the Terminal."
```

```
User: "Clean up the temp files"
  │
  ▼
AI calls bash(command="rm -rf /tmp/myapp-cache/*")
  │
  ▼
Safety analyzer: level=warn, reason="rm with -rf flag"
  │
  ▼
Terminal shows confirmation dialog:
  ┌─────────────────────────────────────────┐
  │  ⚠ Potentially destructive command      │
  │                                         │
  │  rm -rf /tmp/myapp-cache/*              │
  │                                         │
  │  This command uses rm with the -rf      │
  │  flag, which permanently deletes files  │
  │  without confirmation.                  │
  │                                         │
  │           [Cancel]  [Confirm]           │
  └─────────────────────────────────────────┘
  │
  ├─ User clicks Confirm → command executes
  └─ User clicks Cancel  → agent receives error: "Command cancelled by user"
```
