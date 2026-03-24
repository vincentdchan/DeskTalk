# HTML Components

DeskTalk injects shared UI primitives into every generated Preview document.

## Auto-Injected Assets

- A `<link data-dt-theme>` stylesheet is injected automatically when `create_liveapp` runs.
- That stylesheet includes the full `--dt-*` token set for the current theme and accent color.
- It also includes base styling for `body`, headings, paragraphs, links, tables, `code`, and `pre`.
- A `window.DeskTalk` bridge is also injected automatically.
- All web component definitions (`dt-*` elements) are automatically available.
- That bridge includes persistent storage APIs through `window.DeskTalk.storage`.

## Typography

Headings (`h1`-`h6`) and paragraphs (`p`) are pre-styled by the injected stylesheet.

- Never add CSS rules or inline styles that target headings or paragraphs directly.
- Do not override their font size, weight, family, color, margin, line height, letter spacing, or text transform.
- Use native tags and let the injected theme styles handle typography.
- If you need muted or secondary text, use utility classes such as `.text-muted` and `.text-secondary`.

## Utility Classes

- `.text-muted` — muted/tertiary text color
- `.text-secondary` — secondary text color
- `.accent-bg` — accent-subtle background

Use these before creating one-off visual treatments.

---

## DeskTalk Web Components

All components automatically match the DeskTalk theme using CSS custom properties.

### `<dt-card>`

Use `<dt-card>` for any visually grouped content: information panels, stat blocks, feature tiles, settings groups, and list items that need a visible container.

- `variant="default"` — solid surface background (default)
- `variant="outlined"` — transparent background with border
- `variant="filled"` — accent-subtle background

Example:

```html
<dt-card>
  <h3>Title</h3>
  <p>Card content goes here.</p>
</dt-card>

<dt-card variant="outlined">
  <p>Outlined card with transparent background.</p>
</dt-card>
```

### `<dt-tooltip>`

Use `<dt-tooltip>` for hover or focus hints around interactive elements.

- `content` — tooltip text
- `placement` — `top`, `bottom`, `left`, `right`
- `delay` — show delay in ms
- `disabled` — disable tooltip

Example:

```html
<dt-tooltip content="Save file" placement="top">
  <dt-button>Save</dt-button>
</dt-tooltip>
```

### `<dt-select>`

Dropdown select component.

- `value` — selected value
- `placeholder` — placeholder text
- `disabled` — disable the select
- `align` — `left` or `right` alignment

---

## Layout Components

### `<dt-grid>`

Auto-responsive grid layout. Columns collapse automatically in narrow views.

- `cols` — fixed number of columns: `1`, `2`, `3`, `4`, `5`, `6` (auto-fit responsive when omitted)
- `gap` — spacing between items: `0`, `4`, `8`, `12`, `16`, `20`, `24`, `32` (default: `16`)
- `min-width` — minimum width for auto-fit columns: `150`, `180`, `200`, `220`, `260`, `300` (default: `220`)

**When to use:** Use for any multi-column layout. Prefer omitting `cols` for auto-responsive behavior unless you need a specific number of columns.

Examples:

```html
<!-- Auto-responsive: columns collapse based on available space -->
<dt-grid>
  <dt-card>Item 1</dt-card>
  <dt-card>Item 2</dt-card>
  <dt-card>Item 3</dt-card>
</dt-grid>

<!-- Fixed 3 columns, collapses to 1 on mobile -->
<dt-grid cols="3" gap="24">
  <dt-stat label="CPU" value="42%"></dt-stat>
  <dt-stat label="RAM" value="8GB"></dt-stat>
  <dt-stat label="Disk" value="256GB"></dt-stat>
</dt-grid>
```

### `<dt-stack>`

Flexbox stack for vertical or horizontal layouts.

- `direction` — stack direction: `column` (default) or `row`
- `gap` — spacing between items: `0`, `4`, `8`, `12`, `16`, `20`, `24`, `32` (default: `16`)
- `align` — cross-axis alignment: `start`, `center`, `end`, `stretch` (default: `stretch`)

**When to use:** Use for linear arrangements (buttons in a row, cards in a vertical list). Row stacks automatically wrap to column on narrow views.

Examples:

```html
<!-- Vertical stack (default) -->
<dt-stack>
  <dt-card>Item 1</dt-card>
  <dt-card>Item 2</dt-card>
  <dt-card>Item 3</dt-card>
</dt-stack>

<!-- Horizontal row (wraps to column on narrow views) -->
<dt-stack direction="row" gap="12">
  <dt-button>Save</dt-button>
  <dt-button variant="secondary">Cancel</dt-button>
</dt-stack>
```

---

## Display Components

### `<dt-stat>`

Metric/KPI display component. Shows a label, value, and optional description.

- `label` — the metric label (e.g., "CPU Usage")
- `value` — the metric value (e.g., "42%")
- `description` — optional descriptive text
- `size` — size: `sm`, `md` (default), `lg`
- `variant` — visual style: `default`, `outlined`, `filled`
- `trend` — trend indicator: `up`, `down`, `neutral`
- `trend-value` — value to display with trend (e.g., "+5%")

**When to use:** Use for dashboard metrics, system monitoring, KPI displays.

Examples:

```html
<dt-stat label="CPU Usage" value="42%"></dt-stat>

<dt-stat label="Memory" value="8.2 GB" description="of 16 GB used"></dt-stat>

<dt-stat label="Uptime" value="99.9%" size="lg" variant="filled"></dt-stat>

<dt-stat
  label="Traffic"
  value="12.5k"
  description="visitors today"
  trend="up"
  trend-value="+18%"
></dt-stat>
```

### `<dt-badge>`

Inline status pill/badge.

- `variant` — status color: `accent` (default), `success`, `danger`, `warning`, `info`, `neutral`
- `size` — size: `sm`, `md` (default), `lg`
- `text` — badge text (alternative to slot content)

**When to use:** Use for status indicators, labels, category tags.

Examples:

```html
<dt-badge>New</dt-badge>

<dt-badge variant="success">Active</dt-badge>

<dt-badge variant="danger" size="lg">Error</dt-badge>

<dt-badge variant="info" size="sm">Beta</dt-badge>
```

### `<dt-divider>`

Horizontal or vertical separator line.

- `direction` — orientation: `horizontal` (default) or `vertical`
- `style-variant` — border style: `default`, `subtle`, `strong`
- `spacing` — margin around divider: `sm`, `md`, `lg`

**When to use:** Use to separate sections or items in a list.

Examples:

```html
<!-- Horizontal divider (default) -->
<dt-divider></dt-divider>

<!-- Vertical divider in a row layout -->
<dt-stack direction="row">
  <span>Left</span>
  <dt-divider direction="vertical"></dt-divider>
  <span>Right</span>
</dt-stack>
```

### `<dt-list-view>`

Virtualized list for long collections. Supports fixed-height rows when `item-height` is provided and variable-height measurement mode when omitted.

- `item-height` — fixed row height in px; omit for variable-height measurement mode
- `dividers` — show dividers between rows
- `selectable` — `none`, `single`, or `multi`
- `empty-text` — empty-state text
- `.items` JS property — array of list item objects
- `dt-item-click` event — emitted when a row is clicked
- `dt-selection-change` event — emitted when selection changes

**When to use:** Use for task lists, logs, search results, files, and any long collection that might grow beyond a few dozen rows.

Example:

```html
<dt-list-view id="task-list" item-height="72" dividers selectable="single">
  <template>
    <dt-stack gap="8">
      <dt-stack direction="row" align="center" gap="8">
        <strong data-field="title"></strong>
        <dt-badge data-field="status" data-field-variant="statusVariant"></dt-badge>
      </dt-stack>
      <span class="text-muted" data-field="summary"></span>
    </dt-stack>
  </template>
</dt-list-view>

<script>
  document.getElementById('task-list').items = [
    {
      title: 'Review report',
      status: 'Queued',
      statusVariant: 'warning',
      summary: 'Waiting on CPU budget',
    },
    {
      title: 'Publish build',
      status: 'Done',
      statusVariant: 'success',
      summary: 'Released 4 minutes ago',
    },
  ];
</script>
```

### `<dt-table-view>` and `<dt-column>`

Virtualized table for structured row/column data. Column definitions stay declarative in HTML, and sorting is event-driven.

- `row-height` — fixed row height in px
- `sortable` — enables sortable header affordances
- `striped` — alternating row backgrounds
- `bordered` — cell borders
- `empty-text` — empty-state text
- `.rows` JS property — array of row objects
- `dt-sort` event — emitted with `{ field, direction }`; update `.rows` yourself
- `dt-row-click` event — emitted when a row is clicked

`<dt-column>` attributes:

- `field` — row field key
- `header` — column header label
- `width` — column width in px or `auto`
- `min-width` — minimum column width
- `align` — `left`, `center`, or `right`

If a `<dt-column>` contains a `<template>`, its cells use that template. `data-field="x"` binds text content and `data-field-variant="y"` binds attributes.

**When to use:** Use for process lists, CSV-style datasets, summaries from shell commands, and other multi-column records.

Example:

```html
<dt-table-view id="process-table" row-height="40" sortable striped>
  <dt-column field="name" header="Process" width="220"></dt-column>
  <dt-column field="cpu" header="CPU %" width="100" align="right"></dt-column>
  <dt-column field="status" header="Status" width="140">
    <template>
      <dt-badge data-field="status" data-field-variant="statusVariant"></dt-badge>
    </template>
  </dt-column>
</dt-table-view>

<script>
  const table = document.getElementById('process-table');
  const rows = [
    { name: 'node', cpu: '12.4', status: 'running', statusVariant: 'success' },
    { name: 'cron', cpu: '1.2', status: 'idle', statusVariant: 'neutral' },
  ];

  table.rows = rows;
  table.addEventListener('dt-sort', (event) => {
    const { field, direction } = event.detail;
    table.rows = [...rows].sort((a, b) =>
      direction === 'asc'
        ? String(a[field]).localeCompare(String(b[field]), undefined, { numeric: true })
        : String(b[field]).localeCompare(String(a[field]), undefined, { numeric: true }),
    );
  });
</script>
```

---

## Interactive Components

### `<dt-button>`

Themed button component.

- `variant` — button style: `primary` (default), `secondary`, `ghost`, `danger`
- `size` — button size: `sm`, `md` (default), `lg`
- `disabled` — disables the button
- `fullwidth` — makes the button fill its container width
- `type` — HTML button type: `button` (default), `submit`, `reset`

**When to use:** Use for all clickable actions. Always prefer `<dt-button>` over `<button>` or `.btn` class.

Examples:

```html
<dt-button>Save</dt-button>

<dt-button variant="secondary">Cancel</dt-button>

<dt-button variant="danger" size="sm">Delete</dt-button>

<dt-button variant="ghost" disabled>Disabled</dt-button>

<dt-button fullwidth>Full Width Button</dt-button>
```
