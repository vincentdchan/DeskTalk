# `<dt-grid>`

Auto-responsive grid layout. Columns collapse automatically in narrow views.

## Attributes

- `cols` — fixed number of columns: `1`, `2`, `3`, `4`, `5`, `6` (auto-fit responsive when omitted)
- `gap` — spacing between items: `0`, `4`, `8`, `12`, `16`, `20`, `24`, `32` (default: `16`)
- `min-width` — minimum width for auto-fit columns: `150`, `180`, `200`, `220`, `260`, `300` (default: `220`)

**When to use:** Use for any multi-column layout. Prefer omitting `cols` for auto-responsive behavior unless you need a specific number of columns.

## Examples

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
