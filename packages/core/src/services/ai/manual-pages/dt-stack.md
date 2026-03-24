# `<dt-stack>`

Flexbox stack for vertical or horizontal layouts.

## Attributes

- `direction` — stack direction: `column` (default) or `row`
- `gap` — spacing between items: `0`, `4`, `8`, `12`, `16`, `20`, `24`, `32` (default: `16`)
- `align` — cross-axis alignment: `start`, `center`, `end`, `stretch` (default: `stretch`)

**When to use:** Use for linear arrangements (buttons in a row, cards in a vertical list). Row stacks automatically wrap to column on narrow views.

## Examples

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
