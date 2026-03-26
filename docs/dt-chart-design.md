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

### Data via `.data` JS Property

All chart data is provided via the `.data` JS property. This is the single, unified API for all chart types.

```html
<dt-chart
  id="revenue"
  type="bar"
  legend="top"
  labels="Jan,Feb,Mar"
  style="height: 300px"
></dt-chart>
<script>
  document.getElementById('revenue').data = {
    datasets: [
      { label: 'Revenue', data: [12, 19, 3] },
      { label: 'Costs', data: [7, 11, 5] },
    ],
  };
</script>
```

### Why `.data` Only (No Declarative Child Elements)

An earlier design used `<dt-dataset>` child elements for streaming-friendly declarative HTML. This was removed because the two-mode API (declarative children vs. `.data` property) confused the AI: it would mix the two approaches or use the wrong one for a given chart type. A single `.data` property is simpler to document, simpler for the AI to use correctly, and works uniformly for all chart types including scatter and bubble.

### Attributes on `<dt-chart>`

| Attribute | Values                                                                 | Default | Description                                               |
| --------- | ---------------------------------------------------------------------- | ------- | --------------------------------------------------------- |
| `type`    | `bar`, `line`, `area`, `pie`, `doughnut`, `radar`, `scatter`, `bubble` | `bar`   | Chart type. `area` is sugar for `line` with `fill: true`. |
| `legend`  | `top`, `bottom`, `left`, `right`, `none`                               | `none`  | Legend position. `none` hides it.                         |
| `stacked` | boolean (presence)                                                     | absent  | Stacks bar/line datasets.                                 |
| `labels`  | comma-separated string                                                 | `''`    | X-axis / category labels (e.g. `labels="Jan,Feb,Mar"`).   |

### JS Properties

| Property   | Type                                         | Description                                                                          |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `.data`    | `{ labels?: string[], datasets: Dataset[] }` | Required. Provides chart data. See Dataset Shape below.                              |
| `.options` | `object`                                     | Escape hatch: raw Chart.js options merged under auto-themed defaults. Rarely needed. |

### Dataset Shape (for `.data` JS property)

```ts
interface DtChartDataset {
  label?: string; // legend label
  data:
    | number[] // values for bar, line, area, pie, doughnut, radar
    | { x: number; y: number }[] // for scatter
    | { x: number; y: number; r: number }[]; // for bubble
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

| File                                   | Action | Purpose                                                   |
| -------------------------------------- | ------ | --------------------------------------------------------- |
| `packages/ui/src/dt-chart.ts`          | new    | `<dt-chart>` component class                              |
| `packages/ui/src/styles/chart.css`     | new    | Shadow DOM styles                                         |
| `packages/ui/src/lib/chart-loader.ts`  | new    | Singleton lazy loader for Chart.js                        |
| `packages/ui/src/chart-entry.ts`       | new    | Separate entry: imports Chart.js, sets `window.__DtChart` |
| `packages/ui/build.mjs`                | modify | Add IIFE build for `chart-entry.ts` → `dist/chart.umd.js` |
| `packages/ui/src/index.ts`             | modify | Register `dt-chart` element                               |
| `packages/ui/src/ui-elements.ts`       | modify | Add JSX types for the element                             |
| `packages/ui/types.d.ts`               | modify | Add type declarations for the element                     |
| `packages/ui/package.json`             | modify | Add `chart.js` dependency                                 |
| `packages/core/src/server/index.ts`    | modify | Add `GET /api/ui/chart.js` route                          |
| `packages/core/.../html-components.md` | modify | Document `<dt-chart>` for AI                              |
| `packages/core/.../html-examples.md`   | modify | Add chart example LiveApp                                 |
| `packages/ui/src/dt-chart.stories.ts`  | new    | Storybook stories                                         |

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

Renders interactive charts. Provide data via the `.data` JS property.
The chart auto-themes to match the DeskTalk palette — do not set colors
unless the user specifically requests custom colors.

**The element requires an explicit height** via inline style or a CSS rule.

- `type` — `bar` (default), `line`, `area`, `pie`, `doughnut`, `radar`, `scatter`, `bubble`
- `labels` — comma-separated category labels (e.g. `labels="Jan,Feb,Mar"`)
- `legend` — `top`, `bottom`, `left`, `right`, `none` (default)
- `stacked` — when present, stacks datasets
- `.data` JS property — provides chart data (required)
- `.options` JS property — advanced: raw Chart.js options merged with defaults (rarely needed)
- `dt-chart-click` event — `{ label, datasetIndex, index, value }`

**When to use:** Any time the user asks for a chart, graph, or visualization.
Prefer `<dt-stat>` for single numeric KPIs.

Example — bar chart with two datasets:

\`\`\`html
<dt-chart id="revenue" type="bar" legend="top" labels="Jan,Feb,Mar,Apr"
          style="height: 300px"></dt-chart>

<script>
  document.getElementById('revenue').data = {
    datasets: [
      { label: 'Revenue', data: [12, 19, 3, 5] },
      { label: 'Costs', data: [7, 11, 5, 8] },
    ],
  };
</script>

\`\`\`

Example — doughnut chart:

\`\`\`html
<dt-chart id="categories" type="doughnut" legend="right" labels="Electronics,Clothing,Food"
          style="height: 250px"></dt-chart>

<script>
  document.getElementById('categories').data = {
    datasets: [{ label: 'Sales', data: [35, 25, 22] }],
  };
</script>

\`\`\`

Example — scatter chart:

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
          id="revenue-chart"
          type="bar"
          legend="top"
          stacked
          labels="Jan,Feb,Mar,Apr,May,Jun"
          class="chart-box"
        ></dt-chart>
      </dt-card>
      <dt-card heading="User Growth">
        <dt-chart
          id="growth-chart"
          type="area"
          legend="none"
          labels="Jan,Feb,Mar,Apr,May,Jun"
          class="chart-box"
        ></dt-chart>
      </dt-card>
    </dt-grid>

    <dt-card heading="Category Breakdown" style="margin-top: var(--dt-space-md)">
      <dt-grid columns="2" gap="md">
        <dt-chart
          id="category-chart"
          type="doughnut"
          legend="right"
          labels="Electronics,Clothing,Food,Books"
          style="height: 250px"
        ></dt-chart>
        <dt-chart
          id="comparison-chart"
          type="radar"
          legend="bottom"
          labels="Speed,Reliability,Comfort,Safety,Efficiency"
          style="height: 250px"
        ></dt-chart>
      </dt-grid>
    </dt-card>

    <script>
      document.getElementById('revenue-chart').data = {
        datasets: [
          { label: 'Online', data: [12, 19, 3, 5, 2, 3] },
          { label: 'Retail', data: [7, 11, 5, 8, 3, 7] },
        ],
      };

      document.getElementById('growth-chart').data = {
        datasets: [{ label: 'Users', data: [150, 230, 224, 318, 435, 547] }],
      };

      document.getElementById('category-chart').data = {
        datasets: [{ label: 'Sales', data: [35, 25, 22, 18] }],
      };

      document.getElementById('comparison-chart').data = {
        datasets: [
          { label: 'Model A', data: [65, 59, 90, 81, 56] },
          { label: 'Model B', data: [28, 48, 40, 19, 96] },
        ],
      };
    </script>
  </body>
</html>
```

## Design Decisions

1. **Separate bundle, not code splitting** — IIFE format can't split. A second entry point is simpler than overhauling the build.
2. **`.data` JS property as sole data API** — An earlier version supported both `<dt-dataset>` child elements (for streaming) and `.data` (for complex types). The dual API confused AI models, which would mix the two approaches. A single `.data` property is simpler, works uniformly for all chart types, and eliminates ambiguity.
3. **`area` type sugar** — `type="area"` maps to `line` + `fill: true`. More intuitive for AI generation than requiring `.options` override.
4. **No `title` attribute** — The AI should wrap charts in `<dt-card heading="...">` for titles, following existing patterns.
5. **Auto-theming palette** — 8 colors generated from accent hue rotation. AI never needs to pick colors.
6. **Dataset `color` is optional** — Escape hatch for when users explicitly request specific colors.
7. **`.options` escape hatch** — Raw Chart.js options for advanced use. The AI manual marks it as "rarely needed" to discourage overuse.
8. **Chart.js over ECharts** — 5x smaller bundle (~65KB vs ~330KB), flatter API for wrapping, built-in responsive handling, less hallucination risk on `.options` escape hatch. ECharts advantages (geo maps, complex compositions) don't apply to typical LiveApp use cases.
