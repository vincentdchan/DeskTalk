# Preference MiniApp Specification

## Overview

The Preference MiniApp provides a settings UI for configuring DeskTalk and its window manager. It is modeled after a typical preferences/settings panel with categorized sections.

> **Privileged MiniApp.** The Preference MiniApp is the **only** MiniApp authorized to read and write the global configuration (`<config>/config.toml`). The core owns the file and handles all TOML parsing/serialization — the Preference MiniApp accesses it through the privileged `ctx.config` hook. See [`docs/spec.md` — Privileged Access & Permissions](../spec.md#privileged-access--permissions) for the full access-control model.

## Privileged Access

The global configuration controls critical application behavior (server bind address, AI API keys, window defaults, etc.). To prevent accidental or malicious modification, the core restricts config access exclusively to the Preference MiniApp.

### How It Works

1. **Manifest ID check** — At activation time the core inspects `manifest.id`. Only `"preference"` receives a populated `ctx.config` hook. All other MiniApps receive `ctx.config === undefined`.
2. **Built-in priority** — The `"preference"` ID is reserved for the built-in `@desktalk/miniapp-preference` package. Third-party packages cannot claim this ID; the core rejects duplicate IDs and gives built-in packages priority.
3. **Reserved command namespace** — The `preferences.*` command namespace is exclusively reserved for this MiniApp. The core rejects `ctx.messaging.onCommand('preferences.*', ...)` registrations from any other MiniApp.
4. **Read-only broadcast** — When a setting changes, the core broadcasts a `config:changed` event (key + value) to all MiniApps so they can react (e.g., theme switch). Sensitive keys (e.g., `ai.providers.openai.apiKey`) are omitted from broadcasts.

### ctx.config (ConfigHook)

The Preference MiniApp accesses global configuration through the privileged `ctx.config` hook. The core manages the underlying TOML file (`<config>/config.toml`) — parsing, serialization, atomic writes, and file permissions are all handled internally. The Preference MiniApp never touches the file directly; it uses only the typed key-value API below.

It does **not** use `ctx.storage` for config (though it may use `ctx.storage` for its own UI state like sidebar selection).

```ts
interface ConfigHook {
  getAll(): Promise<Config>;
  get(key: string): Promise<string | number | boolean | undefined>;
  set(key: string, value: string | number | boolean): Promise<void>;
  reset(key: string): Promise<void>;
  resetAll(): Promise<void>;
}
```

## Features

### Configurable Settings

| Category | Setting           | Type     | Default              | Description                                                                                 |
| -------- | ----------------- | -------- | -------------------- | ------------------------------------------------------------------------------------------- |
| General  | Theme             | `string` | `"light"`            | UI theme: `"light"` or `"dark"`.                                                            |
| General  | Language          | `string` | `"en"`               | UI language/locale.                                                                         |
| General  | Data Directory    | `string` | _(platform default)_ | Override the base data directory. Resolved via `env-paths` by default (see `docs/spec.md`). |
| Server   | Host              | `string` | `"localhost"`        | Server bind address.                                                                        |
| Server   | Port              | `number` | `3000`               | Server listen port.                                                                         |
| AI       | Default Provider  | `string` | `"openai"`           | Default provider used for AI chat/tool execution.                                           |
| AI       | Provider Model    | `string` | `""`                 | Model identifier for each configured AI provider.                                           |
| AI       | Provider API Key  | `string` | `""`                 | API key for each configured provider that uses API-key auth.                                |
| AI       | Provider Base URL | `string` | `""`                 | Optional custom base URL for providers that support endpoint overrides.                     |
| AI       | Max Tokens        | `number` | `4096`               | Maximum tokens per AI response.                                                             |

### Persistence

- Settings are stored in TOML format at the platform-standard config path (`<config>/config.toml`), **managed entirely by the core**. The core handles all file I/O, TOML parsing/serialization, and atomic writes. The Preference MiniApp reads/writes settings exclusively via the privileged `ctx.config` hook — it never accesses the file directly.
- Changes are applied immediately (no restart required where possible).
- Server-related changes (host, port) require a restart and should display a notification.

## UI Layout

```
|-----------------------------------------|
| Category  |                              |
|           |  Setting Label    [Control]  |
| General   |  Setting Label    [Control]  |
| Server    |  Setting Label    [Control]  |
| AI        |         ...                  |
|-----------------------------------------|
```

Note: The Actions Bar is a global element managed by the core shell (see `docs/spec.md`). MiniApps register their actions via `<ActionsProvider>`, but the bar itself is not part of the MiniApp window.

| Panel          | Description                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Category List  | Sidebar listing setting categories. Clicking a category scrolls to or filters that section.                                               |
| Settings Panel | The main area showing setting rows. Each row has a label, description, and an input control (text field, toggle, dropdown, number input). |

### Controls

| Setting Type | Control                             |
| ------------ | ----------------------------------- |
| `string`     | Text input or dropdown (for enums). |
| `number`     | Number input with optional min/max. |
| `boolean`    | Toggle switch.                      |

## Frontend Components

| Component                | Responsibility                                         |
| ------------------------ | ------------------------------------------------------ |
| `PreferenceCategoryList` | Sidebar of categories.                                 |
| `PreferenceSection`      | Group of related settings under one category heading.  |
| `PreferenceRow`          | Single setting: label, description, and input control. |
| `PreferenceActions`      | Provides actions via `<ActionsProvider>`.              |

## Actions (AI-invokable)

| Action          | Description                           | Parameters                  |
| --------------- | ------------------------------------- | --------------------------- |
| `Get Setting`   | Read the current value of a setting.  | `key: string`               |
| `Set Setting`   | Update a setting's value.             | `key: string`, `value: any` |
| `Reset Setting` | Reset a setting to its default value. | `key: string`               |
| `Reset All`     | Reset all settings to defaults.       | --                          |

## Backend

The Preference MiniApp does not implement its own HTTP server. All backend logic runs inside the `activate` function and communicates with the frontend via the core's messaging and storage hooks (see `docs/spec.md` — MiniApp System).

### Commands (via MessagingHook)

| Command                | Request                                               | Response                                 | Description                                                                                |
| ---------------------- | ----------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `preferences.getAll`   | `void`                                                | `Config`                                 | Get all current settings.                                                                  |
| `preferences.get`      | `{ key: string }`                                     | `{ value: string \| number \| boolean }` | Get a single setting's value.                                                              |
| `preferences.set`      | `{ key: string, value: string \| number \| boolean }` | `void`                                   | Update a single setting, including per-provider AI keys like `ai.providers.openai.apiKey`. |
| `preferences.reset`    | `{ key: string }`                                     | `void`                                   | Reset a single setting to its default.                                                     |
| `preferences.resetAll` | `void`                                                | `void`                                   | Reset all settings to defaults.                                                            |

### Data Model

```ts
interface PreferenceSchema {
  key: string;
  label: string;
  description: string;
  type: 'string' | 'number' | 'boolean';
  default: string | number | boolean;
  options?: string[]; // For enum-like string settings
  min?: number; // For number settings
  max?: number; // For number settings
  category: string;
  requiresRestart?: boolean;
}

// Runtime config is a flat key-value map
type Config = Record<string, string | number | boolean>;
```

### Security

- AI provider API key settings should be masked in the UI and API responses (only show last 4 characters).
- The config file (`<config>/config.toml`) is written by the core with restricted filesystem permissions (`0600`).
- The Preference MiniApp never reads or writes the TOML file directly — all I/O goes through the core's `ConfigHook`.
