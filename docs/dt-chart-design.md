# `<dt-chart>` Design Document

## Overview

A web component that wraps Chart.js to provide declarative, auto-themed charting inside LiveApp iframes. Chart.js is lazy-loaded via a separate bundle — zero cost for LiveApps that don't use charts.

## Architecture

### Lazy Loading via Separate Bundle

Chart.js is **not** included in the main `@desktalk/ui` UMD bundle. Instead:

1. A separate entry point (`src/chart-entry.ts`) imports Chart.js and exposes it as `window.__DtChart`.
2. esbuild produces a second IIFE bundle: `dist/chart.umd.js`.
3. The core server serves it at `GET /api/ui/chart.js` (same pattern as `desktalk-ui.js`).
4. A singleton loader (`src/lib/chart-loader.ts`) injects `<script src="/api/ui/chart.js">` into the iframe document on first use and resolves a Promise with the Chart constructor.

**Flow:**

```
<dt-chart> connectedCallback
  → loadChartJs()
    → check window.__DtChart
    → if missing: inject <script src="/api/ui/chart.js">, await onload
    → resolve with Chart constructor
  → new Chart(canvas, config)
```

### Why Not Code Splitting

The current esbuild config uses `outfile` (single-file output) for the IIFE build. IIFE cannot do code splitting. Rather than overhauling the build system, we add a second entry point — simpler, no architectural changes needed.

## Component API

### Primary: Declarative HTML (streaming-friendly)

```html
<dt-chart type="bar" legend="top" labels="Jan,Feb,Mar" style="height: 300px">
  <dt-dataset label="Revenue" values="12,19,3"></dt-dataset>
  <dt-dataset label="Costs" values="7,11,5"></dt-dataset>
</dt-chart>
```

### Fallback: JS Property (for complex data shapes)

```html
<dt-chart id="scatter" type="scatter" style="height: 300px"></dt-chart>
<script>
  document.getElementById('scatter').data = {
    datasets: [
      {
        label: 'Points',
        data: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      },
    ],
  };
</script>
```

The AI manual instructs: **use `<dt-dataset>` child elements by default.** Only use `.data` for scatter, bubble, or dynamically computed data.

### Attributes on `<dt-chart>`

| Attribute | Values                                                                 | Default | Description                                               |
| --------- | ---------------------------------------------------------------------- | ------- | --------------------------------------------------------- |
| `type`    | `bar`, `line`, `area`, `pie`, `doughnut`, `radar`, `scatter`, `bubble` | `bar`   | Chart type. `area` is sugar for `line` with `fill: true`. |
| `legend`  | `top`, `bottom`, `left`, `right`, `none`                               | `none`  | Legend position. `none` hides it.                         |
| `stacked` | boolean (presence)                                                     | absent  | Stacks bar/line datasets.                                 |
| `labels`  | comma-separated string                                                 | `''`    | X-axis / category labels (e.g. `labels="Jan,Feb,Mar"`).   |

### Attributes on `<dt-dataset>` (child element)

| Attribute | Type                    | Default | Description                                                    |
| --------- | ----------------------- | ------- | -------------------------------------------------------------- |
| `label`   | string                  | `''`    | Legend label for this dataset.                                 |
| `values`  | comma-separated numbers | `''`    | Data values (e.g. `values="12,19,3,5"`).                       |
| `color`   | CSS color string        | auto    | Optional override. Omit to auto-assign from the theme palette. |

`<dt-dataset>` is a hidden helper element (same pattern as `<dt-column>` in `<dt-table-view>`).

### JS Properties

| Property   | Type                                         | Description                                                                          |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `.data`    | `{ labels?: string[], datasets: Dataset[] }` | JS escape hatch for complex data (scatter, bubble). Overrides child elements.        |
| `.options` | `object`                                     | Escape hatch: raw Chart.js options merged under auto-themed defaults. Rarely needed. |

### Dataset Shape (for `.data` JS property)

```ts
interface DtChartDataset {
  label: string; // legend label
  data: number[]; // values
  color?: string; // optional override; auto-assigned from theme palette if omitted
}

interface DtChartData {
  labels?: string[];
  datasets: DtChartDataset[];
}
```

### Events

| Event            | Detail                                  | Description                          |
| ---------------- | --------------------------------------- | ------------------------------------ |
| `dt-chart-click` | `{ label, datasetIndex, index, value }` | Fired when user clicks a data point. |

### Sizing

The component **requires an explicit height** via inline style or CSS rule (same pattern as `dt-list-view`). The internal `<canvas>` fills the shadow DOM container. Chart.js `responsive: true` handles resize.

## Streaming Support

### Why Declarative HTML Enables Streaming

LiveApp HTML is streamed into the iframe by `html-stream-coordinator.ts`. The browser creates DOM nodes **incrementally** as chunks arrive. Declarative `<dt-dataset>` child elements leverage this — the chart updates live as each dataset streams in. A `<script>` block, by contrast, only executes after the browser receives the closing `</script>` tag.

### Mechanism: MutationObserver + connectedCallback

Three browser primitives make this work:

1. **Incremental HTML parsing** — the browser creates elements as they stream in, doesn't wait for the full document.
2. **Custom Element lifecycle** — `connectedCallback` fires the instant an element is attached to the DOM, even mid-stream.
3. **MutationObserver** — fires after each DOM mutation, so the parent knows immediately when a new child arrives.

This is the same proven pattern used by `<dt-table-view>` with `<dt-column>` children.

### Implementation Sketch

**`<dt-dataset>` (child element):**

```ts
class DtDataset extends HTMLElement {
  static get observedAttributes() {
    return ['label', 'values', 'color'];
  }

  connectedCallback() {
    this.hidden = true; // invisible, same pattern as <dt-column>
  }

  attributeChangedCallback() {
    // Notify parent that data changed
    this.dispatchEvent(new Event('dt-dataset-change', { bubbles: true }));
  }
}
```

**`<dt-chart>` (parent element, relevant parts):**

```ts
connectedCallback() {
  // 1. Start loading Chart.js (async, singleton)
  this.#chartReady = loadChartJs().then(Ctor => this.#createChart(Ctor));

  // 2. Watch for child <dt-dataset> additions/removals
  this.#observer = new MutationObserver(() => this.#syncFromChildren());
  this.#observer.observe(this, { childList: true, subtree: true });

  // 3. Listen for attribute changes on existing children
  this.addEventListener('dt-dataset-change', () => this.#syncFromChildren());
}

#syncFromChildren() {
  const datasets = [...this.querySelectorAll('dt-dataset')];
  const labels = this.getAttribute('labels')?.split(',') ?? [];

  const data = {
    labels,
    datasets: datasets.map(ds => ({
      label: ds.getAttribute('label') ?? '',
      data: ds.getAttribute('values')?.split(',').map(Number) ?? [],
      color: ds.getAttribute('color') ?? undefined,
    })),
  };

  if (this.#chart) {
    this.#chart.data = this.#toChartJsData(data);
    this.#chart.update();
  } else {
    this.#pendingData = data;
  }
}
```

### Streaming Timeline (what the user sees)

```
t=0ms    AI starts streaming HTML

t=50ms   <dt-chart type="bar" labels="Jan,Feb,Mar"> arrives
           → connectedCallback fires
           → starts loading Chart.js (async)
           → empty canvas / placeholder

t=80ms   Chart.js bundle loaded (cached from prior use)
           → canvas created, no data yet → empty chart frame

t=120ms  <dt-dataset label="Revenue" values="12,19,3"> arrives
           → MutationObserver fires → #syncFromChildren()
           → chart.update() → first bars animate in ✓

t=200ms  <dt-dataset label="Costs" values="7,11,5"> arrives
           → MutationObserver fires → #syncFromChildren()
           → chart.update() → second bars animate in ✓

t=250ms  </dt-chart> closing tag arrives → done
```

### Edge Case: Chart.js Not Yet Loaded

If `<dt-dataset>` elements arrive before Chart.js finishes loading (e.g., first-ever use, ~100ms cold load):

```
t=50ms   <dt-chart> connects → starts loading Chart.js
t=70ms   <dt-dataset> arrives → #syncFromChildren() → #chart is null → stores in #pendingData
t=90ms   <dt-dataset> arrives → same, updates #pendingData
t=150ms  Chart.js loaded → #createChart() reads #pendingData → chart renders all datasets at once
```

On subsequent uses in the same iframe, Chart.js is cached in `window.__DtChart` and loads instantly, so the incremental animation works from the first dataset.

## Auto-Theming

The component reads CSS custom properties from the host context:

- `--dt-bg` → canvas background
- `--dt-text` → tick labels, legend text
- `--dt-border` → grid lines (subtle, only if options enable them)
- `--dt-accent` + computed palette → dataset colors
- `--dt-font-mono` → all chart text

A built-in palette of 8 colors is generated from the accent color via hue rotation. The AI never needs to pick colors — it just provides data.

No gridlines by default (clean sci-fi look). Grid can be enabled via `.options` escape hatch.

## File Plan

| File                                   | Action | Purpose                                                       |
| -------------------------------------- | ------ | ------------------------------------------------------------- |
| `packages/ui/src/dt-chart.ts`          | new    | `<dt-chart>` and `<dt-dataset>` component classes (same file) |
| `packages/ui/src/styles/chart.css`     | new    | Shadow DOM styles                                             |
| `packages/ui/src/lib/chart-loader.ts`  | new    | Singleton lazy loader for Chart.js                            |
| `packages/ui/src/chart-entry.ts`       | new    | Separate entry: imports Chart.js, sets `window.__DtChart`     |
| `packages/ui/build.mjs`                | modify | Add IIFE build for `chart-entry.ts` → `dist/chart.umd.js`     |
| `packages/ui/src/index.ts`             | modify | Register `dt-chart` and `dt-dataset` elements                 |
| `packages/ui/src/ui-elements.ts`       | modify | Add JSX types for both elements                               |
| `packages/ui/types.d.ts`               | modify | Add type declarations for both elements                       |
| `packages/ui/package.json`             | modify | Add `chart.js` dependency                                     |
| `packages/core/src/server/index.ts`    | modify | Add `GET /api/ui/chart.js` route                              |
| `packages/core/.../html-components.md` | modify | Document `<dt-chart>` + `<dt-dataset>` for AI                 |
| `packages/core/.../html-examples.md`   | modify | Add chart example LiveApp (using declarative datasets)        |
| `packages/ui/src/dt-chart.stories.ts`  | new    | Storybook stories                                             |

## Build Changes

### `packages/ui/build.mjs`

Add a third output config for the chart bundle:

```js
// In outputConfigs array, add:
{
  entryPoints: [resolve(srcDir, 'chart-entry.ts')],
  outfile: join(distDir, 'chart.umd.js'),
  format: 'iife',
  globalName: '__DtChartBundle',
}
```

This runs in parallel with the existing ESM and IIFE builds.

### `packages/core/src/server/index.ts`

Add route next to existing `/api/ui/desktalk-ui.js`:

```ts
// Serve Chart.js bundle (lazy-loaded by <dt-chart>)
let chartBundleCache: { body: Buffer; etag: string } | null = null;

app.get('/api/ui/chart.js', async (_req, reply) => {
  if (!chartBundleCache) {
    const chartBundlePath = join(
      dirname(require.resolve('@desktalk/ui/package.json')),
      'dist',
      'chart.umd.js',
    );
    const body = await readFile(chartBundlePath);
    chartBundleCache = { body, etag: createHash('sha1').update(body).digest('hex') };
  }
  const { body, etag } = chartBundleCache;
  reply.header('Content-Type', 'application/javascript; charset=utf-8');
  reply.header('Cache-Control', 'public, max-age=86400, immutable');
  reply.header('ETag', etag);
  return reply.send(body);
});
```

## `chart-loader.ts` Implementation

```ts
let promise: Promise<typeof import('chart.js').Chart> | null = null;

export function loadChartJs(): Promise<typeof import('chart.js').Chart> {
  if (promise) return promise;
  const existing = (window as any).__DtChart;
  if (existing) {
    promise = Promise.resolve(existing);
    return promise;
  }
  promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/api/ui/chart.js';
    script.onload = () => resolve((window as any).__DtChart);
    script.onerror = () => reject(new Error('Failed to load Chart.js bundle'));
    document.head.appendChild(script);
  });
  return promise;
}
```

## `chart-entry.ts` Implementation

```ts
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
(window as any).__DtChart = Chart;
```

## AI Manual Entry (`html-components.md`)

Add under Display Components:

```markdown
### `<dt-chart>`

Renders interactive charts. Define data declaratively with `<dt-dataset>` children.
The chart auto-themes to match the DeskTalk palette — do not set colors
unless the user specifically requests custom colors.

**The element requires an explicit height** via inline style or a CSS rule.

- `type` — `bar` (default), `line`, `area`, `pie`, `doughnut`, `radar`, `scatter`, `bubble`
- `labels` — comma-separated category labels (e.g. `labels="Jan,Feb,Mar"`)
- `legend` — `top`, `bottom`, `left`, `right`, `none` (default)
- `stacked` — when present, stacks datasets
- `.data` JS property — escape hatch for complex data (scatter, bubble); overrides child elements
- `.options` JS property — advanced: raw Chart.js options merged with defaults (rarely needed)
- `dt-chart-click` event — `{ label, datasetIndex, index, value }`

**When to use:** Any time the user asks for a chart, graph, or visualization.
Prefer `<dt-stat>` for single numeric KPIs.

### `<dt-dataset>`

Defines one data series inside a `<dt-chart>`. Use one per dataset.

- `label` — legend label
- `values` — comma-separated numbers (e.g. `values="12,19,3,5"`)
- `color` — optional: override the auto-assigned theme color

Example — bar chart with two datasets:

\`\`\`html
<dt-chart type="bar" legend="top" labels="Jan,Feb,Mar,Apr"
          style="height: 300px">
<dt-dataset label="Revenue" values="12,19,3,5"></dt-dataset>
<dt-dataset label="Costs" values="7,11,5,8"></dt-dataset>
</dt-chart>
\`\`\`

Example — doughnut chart:

\`\`\`html
<dt-chart type="doughnut" legend="right" labels="Electronics,Clothing,Food"
          style="height: 250px">
<dt-dataset label="Sales" values="35,25,22"></dt-dataset>
</dt-chart>
\`\`\`

Example — scatter chart (requires `.data` JS property):

\`\`\`html
<dt-chart id="scatter" type="scatter" style="height: 300px"></dt-chart>

<script>
  document.getElementById('scatter').data = {
    datasets: [{
      label: 'Samples',
      data: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 1 }],
    }],
  };
</script>

\`\`\`
```

## AI Manual Example (`html-examples.md`)

Add a "Sales Dashboard" example:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sales Dashboard</title>
    <style>
      body {
        background: var(--dt-bg);
      }
      .chart-box {
        height: 300px;
      }
    </style>
  </head>
  <body>
    <h1>Sales Dashboard</h1>
    <dt-grid columns="2" gap="md">
      <dt-card heading="Revenue by Month">
        <dt-chart
          type="bar"
          legend="top"
          stacked
          labels="Jan,Feb,Mar,Apr,May,Jun"
          class="chart-box"
        >
          <dt-dataset label="Online" values="12,19,3,5,2,3"></dt-dataset>
          <dt-dataset label="Retail" values="7,11,5,8,3,7"></dt-dataset>
        </dt-chart>
      </dt-card>
      <dt-card heading="User Growth">
        <dt-chart type="area" legend="none" labels="Jan,Feb,Mar,Apr,May,Jun" class="chart-box">
          <dt-dataset label="Users" values="150,230,224,318,435,547"></dt-dataset>
        </dt-chart>
      </dt-card>
    </dt-grid>

    <dt-card heading="Category Breakdown" style="margin-top: var(--dt-space-md)">
      <dt-grid columns="2" gap="md">
        <dt-chart
          type="doughnut"
          legend="right"
          labels="Electronics,Clothing,Food,Books"
          style="height: 250px"
        >
          <dt-dataset label="Sales" values="35,25,22,18"></dt-dataset>
        </dt-chart>
        <dt-chart
          type="radar"
          legend="bottom"
          labels="Speed,Reliability,Comfort,Safety,Efficiency"
          style="height: 250px"
        >
          <dt-dataset label="Model A" values="65,59,90,81,56"></dt-dataset>
          <dt-dataset label="Model B" values="28,48,40,19,96"></dt-dataset>
        </dt-chart>
      </dt-grid>
    </dt-card>
  </body>
</html>
```

## Design Decisions

1. **Separate bundle, not code splitting** — IIFE format can't split. A second entry point is simpler than overhauling the build.
2. **Declarative HTML as primary API** — `<dt-dataset>` child elements are the default. Enables streaming: the chart updates live as each dataset streams into the iframe. The `.data` JS property is kept as an escape hatch for scatter/bubble/dynamic data only. See "Streaming Support" section for full rationale and implementation.
3. **`area` type sugar** — `type="area"` maps to `line` + `fill: true`. More intuitive for AI generation than requiring `.options` override.
4. **No `title` attribute** — The AI should wrap charts in `<dt-card heading="...">` for titles, following existing patterns.
5. **Auto-theming palette** — 8 colors generated from accent hue rotation. AI never needs to pick colors.
6. **Dataset `color` is optional** — Escape hatch for when users explicitly request specific colors.
7. **`.options` escape hatch** — Raw Chart.js options for advanced use. The AI manual marks it as "rarely needed" to discourage overuse.
8. **Chart.js over ECharts** — 5x smaller bundle (~65KB vs ~330KB), flatter API for wrapping, built-in responsive handling, less hallucination risk on `.options` escape hatch. ECharts advantages (geo maps, complex compositions) don't apply to typical LiveApp use cases.
