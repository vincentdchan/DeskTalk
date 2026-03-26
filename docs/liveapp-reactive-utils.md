# LiveApp Reactive Micro-Utils

## Problem

As LiveApps grow more complex, the current vanilla JS pattern for state management and DOM updates doesn't scale well:

- **Manual `render()` orchestration** — every mutation requires calling a shared `render()` function that re-reads storage and pushes values into every component.
- **Verbose DOM wiring** — `document.getElementById()` / `querySelector()` / `addEventListener()` boilerplate is repeated in every LiveApp, costing LLM tokens.
- **XSS risk** — `.innerHTML` with template literals is the de facto pattern for rendering lists, which is unsafe.
- **No shared reactivity** — when the same data appears in multiple places (e.g., a count in a stat card AND a table header), the developer must manually keep them in sync.

### Current Pattern (Task Tracker Example)

```html
<script>
  const tasks = window.DeskTalk.storage.collection('tasks');
  const taskList = document.getElementById('task-list');
  const countEl = document.getElementById('count');
  const filterSelect = document.querySelector('dt-select');
  let currentFilter = 'all';

  async function render() {
    const query = currentFilter === 'all' ? {} : { status: currentFilter };
    const records = await tasks.find(query, { sort: 'createdAt', order: 'desc' });
    countEl.textContent = records.length;
    taskList.innerHTML = records
      .map(
        (t) => `
      <dt-card>
        <h3>${t.title}</h3>
        <dt-badge variant="${t.status === 'done' ? 'success' : 'info'}">${t.status}</dt-badge>
        <button onclick="completeTask('${t.id}')">Complete</button>
      </dt-card>
    `,
      )
      .join('');
  }

  async function completeTask(id) {
    await tasks.update(id, { status: 'done' });
    await render();
  }

  document.getElementById('add-task').addEventListener('click', async () => {
    const title = window.prompt('Task title');
    if (!title) return;
    await tasks.insert({ id: crypto.randomUUID(), title, status: 'todo', createdAt: Date.now() });
    await render();
  });

  filterSelect.addEventListener('dt-change', async (e) => {
    currentFilter = e.detail.value;
    await render();
  });

  render();
</script>
```

Pain points: 5 manual DOM lookups, 3 `addEventListener` calls, an explicit `render()` after every mutation, `.innerHTML` with string templates (XSS-prone).

## Alternatives Considered

### Alpine.js

Alpine.js (15 KB min+gz) was evaluated in detail. It's a runtime-only, no-compilation, declarative HTML framework that uses `x-data`, `x-for`, `x-text`, `x-bind`, `x-on`, etc.

**Pros:**

- Eliminates manual `render()` functions — mutate data, UI auto-updates.
- Declarative event binding (`@click="count++"`).
- Auto-escaping (no `.innerHTML` XSS risk).
- Global stores via `Alpine.store()` + `$store`.
- Well-known — LLMs already have training data for Alpine.

**Cons:**

- **Dual API problem.** Alpine's `x-bind` sets HTML _attributes_ (strings). But DeskTalk components like `dt-list-view`, `dt-table-view`, and `dt-chart` accept data via _JS properties_ (objects/arrays). `x-bind:items="myArray"` would call `el.setAttribute('items', '[object Object]')`, not `el.items = myArray`. The workaround (`x-effect="$refs.list.items = filtered"`) is clunky and creates exactly the kind of "two ways to do the same thing" confusion that caused us to remove `<dt-dataset>`.
- **8+ directives to learn.** The LLM must understand `x-data`, `x-init`, `x-for`, `x-text`, `x-bind`, `x-on`, `x-show`, `x-model`, `$store`, `$refs`, `$watch` — a significant API surface that increases the chance of hallucinated or incorrect usage.
- **`x-for` can't virtualize.** For lists of 1000+ items, `dt-list-view` with virtual scrolling is still needed. Alpine's `x-for` creates real DOM nodes for every item.
- **Token cost is roughly neutral.** Alpine saves script tokens (~70 fewer) but adds HTML attribute tokens (~70 more from inline directives). The total is approximately the same.
- **15 KB per iframe.** Not large, but unnecessary given we can build exactly what we need in ~2 KB.

**Verdict:** Alpine is a reasonable but imperfect fit. The dual-API risk with DeskTalk web components is the dealbreaker — the same class of problem we just removed with `<dt-dataset>`.

### React / Vue / Preact

All require either a compilation step (JSX, SFC) or verbose `createElement()` calls. The LiveApp streaming pipeline (`document.write()` progressive rendering) is fundamentally incompatible with virtual DOM reconciliation. These frameworks need a complete component tree to render; streaming builds the DOM incrementally from an HTML string. Not viable.

### jQuery / Cash / Zepto

Solves selector verbosity but doesn't address reactivity. The chaining API (`.find().addClass().on()`) is also verbose in tokens. Doesn't justify the dependency.

### Lit

Requires class-based element definitions with `static properties` and `render()` methods. The LLM would need to define custom elements for each UI section — more boilerplate, not less. Overlaps with existing `dt-*` components.

## Decision: Custom Reactive Micro-Utils

Build a small set of purpose-built helpers (~150 lines) injected alongside the existing bridge. Four functions total.

### Design Principles

1. **Works uniformly with both HTML attributes AND JS properties** — no dual-API confusion. `effect()` is just JS code, so `el.items = data` and `el.textContent = str` work identically.
2. **Fewer tokens than vanilla** — every helper saves more tokens than it costs to invoke.
3. **Zero compilation** — pure runtime JS, shipped alongside the bridge.
4. **Familiar reactivity model** — Proxy-based dependency tracking, same as Vue/Solid internals. LLMs have extensive training data on this pattern.
5. **4 functions, not 8+ directives** — minimal API surface for the AI to learn.

## API Reference

### `DeskTalk.store(initialState)` → reactive proxy

Creates a reactive state container. Reads inside an `effect()` are tracked; writes trigger re-execution of dependent effects.

```js
const state = DeskTalk.store({
  tasks: [],
  filter: 'all',
  get filtered() {
    return this.filter === 'all' ? this.tasks : this.tasks.filter((t) => t.status === this.filter);
  },
});

// Mutations trigger all dependent effects automatically
state.tasks = [...state.tasks, newTask];
state.filter = 'done';
```

Supports:

- Primitive values, arrays, nested objects
- Computed getters (`get prop()`)
- Array methods that mutate (`push`, `splice`, etc.) trigger reactivity via array replacement pattern (`state.items = [...state.items, newItem]`)

Implementation: ~80 lines. `Proxy` wrapper with a `WeakMap<target, Map<key, Set<Effect>>>` dependency graph.

### `DeskTalk.effect(fn)` → disposer function

Runs `fn` immediately, tracking which reactive properties it reads. Re-runs `fn` whenever any tracked property changes. Returns a function to stop the effect.

```js
const stop = DeskTalk.effect(() => {
  // These reads are tracked:
  document.getElementById('count').textContent = state.filtered.length + ' tasks';
  document.getElementById('list').items = state.filtered; // JS property — works
  document.getElementById('chart').data = {
    // JS property — works
    datasets: [{ label: 'Revenue', data: state.chartData }],
  };
});

// Later, to clean up:
stop();
```

This is the core building block. Because it's plain JS (not HTML directives), it handles setting HTML attributes, JS properties, `textContent`, `innerHTML`, class lists, styles — anything — with zero special cases.

Implementation: ~30 lines. Global `activeEffect` stack; `Proxy` `get` traps register the active effect; `Proxy` `set` traps notify dependents via microtask batching.

### `DeskTalk.$(selector)` / `DeskTalk.$$(selector)`

Shorthand for `document.querySelector` / `document.querySelectorAll`. Returns element(s) or `null`.

```js
const { $, $$ } = DeskTalk;

$('#my-card'); // single element
$$('.item'); // NodeList
$('dt-table-view').rows = data;
```

Implementation: ~4 lines.

### `DeskTalk.on(target, event, handler)`

Event listener shorthand. `target` can be a CSS selector string or an Element.

```js
const { on } = DeskTalk;

on('#add-btn', 'click', async () => { ... });
on('dt-select', 'dt-change', (e) => { state.filter = e.detail.value; });
on('#table', 'dt-sort', (e) => {
  const { field, direction } = e.detail;
  state.tasks = [...state.tasks].sort(comparator(field, direction));
});
```

Implementation: ~10 lines.

## Full Example: Task Tracker with Reactive Utils

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Task Tracker</title>
    <style>
      body {
        background: var(--dt-bg);
      }
    </style>
  </head>
  <body>
    <h1>Task Tracker</h1>
    <dt-stack direction="row" gap="8" align="center">
      <dt-button id="add-btn">Add Task</dt-button>
      <span id="count"></span>
      <dt-select id="filter">
        <option value="all">All</option>
        <option value="todo">Todo</option>
        <option value="done">Done</option>
      </dt-select>
    </dt-stack>

    <dt-list-view id="list" style="margin-top:16px; height:400px">
      <template>
        <dt-card>
          <dt-stack direction="row" align="center" gap="8">
            <strong data-field="title"></strong>
            <dt-badge data-field="status" data-field-variant="variant"></dt-badge>
          </dt-stack>
        </dt-card>
      </template>
    </dt-list-view>

    <script>
      const { store, effect, on, $ } = DeskTalk;
      const db = DeskTalk.storage.collection('tasks');

      const s = store({
        tasks: [],
        filter: 'all',
        get filtered() {
          return this.filter === 'all'
            ? this.tasks
            : this.tasks.filter((t) => t.status === this.filter);
        },
      });

      // UI auto-updates when s.tasks or s.filter changes
      effect(() => {
        $('#count').textContent = s.filtered.length + ' tasks';
        $('#list').items = s.filtered;
      });

      on('#add-btn', 'click', async () => {
        const title = window.prompt('Task title');
        if (!title) return;
        const task = { id: crypto.randomUUID(), title, status: 'todo', createdAt: Date.now() };
        await db.insert(task);
        s.tasks = [...s.tasks, task];
      });

      on('#filter', 'dt-change', (e) => {
        s.filter = e.detail.value;
      });

      // Initial load
      (async () => {
        s.tasks = await db.findAll();
      })();
    </script>
  </body>
</html>
```

**~28% fewer tokens** than the vanilla version, with automatic reactivity, no `.innerHTML`, and no manual `render()` calls.

## Implementation Plan

| Step | Description                                                                           | Location                                       | Est. Lines |
| ---- | ------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------- |
| 1    | Reactive `store()` with Proxy + dependency tracking                                   | `packages/sdk/src/utils/reactive.ts`           | ~80        |
| 2    | `effect()` — auto-tracking side-effect runner with microtask batching                 | Same file                                      | ~30        |
| 3    | `$()`, `$$()`, `on()` shortcuts                                                       | Same file                                      | ~20        |
| 4    | Export and wire into bridge script as `DeskTalk.store`, `.effect`, `.$`, `.$$`, `.on` | `packages/sdk/src/utils/html-bridge-script.ts` | ~15        |
| 5    | Unit tests for reactivity, effects, batching, disposal, nested objects                | `packages/sdk/src/utils/reactive.test.ts`      | ~150       |
| 6    | Update AI manual: new `html-reactive.md` page documenting the API with examples       | `packages/core/src/services/ai/manual-pages/`  | Docs       |
| 7    | Update `html-examples.md` with patterns using the new utils                           | Same                                           | Docs       |
| 8    | Verify: `pnpm lint && pnpm build && pnpm unit:test`                                   | —                                              | —          |

**Total: ~150 lines of implementation, ~150 lines of tests, documentation updates.**

## Why Not Later — When to Build This

Build this when any of these become true:

- The AI frequently generates broken `render()` orchestration (missed re-renders, stale UI)
- LiveApps start needing multi-view / sub-page patterns with shared state
- Token budget becomes a real constraint and the ~28% savings matter
- Users report that AI-generated apps have inconsistent UI state after interactions

Until then, the current vanilla pattern works adequately for single-view dashboards and simple CRUD apps.
