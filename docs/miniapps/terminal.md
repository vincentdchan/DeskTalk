# Terminal MiniApp Specification

## Overview

The Terminal MiniApp is a browser-based terminal emulator similar to the macOS Terminal app. It supports multiple tabs, each running an independent bash session, and allows the AI to execute commands on behalf of the user.

## Features

### Core

- Run interactive bash sessions in the browser.
- Multiple tabs, each with its own independent shell process.
- Switch between tabs.
- Create and close tabs.
- Scrollback buffer for reviewing previous output.

### Tabs

- Users can create new tabs, each spawning a fresh bash session.
- A default tab is created automatically when the MiniApp is opened.
- Closing a tab terminates its underlying shell process.
- Tabs display a title derived from the running command or a user-set label.

## UI Layout

```
|-----------------------------------------|
| [Tab 1] [Tab 2] [+]                    |
|-----------------------------------------|
|                                         |
|  $ ls -la                               |
|  total 32                               |
|  drwxr-xr-x  5 user staff  160 Mar 13  |
|  -rw-r--r--  1 user staff  245 Mar 13  |
|  $ _                                    |
|                                         |
|-----------------------------------------|
```

Note: The Actions Bar is a global element managed by the core shell (see `docs/spec.md`). MiniApps register their actions via `<ActionsProvider>`, but the bar itself is not part of the MiniApp window.

| Element       | Description |
|---------------|-------------|
| Tab Bar       | Horizontal bar listing open tabs. Each tab shows its title. Includes a "+" button to create a new tab. |
| Terminal View | The main area rendering the terminal output and accepting keyboard input for the active tab's shell session. |

### Interactions

- Click a tab to switch to it.
- Click the "+" button to open a new tab.
- Click the close button on a tab to close it and terminate its shell session.
- Type in the terminal view to send input to the active shell session.

## Frontend Components

| Component         | Responsibility |
|-------------------|---------------|
| `TerminalTabBar`  | Renders the tab bar with tab titles, close buttons, and a new-tab button. |
| `TerminalView`    | Renders the terminal emulator for the active tab using xterm.js. |
| `TerminalActions` | Provides actions via `<ActionsProvider>`. |

### Terminal Rendering

Use [xterm.js](https://xtermjs.org/) as the terminal emulator component:

- Full ANSI escape code support for colors, cursor movement, etc.
- Keyboard input is captured and sent to the backend shell session.
- Output from the backend is streamed to the xterm.js instance in real time.
- Supports scrollback buffer for reviewing previous output.

## Actions (AI-invokable)

| Action            | Description | Parameters |
|-------------------|-------------|------------|
| `Execute Bash`    | Execute a bash command in the active tab's shell session. | `command: string` |
| `Switch Tab`      | Switch to a tab by index or title. | `tab: number \| string` |
| `New Tab`         | Create a new terminal tab. | — |
| `Close Tab`       | Close the active terminal tab. | — |

## Backend

The Terminal MiniApp does not implement its own HTTP server. All backend logic runs inside the `activate` function and communicates with the frontend via the core's messaging hooks (see `docs/spec.md` — MiniApp System).

### Shell Sessions

Each tab corresponds to a server-side shell process (e.g., spawned via `node-pty`). The backend manages the lifecycle of these processes:

- **Create**: Spawn a new pseudo-terminal (pty) process running the user's default shell.
- **Input**: Forward keystrokes from the frontend to the pty's stdin.
- **Output**: Stream pty stdout/stderr to the frontend in real time via messaging events.
- **Destroy**: Kill the pty process when its tab is closed or the MiniApp is deactivated.

### Commands (via MessagingHook)

| Command                   | Request | Response | Description |
|---------------------------|---------|----------|-------------|
| `terminal.tabs.list`      | `void` | `TerminalTab[]` | List all open tabs. |
| `terminal.tabs.create`    | `void` | `TerminalTab` | Create a new tab with a fresh shell session. |
| `terminal.tabs.close`     | `{ id: string }` | `void` | Close a tab and kill its shell process. |
| `terminal.input`          | `{ tabId: string, data: string }` | `void` | Send input data to a tab's shell session. |
| `terminal.resize`         | `{ tabId: string, cols: number, rows: number }` | `void` | Resize a tab's pseudo-terminal. |
| `terminal.execute`        | `{ tabId: string, command: string }` | `void` | Write a command followed by a newline to a tab's shell session. |

### Events (via MessagingHook)

| Event                     | Payload | Description |
|---------------------------|---------|-------------|
| `terminal.output`         | `{ tabId: string, data: string }` | Output data from a tab's shell session. |
| `terminal.exit`           | `{ tabId: string, exitCode: number }` | A tab's shell process has exited. |

### Data Model

```ts
interface TerminalTab {
  id: string;
  title: string;      // Derived from running command or user-set label
  createdAt: string;   // ISO 8601
}
```

### Security

- Shell processes run with the same permissions as the DeskTalk server process.
- The AI's `Execute Bash` action sends commands to the active shell session — the user should be aware that AI-invoked commands have the same privileges as manually typed ones.
- No persistent storage is used; terminal state is ephemeral and lost when tabs are closed or the MiniApp is deactivated.
