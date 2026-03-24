# `<dt-table-view>` and `<dt-column>`

Virtualized table for structured row/column data. Column definitions stay declarative in HTML, and sorting is event-driven.

## `<dt-table-view>` Attributes

- `row-height` — fixed row height in px
- `sortable` — enables sortable header affordances
- `striped` — alternating row backgrounds
- `bordered` — cell borders
- `empty-text` — empty-state text
- `.rows` JS property — array of row objects
- `dt-sort` event — emitted with `{ field, direction }`; update `.rows` yourself
- `dt-row-click` event — emitted when a row is clicked

## `<dt-column>` Attributes

- `field` — row field key
- `header` — column header label
- `width` — column width in px or `auto`
- `min-width` — minimum column width
- `align` — `left`, `center`, or `right`

If a `<dt-column>` contains a `<template>`, its cells use that template. `data-field="x"` binds text content and `data-field-variant="y"` binds attributes.

**When to use:** Use for process lists, CSV-style datasets, summaries from shell commands, and other multi-column records.

## Examples

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

## Full-Page Example — Sortable Process Table

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Processes</title>
    <style>
      body {
        background: var(--dt-bg);
      }

      #process-table {
        height: 360px;
      }
    </style>
  </head>
  <body>
    <h1>Processes</h1>
    <dt-card>
      <dt-table-view id="process-table" row-height="40" sortable striped>
        <dt-column field="name" header="Process" width="220"></dt-column>
        <dt-column field="cpu" header="CPU %" width="100" align="right"></dt-column>
        <dt-column field="memory" header="Memory" width="120" align="right"></dt-column>
        <dt-column field="status" header="Status" width="120">
          <template>
            <dt-badge data-field="status" data-field-variant="statusVariant"></dt-badge>
          </template>
        </dt-column>
      </dt-table-view>
    </dt-card>

    <script>
      const table = document.getElementById('process-table');
      const rows = [
        {
          name: 'node',
          cpu: '12.5',
          memory: '256 MB',
          status: 'running',
          statusVariant: 'success',
        },
        { name: 'redis', cpu: '4.1', memory: '128 MB', status: 'idle', statusVariant: 'neutral' },
        { name: 'cron', cpu: '0.7', memory: '32 MB', status: 'degraded', statusVariant: 'warning' },
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
  </body>
</html>
```
