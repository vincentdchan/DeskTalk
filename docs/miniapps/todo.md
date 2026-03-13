# Todo MiniApp Specification

## Overview

The Todo MiniApp is a task management tool similar to the macOS Reminders app. It supports organizing tasks into lists, marking tasks as complete, and setting priorities and due dates.

## Features

### Core

- Create, read, update, and delete todo items.
- Organize todos into named lists (e.g., "Work", "Personal", "Shopping").
- Mark todos as complete/incomplete.
- Set priority levels (none, low, medium, high).
- Set optional due dates.
- Sort by creation date, due date, or priority.

### Lists

- Users can create, rename, and delete lists.
- A default "Inbox" list always exists and cannot be deleted.
- Deleting a list deletes all todos within it.

## UI Layout

```
|---------------------------------|
| Lists     | Todo Items          |
|           |                     |
|           | [ ] Buy groceries   |
|           | [x] Write spec      |
|           | [ ] Review PR       |
|           |                     |
|-----------|---------------------|
```

Note: The Actions Bar is a global element managed by the core shell (see `docs/spec.md`). MiniApps register their actions via `<ActionsProvider>`, but the bar itself is not part of the MiniApp window.

| Panel      | Description |
|------------|-------------|
| Lists      | Sidebar listing all todo lists with item counts. Includes an "All" virtual list. |
| Todo Items | The main area showing todos for the selected list. Each item has a checkbox, title, and optional metadata (due date, priority badge). |

### Todo Item Row

Each todo row displays:

- Checkbox (complete/incomplete)
- Title (editable inline)
- Priority badge (color-coded) if set
- Due date if set
- Delete button on hover

### Inline Editing

- Clicking a todo title enables inline editing.
- Pressing Enter or clicking outside saves the change.
- A detail panel or popover can be used for editing priority and due date.

## Frontend Components

| Component       | Responsibility |
|-----------------|---------------|
| `TodoListSidebar` | Displays all lists. Supports creating and deleting lists. |
| `TodoItemList`    | Renders todo items for the selected list. Handles sorting. |
| `TodoItem`        | Single todo row with checkbox, inline title editing, metadata display. |
| `TodoActions`     | Provides actions via `<ActionsProvider>`. |

## Actions (AI-invokable)

| Action            | Description | Parameters |
|-------------------|-------------|------------|
| `Add Todo`        | Create a new todo item in the current list. | `title: string`, `list?: string`, `priority?: string`, `dueDate?: string` |
| `Complete Todo`   | Mark a todo as complete. | `id: string` |
| `Uncomplete Todo` | Mark a todo as incomplete. | `id: string` |
| `Delete Todo`     | Delete a todo item. | `id: string` |
| `Create List`     | Create a new todo list. | `name: string` |
| `Delete List`     | Delete a todo list and all its items. | `name: string` |

## Backend

The Todo MiniApp does not implement its own HTTP server. All backend logic runs inside the `activate` function and communicates with the frontend via the core's messaging and storage hooks (see `docs/spec.md` — MiniApp System).

### Storage

Todo lists and items are persisted using `ctx.storage` (backed by `ctx.paths.storage`). Lists are stored with key prefix `list:` and items with prefix `item:`. All paths are provided by the core at activation.

### Commands (via MessagingHook)

| Command                | Request | Response | Description |
|------------------------|---------|----------|-------------|
| `todos.lists.list`     | `void` | `TodoList[]` | List all todo lists with item counts. |
| `todos.lists.create`   | `{ name: string }` | `TodoList` | Create a new list. |
| `todos.lists.rename`   | `{ id: string, name: string }` | `TodoList` | Rename a list. |
| `todos.lists.delete`   | `{ id: string }` | `void` | Delete a list and all its items. |
| `todos.items.list`     | `{ listId: string }` | `TodoItem[]` | Get all items in a list. |
| `todos.items.create`   | `{ listId: string, title: string, priority?: string, dueDate?: string }` | `TodoItem` | Create a new todo item. |
| `todos.items.update`   | `{ id: string, title?: string, completed?: boolean, priority?: string, dueDate?: string }` | `TodoItem` | Update a todo item. |
| `todos.items.delete`   | `{ id: string }` | `void` | Delete a todo item. |

### Data Model

```ts
interface TodoList {
  id: string;
  name: string;
  createdAt: string;
}

interface TodoItem {
  id: string;
  listId: string;
  title: string;
  completed: boolean;
  priority: 'none' | 'low' | 'medium' | 'high';
  dueDate: string | null;  // ISO 8601 or null
  createdAt: string;
  updatedAt: string;
}
```
