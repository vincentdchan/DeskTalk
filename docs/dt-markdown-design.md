# `<dt-markdown>` and `<dt-markdown-editor>` Design Document

## Overview

Two web components for markdown in LiveApp iframes:

- **`<dt-markdown>`** — Read-only renderer with static and streaming modes. Powered by `marked`.
- **`<dt-markdown-editor>`** — Full WYSIWYG editor. Powered by Milkdown `Crepe` (ProseMirror).

Both lazy-load their engines via separate IIFE bundles served from `/api/ui/`, following the same pattern as `<dt-chart>`.

---

## Architecture: Lazy Loading

Each component has a thin shell in the main UMD bundle and a heavy engine in a separate bundle:

| Bundle                 | Route                 | Contents                           | Size (est.) |
| ---------------------- | --------------------- | ---------------------------------- | ----------- |
| `dist/marked.umd.js`   | `/api/ui/marked.js`   | `marked` + custom renderer         | ~15 KB      |
| `dist/milkdown.umd.js` | `/api/ui/milkdown.js` | Milkdown Crepe + ProseMirror + CSS | ~400 KB     |

### Loading Flow

```
<dt-markdown> connectedCallback
  → loadMarked()
    → check window.__DtMarked
    → if missing: inject <script src="/api/ui/marked.js">, await onload
    → resolve with configured marked instance
  → render markdown to HTML in shadow DOM

<dt-markdown-editor> connectedCallback
  → loadMilkdown()
    → check window.__DtMilkdown
    → if missing: inject <script src="/api/ui/milkdown.js">, await onload
    → resolve with { Crepe, replaceAll } object
  → new Crepe({ root: shadowRoot container, ... })
  → await crepe.create()
```

---

## `<dt-markdown>` — Markdown Renderer

### Tag

```html
<!-- Static: content between tags -->
<dt-markdown> # Hello World This is **bold** and *italic*. </dt-markdown>

<!-- Streaming: content via JS property -->
<dt-markdown id="md" streaming></dt-markdown>
<script>
  const md = document.getElementById('md');
  md.content = '# Partial...';
  md.content = '# Partial content\nDone.';
  md.streaming = false; // remove caret
</script>
```

### Attributes

| Attribute     | Values             | Default | Description                                                          |
| ------------- | ------------------ | ------- | -------------------------------------------------------------------- |
| `streaming`   | boolean (presence) | absent  | Streaming mode — shows blinking caret, tolerates incomplete markdown |
| `unsafe-html` | boolean (presence) | absent  | Allows raw HTML in markdown source (sanitized by default)            |

### JS Properties

| Property     | Type      | Description                                                                          |
| ------------ | --------- | ------------------------------------------------------------------------------------ |
| `.content`   | `string`  | Markdown string to render. Setter triggers re-render. Overrides inline text content. |
| `.streaming` | `boolean` | Reflects `streaming` attribute. Set `false` to finalize and remove caret.            |

### Events

| Event           | Detail             | Description                                                             |
| --------------- | ------------------ | ----------------------------------------------------------------------- |
| `dt-link-click` | `{ href: string }` | Fired when a rendered link is clicked. Default navigation is prevented. |

### Content Sources

Two ways to provide content:

1. **Inline text** — Markdown between the tags. Read from `this.textContent` on connect and via `MutationObserver` (characterData + childList). Ideal for static AI-generated pages.
2. **`.content` property** — Set via JS. Takes precedence over inline text. Required for streaming mode.

### Streaming Behavior

- When `streaming` is present, a blinking cursor (`▌`) is appended after the rendered content.
- Re-renders are debounced via `requestAnimationFrame` to avoid thrashing during rapid `.content` updates.
- Unterminated markdown blocks (unclosed fences, open lists) are gracefully closed before rendering.
- When `streaming` is removed or set to `false`, a final render occurs without the caret.

### Auto-Theming

The shadow DOM stylesheet maps rendered HTML to `--dt-*` tokens:

| Element          | Styling                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| Headings         | `--dt-text`, uppercase tracking for h1                                 |
| Code (inline)    | `--dt-bg-secondary` background, `--dt-font-mono`                       |
| Code blocks      | `--dt-bg-secondary` background, `--dt-border` border, `--dt-font-mono` |
| Blockquotes      | `--dt-accent` left border, `--dt-text-muted` text                      |
| Links            | `--dt-accent` color                                                    |
| Tables           | `--dt-border` cell borders, `--dt-bg-secondary` header background      |
| Horizontal rules | `--dt-border` color                                                    |

### Rendering Engine

`marked` v17 (already in dep tree via streamdown):

- Synchronous by default — no async overhead
- GFM enabled (tables, strikethrough, task lists)
- Custom `Renderer` subclass adds scoped classes and theme integration
- Links intercepted: `onclick` dispatches `dt-link-click`, calls `preventDefault()`
- Images constrained: `max-width: 100%`

---

## `<dt-markdown-editor>` — WYSIWYG Editor

### Tag

```html
<dt-markdown-editor placeholder="Start typing..." style="height: 400px"></dt-markdown-editor>
<script>
  const editor = document.querySelector('dt-markdown-editor');
  editor.value = '# Hello\nEdit me.';
  editor.addEventListener('dt-change', (e) => {
    console.log('Markdown:', e.detail.value);
  });
</script>
```

### Attributes

| Attribute     | Values             | Default | Description                      |
| ------------- | ------------------ | ------- | -------------------------------- |
| `placeholder` | string             | `''`    | Placeholder text in empty editor |
| `readonly`    | boolean (presence) | absent  | Read-only mode                   |

### JS Properties

| Property    | Type      | Description                                                                                |
| ----------- | --------- | ------------------------------------------------------------------------------------------ |
| `.value`    | `string`  | Get/set markdown content. Getter calls `crepe.getMarkdown()`, setter calls `replaceAll()`. |
| `.readonly` | `boolean` | Reflects attribute. Calls `crepe.setReadonly()`.                                           |

### Events

| Event       | Detail              | Description                        |
| ----------- | ------------------- | ---------------------------------- |
| `dt-change` | `{ value: string }` | Content changed (debounced ~300ms) |
| `dt-focus`  | `{}`                | Editor gained focus                |
| `dt-blur`   | `{}`                | Editor lost focus                  |

### Sizing

**Requires explicit height** via inline style or CSS rule. The editor fills its container.

### Milkdown Features

| Feature     | Enabled | Reason                                 |
| ----------- | ------- | -------------------------------------- |
| ListItem    | yes     | Bullet, ordered, task lists            |
| LinkTooltip | yes     | Link editing/preview popups            |
| Cursor      | yes     | Drop cursor + gap cursor               |
| BlockEdit   | yes     | Slash commands, drag handles           |
| Toolbar     | yes     | Floating format toolbar on selection   |
| Placeholder | yes     | Configured via `placeholder` attribute |
| Table       | yes     | GFM table editing                      |
| CodeMirror  | **no**  | Too heavy, not needed in LiveApps      |
| ImageBlock  | **no**  | No image upload in sandboxed iframes   |
| Latex       | **no**  | Not needed                             |

### Theming

Milkdown's CSS is bundled into the lazy bundle and injected into shadow DOM. A custom theme overrides Milkdown CSS variables to map to `--dt-*` tokens:

- `--dt-bg` → editor background
- `--dt-text` → editor text
- `--dt-accent` → links, selections, toolbar highlights
- `--dt-border` → table borders, blockquote borders
- `--dt-bg-secondary` → code block backgrounds, toolbar background
- `--dt-font-mono` → code font

The editor inherits the DeskTalk sci-fi look without consumer CSS.

### Vanilla Crepe Usage (No React)

Milkdown's `Crepe` class is framework-agnostic. The component uses it directly:

```ts
const crepe = new Crepe({
  root: this._editorContainer, // div inside shadow DOM
  defaultValue: this._pendingValue ?? '',
  features: {
    [Crepe.Feature.CodeMirror]: false,
    [Crepe.Feature.ImageBlock]: false,
    [Crepe.Feature.Latex]: false,
  },
  featureConfigs: {
    [Crepe.Feature.Placeholder]: {
      text: this.getAttribute('placeholder') || '',
      mode: 'doc',
    },
  },
});

crepe.on((listener) => {
  listener.markdownUpdated((_ctx, markdown) => {
    // debounced dt-change event
  });
  listener.focus(() => {
    /* dt-focus event */
  });
  listener.blur(() => {
    /* dt-blur event */
  });
});

await crepe.create();
```

---

## File Plan

| File                                            | Action | Purpose                                                                 |
| ----------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| **Markdown renderer**                           |        |                                                                         |
| `packages/ui/src/dt-markdown.ts`                | new    | Component class                                                         |
| `packages/ui/src/styles/markdown.css`           | new    | Shadow DOM styles for rendered markdown                                 |
| `packages/ui/src/lib/marked-loader.ts`          | new    | Singleton lazy loader                                                   |
| `packages/ui/src/marked-entry.ts`               | new    | Entry point: import marked, configure renderer, set `window.__DtMarked` |
| **Markdown editor**                             |        |                                                                         |
| `packages/ui/src/dt-markdown-editor.ts`         | new    | Component class                                                         |
| `packages/ui/src/styles/markdown-editor.css`    | new    | Shadow DOM styles + Milkdown theme overrides                            |
| `packages/ui/src/lib/milkdown-loader.ts`        | new    | Singleton lazy loader                                                   |
| `packages/ui/src/milkdown-entry.ts`             | new    | Entry point: import Crepe + CSS, set `window.__DtMilkdown`              |
| **Build & serve**                               |        |                                                                         |
| `packages/ui/build.mjs`                         | modify | Add 2 IIFE builds (marked, milkdown)                                    |
| `packages/ui/package.json`                      | modify | Add `marked`, `@milkdown/crepe`, `@milkdown/kit` as dependencies        |
| `packages/core/src/server/index.ts`             | modify | Add `/api/ui/marked.js` and `/api/ui/milkdown.js` routes                |
| **Registration & types**                        |        |                                                                         |
| `packages/ui/src/index.ts`                      | modify | Register both elements                                                  |
| `packages/ui/src/ui-elements.ts`                | modify | JSX types                                                               |
| `packages/ui/types.d.ts`                        | modify | Type declarations                                                       |
| **AI manual**                                   |        |                                                                         |
| `packages/core/.../html-components.md`          | modify | Document both components                                                |
| `packages/core/.../html-examples.md`            | modify | Add example LiveApps                                                    |
| **Stories**                                     |        |                                                                         |
| `packages/ui/src/dt-markdown.stories.ts`        | new    | Storybook stories                                                       |
| `packages/ui/src/dt-markdown-editor.stories.ts` | new    | Storybook stories                                                       |

---

## Build Changes

### `packages/ui/build.mjs`

Add two more output configs:

```js
// Marked bundle (markdown renderer engine)
{
  entryPoints: [resolve(srcDir, 'marked-entry.ts')],
  outfile: join(distDir, 'marked.umd.js'),
  format: 'iife',
  globalName: '__DtMarkedBundle',
}

// Milkdown bundle (WYSIWYG editor engine)
{
  entryPoints: [resolve(srcDir, 'milkdown-entry.ts')],
  outfile: join(distDir, 'milkdown.umd.js'),
  format: 'iife',
  globalName: '__DtMilkdownBundle',
}
```

### `packages/core/src/server/index.ts`

Add routes next to existing `/api/ui/desktalk-ui.js`:

```ts
// Serve marked bundle (lazy-loaded by <dt-markdown>)
app.get('/api/ui/marked.js', async (_req, reply) => {
  /* same pattern */
});

// Serve milkdown bundle (lazy-loaded by <dt-markdown-editor>)
app.get('/api/ui/milkdown.js', async (_req, reply) => {
  /* same pattern */
});
```

---

## Loader Implementations

### `lib/marked-loader.ts`

```ts
let promise: Promise<typeof import('marked')> | null = null;

export function loadMarked(): Promise<typeof import('marked')> {
  if (promise) return promise;
  const existing = (window as any).__DtMarked;
  if (existing) {
    promise = Promise.resolve(existing);
    return promise;
  }
  promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/api/ui/marked.js';
    script.onload = () => resolve((window as any).__DtMarked);
    script.onerror = () => reject(new Error('Failed to load marked bundle'));
    document.head.appendChild(script);
  });
  return promise;
}
```

### `lib/milkdown-loader.ts`

```ts
interface MilkdownExports {
  Crepe: typeof import('@milkdown/crepe').Crepe;
  replaceAll: typeof import('@milkdown/kit/utils').replaceAll;
}

let promise: Promise<MilkdownExports> | null = null;

export function loadMilkdown(): Promise<MilkdownExports> {
  if (promise) return promise;
  const existing = (window as any).__DtMilkdown;
  if (existing) {
    promise = Promise.resolve(existing);
    return promise;
  }
  promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/api/ui/milkdown.js';
    script.onload = () => resolve((window as any).__DtMilkdown);
    script.onerror = () => reject(new Error('Failed to load Milkdown bundle'));
    document.head.appendChild(script);
  });
  return promise;
}
```

---

## Entry Point Implementations

### `marked-entry.ts`

```ts
import { Marked } from 'marked';

const renderer = {
  link({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}"${titleAttr} class="dt-md-link">${text}</a>`;
  },
  code({ text, lang }) {
    const langClass = lang ? ` class="language-${lang}"` : '';
    return `<pre class="dt-md-pre"><code${langClass}>${text}</code></pre>\n`;
  },
  table(token) {
    return `<table class="dt-md-table">${this.parser ? ... : ...}</table>`;
  },
  blockquote({ tokens }) {
    const body = this.parser.parse(tokens);
    return `<blockquote class="dt-md-blockquote">${body}</blockquote>\n`;
  },
  image({ href, title, text }) {
    const titleAttr = title ? ` title="${title}"` : '';
    return `<img src="${href}" alt="${text}"${titleAttr} class="dt-md-img">`;
  },
};

const instance = new Marked({ gfm: true, renderer });

(window as any).__DtMarked = instance;
```

### `milkdown-entry.ts`

```ts
import { Crepe } from '@milkdown/crepe';
import { replaceAll } from '@milkdown/kit/utils';

// Import all CSS as side effects (esbuild inlines them)
import '@milkdown/crepe/theme/common/prosemirror.css';
import '@milkdown/crepe/theme/common/reset.css';
import '@milkdown/crepe/theme/common/block-edit.css';
import '@milkdown/crepe/theme/common/cursor.css';
import '@milkdown/crepe/theme/common/link-tooltip.css';
import '@milkdown/crepe/theme/common/list-item.css';
import '@milkdown/crepe/theme/common/placeholder.css';
import '@milkdown/crepe/theme/common/toolbar.css';
import '@milkdown/crepe/theme/common/table.css';

(window as any).__DtMilkdown = { Crepe, replaceAll };
```

> **Note:** Milkdown CSS imports are side-effect only at the entry-point level. The esbuild IIFE build with the `raw-css-loader` plugin will need adjustment — either the CSS is extracted and injected separately, or the milkdown entry bundles CSS into JS strings that the component injects into shadow DOM. The exact approach should be determined during implementation.

---

## AI Manual Entry (`html-components.md`)

### `<dt-markdown>`

```markdown
### `<dt-markdown>`

Renders markdown to styled HTML. Supports static content and streaming mode.

**The element auto-sizes to its content.** Set a fixed height + `overflow: auto`
for scrollable content.

- `streaming` — when present, shows a blinking caret and tolerates incomplete markdown
- `unsafe-html` — when present, allows raw HTML in markdown source
- `.content` JS property — markdown string; overrides inline text content
- `.streaming` JS property — reflects attribute; set `false` to finalize
- `dt-link-click` event — `{ href }` — fired when a link is clicked

**When to use:** Displaying formatted text, documentation, READMEs, AI-generated
prose, or any rich text content. Prefer this over hand-writing HTML paragraphs.

Example (static):

\`\`\`html
<dt-markdown>

# System Status

All **3 nodes** are operational.

| Node | Status | Uptime |
| ---- | ------ | ------ |
| A    | Online | 99.9%  |
| B    | Online | 99.7%  |
| C    | Online | 98.5%  |

</dt-markdown>
\`\`\`

Example (streaming):

\`\`\`html
<dt-markdown id="output" streaming></dt-markdown>

<script>
  const md = document.getElementById('output');
  // Simulate streaming updates
  let text = '';
  const chunks = ['# Report\n', 'Processing ', '**data**...', '\n\nDone.'];
  chunks.forEach((chunk, i) => {
    setTimeout(() => {
      text += chunk;
      md.content = text;
      if (i === chunks.length - 1) md.streaming = false;
    }, i * 500);
  });
</script>

\`\`\`
```

### `<dt-markdown-editor>`

```markdown
### `<dt-markdown-editor>`

A WYSIWYG markdown editor with toolbar, slash commands, and drag-and-drop blocks.
Content is stored as markdown.

**The element requires an explicit height** via inline style or a CSS rule.

- `placeholder` — placeholder text for empty editor
- `readonly` — when present, makes the editor read-only
- `.value` JS property — get/set the markdown content
- `.readonly` JS property — reflects attribute
- `dt-change` event — `{ value: string }` — fired on content change (debounced)
- `dt-focus` event — editor gained focus
- `dt-blur` event — editor lost focus

**When to use:** Any time the user needs to write or edit formatted text — notes,
documents, descriptions, comments. Prefer this over a plain `<textarea>` when
rich editing is needed.

Example:

\`\`\`html
<dt-markdown-editor id="editor" placeholder="Write something..."
                    style="height: 400px"></dt-markdown-editor>
<dt-button id="save">Save</dt-button>

<script>
  const editor = document.getElementById('editor');
  editor.value = '# My Document\nStart editing here.';
  document.getElementById('save').addEventListener('click', () => {
    const markdown = editor.value;
    window.DeskTalk.storage.set('doc', markdown);
  });
</script>

\`\`\`
```

---

## AI Manual Example (`html-examples.md`)

### Markdown Viewer

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Markdown Viewer</title>
    <style>
      body {
        background: var(--dt-bg);
      }
      #viewer {
        max-height: 500px;
        overflow: auto;
      }
    </style>
  </head>
  <body>
    <h1>Markdown Viewer</h1>
    <dt-card heading="README.md">
      <dt-markdown id="viewer">
        # Project Alpha ## Overview Project Alpha is a **distributed system** for real-time data
        processing. ## Features - Stream processing with *sub-millisecond* latency - Automatic
        failover and recovery - Built-in monitoring dashboard ## Quick Start \`\`\`bash npm install
        project-alpha npx alpha init npx alpha start \`\`\` ## Status | Component | Version | Status
        | |-----------|---------|--------| | Core | 2.1.0 | Stable | | CLI | 1.8.3 | Stable | |
        Dashboard | 0.9.1 | Beta | > **Note:** Dashboard is in beta. Report issues on GitHub.
      </dt-markdown>
    </dt-card>
  </body>
</html>
```

### Note Editor

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Note Editor</title>
    <style>
      body {
        background: var(--dt-bg);
      }
      .editor-container {
        height: 450px;
      }
    </style>
  </head>
  <body>
    <h1>Note Editor</h1>
    <dt-stack gap="md">
      <dt-stack direction="horizontal" gap="sm">
        <dt-button id="save" variant="primary">Save</dt-button>
        <dt-badge id="status" variant="muted">Unsaved</dt-badge>
      </dt-stack>
      <dt-card>
        <dt-markdown-editor
          id="editor"
          placeholder="Start writing your note..."
          class="editor-container"
        ></dt-markdown-editor>
      </dt-card>
    </dt-stack>

    <script>
      const editor = document.getElementById('editor');
      const status = document.getElementById('status');
      const saveBtn = document.getElementById('save');

      // Load saved content
      const saved = window.DeskTalk.storage.get('note');
      if (saved) editor.value = saved;

      // Track changes
      editor.addEventListener('dt-change', () => {
        status.textContent = 'Unsaved';
        status.setAttribute('variant', 'warning');
      });

      // Save
      saveBtn.addEventListener('click', () => {
        window.DeskTalk.storage.set('note', editor.value);
        status.textContent = 'Saved';
        status.setAttribute('variant', 'success');
      });
    </script>
  </body>
</html>
```

---

## Design Decisions

1. **Separate bundles per engine** — `marked` (~15KB) and Milkdown (~400KB) are independent lazy bundles. A LiveApp using only `<dt-markdown>` never loads Milkdown.

2. **`marked` over `remark`/`rehype`** — `marked` is synchronous, produces HTML strings (perfect for `innerHTML` in shadow DOM), and is already in the dep tree. The remark/rehype pipeline is async and produces React JSX (via streamdown), which doesn't work in vanilla web components.

3. **Inline text content for `<dt-markdown>`** — Allows the AI to generate markdown directly between tags without a `<script>` block. Simpler for static content. `.content` property is the escape hatch for dynamic/streaming use.

4. **Milkdown Crepe (not React binding)** — `Crepe` is framework-agnostic. We use it directly with a DOM root, bypassing `@milkdown/react`. This means the web component has zero React dependency.

5. **Disabled features** — CodeMirror, ImageBlock, and Latex are disabled in the editor. They add significant weight and aren't needed for LiveApp note-taking. Can be reconsidered later.

6. **Debounced `dt-change`** — Milkdown fires `markdownUpdated` on every keystroke. We debounce to ~300ms before dispatching `dt-change` to avoid flooding consumer event handlers.

7. **Link interception in `<dt-markdown>`** — Links fire `dt-link-click` instead of navigating. LiveApps run in sandboxed iframes; navigation behavior should be consumer-controlled.

8. **Shadow DOM CSS for Milkdown** — Milkdown's CSS normally operates on the document. Inside shadow DOM, we need to inject it as a `<style>` element. The milkdown entry bundles CSS as strings (via the existing `raw-css-loader` pattern or a CSS extraction step).
