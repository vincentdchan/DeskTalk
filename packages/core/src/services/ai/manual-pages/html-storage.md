# HTML Storage

Generated LiveApps automatically receive `window.DeskTalk.storage` for persistent app data.

Use it for user-created state such as tasks, rows, settings, bookmarks, filters, drafts, and preferences.

## When To Use It

- Use `DeskTalk.storage` whenever a LiveApp needs data to survive reloads or app restarts.
- Prefer `DeskTalk.storage` over `localStorage` for durable app data.
- Prefer `DeskTalk.storage` over `DeskTalk.exec()` for persistence. `exec()` is for constrained command execution, not normal app data storage.
- Keep source code in the LiveApp files and user data in storage.

## KV Storage

Use KV storage for small JSON values such as settings, view state, and metadata.

```html
<script>
  async function loadSettings() {
    return (
      (await window.DeskTalk.storage.get('settings')) || {
        sort: 'createdAt',
        showDone: true,
      }
    );
  }

  async function saveSettings(nextSettings) {
    await window.DeskTalk.storage.set('settings', nextSettings);
  }
</script>
```

Available methods:

- `await DeskTalk.storage.get(name)`
- `await DeskTalk.storage.set(name, value)`
- `await DeskTalk.storage.delete(name)`
- `await DeskTalk.storage.list()`

Rules:

- `name` should be a short lowercase identifier such as `settings`, `tasks-meta`, or `drafts`.
- Store JSON-serializable values only.
- Use KV for small values that are usually read and written as a whole.

## Collections

Use collections for lists of records such as tasks, todos, items, rows, bookmarks, or events.

```html
<script>
  const tasks = window.DeskTalk.storage.collection('tasks');

  async function addTask(title) {
    const id = crypto.randomUUID();
    await tasks.insert({
      id,
      title,
      status: 'todo',
      createdAt: Date.now(),
    });
  }

  async function completeTask(id) {
    await tasks.update(id, { status: 'done', completedAt: Date.now() });
  }

  async function loadOpenTasks() {
    return tasks.find(
      { status: 'todo' },
      { sort: 'createdAt', order: 'desc', limit: 50, offset: 0 },
    );
  }
</script>
```

Available methods on `DeskTalk.storage.collection(name)`:

- `insert(record)`
- `update(id, fields)`
- `delete(id)`
- `findById(id)`
- `find(filter, options)`
- `findAll()`
- `count(filter)`
- `compact()`

Rules:

- Every inserted record must include a string `id`.
- Keep records as plain JSON objects.
- Prefer top-level fields for values you need to query or sort by.
- Use collection storage for structured data instead of storing large arrays in a single KV entry.

## Recommended Patterns

### Separate settings from records

- Store app settings in KV: `settings`, `tasks-meta`, `filters`
- Store user records in collections: `tasks`, `bookmarks`, `rows`

### Normalize old data on read

Be defensive when loading stored data.

```html
<script>
  async function loadTasks() {
    const records = await window.DeskTalk.storage.collection('tasks').findAll();
    return records.map((task) => ({
      priority: 'medium',
      tags: [],
      ...task,
    }));
  }
</script>
```

This keeps the LiveApp working if older stored records are missing newly added fields.

### Prefer storage over hardcoded demo state

If the app lets the user add, remove, or edit items, wire it to storage from the start.

Bad:

```js
const tasks = [{ id: '1', title: 'Example', status: 'todo' }];
```

Better:

```js
const tasksStore = window.DeskTalk.storage.collection('tasks');
const tasks = await tasksStore.findAll();
```

## Editing Existing LiveApps

When changing a LiveApp that already uses storage:

- Read the current HTML or JS files first.
- If the data shape changes, also read the relevant storage files with the built-in `read` tool.
- Update both the code and the stored data shape.
- Prefer backward-compatible loading logic with defaults.

## Avoid

- Do not use `localStorage` as the primary persistence layer for user data.
- Do not use `DeskTalk.exec()` to write app data files unless the user explicitly asked for a shell-based workflow.
- Do not keep all app data in one huge KV JSON blob when records should be a collection.
