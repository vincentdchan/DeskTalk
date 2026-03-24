# `<dt-list-view>`

Virtualized list for long collections. Supports fixed-height rows when `item-height` is provided and variable-height measurement mode when omitted.

## Attributes

- `item-height` — fixed row height in px; omit for variable-height measurement mode
- `dividers` — show dividers between rows
- `selectable` — `none`, `single`, or `multi`
- `empty-text` — empty-state text
- `.items` JS property — array of list item objects
- `dt-item-click` event — emitted when a row is clicked
- `dt-selection-change` event — emitted when selection changes

**When to use:** Use for task lists, logs, search results, files, and any long collection that might grow beyond a few dozen rows.

## Examples

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

## Full-Page Example — Virtualized Log List

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Deployment Logs</title>
    <style>
      body {
        background: var(--dt-bg);
      }

      #log-list {
        height: 360px;
      }
    </style>
  </head>
  <body>
    <h1>Deployment Logs</h1>
    <dt-card>
      <dt-list-view id="log-list" item-height="68" dividers>
        <template>
          <dt-stack gap="8">
            <dt-stack direction="row" align="center" gap="8">
              <strong data-field="service"></strong>
              <dt-badge data-field="level" data-field-variant="variant"></dt-badge>
            </dt-stack>
            <span class="text-muted" data-field="message"></span>
          </dt-stack>
        </template>
      </dt-list-view>
    </dt-card>

    <script>
      const list = document.getElementById('log-list');
      list.items = Array.from({ length: 250 }, (_, index) => ({
        service: `agent-${(index % 8) + 1}`,
        level: index % 5 === 0 ? 'warn' : 'info',
        variant: index % 5 === 0 ? 'warning' : 'info',
        message: `Processed batch ${index + 1} successfully.`,
      }));
    </script>
  </body>
</html>
```
