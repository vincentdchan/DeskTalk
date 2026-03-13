# Preference MiniApp Specification

## Overview

The Preference MiniApp provides a settings UI for configuring DeskTalk and its window manager. It is modeled after a typical preferences/settings panel with categorized sections.

## Features

### Configurable Settings

| Category   | Setting                | Type      | Default       | Description |
|------------|------------------------|-----------|---------------|-------------|
| General    | Theme                  | `string`  | `"light"`     | UI theme: `"light"` or `"dark"`. |
| General    | Language               | `string`  | `"en"`        | UI language/locale. |
| General    | Data Directory         | `string`  | *(platform default)* | Override the base data directory. Resolved via `env-paths` by default (see `docs/spec.md`). |
| Server     | Host                   | `string`  | `"localhost"` | Server bind address. |
| Server     | Port                   | `number`  | `3000`        | Server listen port. |
| Window     | Default Width          | `number`  | `800`         | Default width for new windows (px). |
| Window     | Default Height         | `number`  | `600`         | Default height for new windows (px). |
| Window     | Snap to Edges          | `boolean` | `true`        | Snap windows to screen edges when dragging. |
| AI         | Model                  | `string`  | `""`          | AI model identifier. |
| AI         | API Key                | `string`  | `""`          | API key for the AI provider. |
| AI         | Max Tokens             | `number`  | `4096`        | Maximum tokens per AI response. |
| Dock       | Position               | `string`  | `"bottom"`    | Dock position: `"bottom"`, `"left"`, `"right"`. |
| Dock       | Auto-hide              | `boolean` | `false`       | Hide the dock when not hovered. |
| Dock       | Icon Size              | `number`  | `48`          | Dock icon size (px). |

### Persistence

- Settings are stored as a JSON file at the platform-standard config path (e.g., `<config>/config.json`), managed by the core. The Preference MiniApp reads/writes it via `ctx.storage`.
- Changes are applied immediately (no restart required where possible).
- Server-related changes (host, port) require a restart and should display a notification.

## UI Layout

```
|-----------------------------------------|
| Category  |                              |
|           |  Setting Label    [Control]  |
| General   |  Setting Label    [Control]  |
| Server    |  Setting Label    [Control]  |
| Window    |                              |
| AI        |         ...                  |
| Dock      |                              |
|-----------------------------------------|
```

Note: The Actions Bar is a global element managed by the core shell (see `docs/spec.md`). MiniApps register their actions via `<ActionsProvider>`, but the bar itself is not part of the MiniApp window.

| Panel      | Description |
|------------|-------------|
| Category List | Sidebar listing setting categories. Clicking a category scrolls to or filters that section. |
| Settings Panel | The main area showing setting rows. Each row has a label, description, and an input control (text field, toggle, dropdown, number input). |

### Controls

| Setting Type | Control |
|-------------|---------|
| `string`    | Text input or dropdown (for enums). |
| `number`    | Number input with optional min/max. |
| `boolean`   | Toggle switch. |

## Frontend Components

| Component              | Responsibility |
|------------------------|---------------|
| `PreferenceCategoryList` | Sidebar of categories. |
| `PreferenceSection`      | Group of related settings under one category heading. |
| `PreferenceRow`          | Single setting: label, description, and input control. |
| `PreferenceActions`      | Provides actions via `<ActionsProvider>`. |

## Actions (AI-invokable)

| Action          | Description | Parameters |
|-----------------|-------------|------------|
| `Get Setting`   | Read the current value of a setting. | `key: string` |
| `Set Setting`   | Update a setting's value. | `key: string`, `value: any` |
| `Reset Setting` | Reset a setting to its default value. | `key: string` |
| `Reset All`     | Reset all settings to defaults. | -- |

## Backend

The Preference MiniApp does not implement its own HTTP server. All backend logic runs inside the `activate` function and communicates with the frontend via the core's messaging and storage hooks (see `docs/spec.md` — MiniApp System).

### Commands (via MessagingHook)

| Command                  | Request | Response | Description |
|--------------------------|---------|----------|-------------|
| `preferences.getAll`     | `void` | `Config` | Get all current settings. |
| `preferences.get`        | `{ key: string }` | `{ value: string \| number \| boolean }` | Get a single setting's value. |
| `preferences.set`        | `{ key: string, value: string \| number \| boolean }` | `void` | Update a single setting. |
| `preferences.reset`      | `{ key: string }` | `void` | Reset a single setting to its default. |
| `preferences.resetAll`   | `void` | `void` | Reset all settings to defaults. |

### Data Model

```ts
interface PreferenceSchema {
  key: string;
  label: string;
  description: string;
  type: 'string' | 'number' | 'boolean';
  default: string | number | boolean;
  options?: string[];  // For enum-like string settings
  min?: number;        // For number settings
  max?: number;        // For number settings
  category: string;
  requiresRestart?: boolean;
}

// Runtime config is a flat key-value map
type Config = Record<string, string | number | boolean>;
```

### Security

- The API key setting should be masked in the UI and API responses (only show last 4 characters).
- The config file should have restricted filesystem permissions (0600).
