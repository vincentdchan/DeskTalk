# `<dt-divider>`

Horizontal or vertical separator line.

## Attributes

- `direction` — orientation: `horizontal` (default) or `vertical`
- `style-variant` — border style: `default`, `subtle`, `strong`
- `spacing` — margin around divider: `sm`, `md`, `lg`

**When to use:** Use to separate sections or items in a list.

## Examples

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
