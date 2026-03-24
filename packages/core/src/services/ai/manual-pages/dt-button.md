# `<dt-button>`

Themed button component.

## Attributes

- `variant` — button style: `primary` (default), `secondary`, `ghost`, `danger`
- `size` — button size: `sm`, `md` (default), `lg`
- `disabled` — disables the button
- `fullwidth` — makes the button fill its container width
- `type` — HTML button type: `button` (default), `submit`, `reset`

**When to use:** Use for all clickable actions. Always prefer `<dt-button>` over `<button>` or `.btn` class.

## Examples

```html
<dt-button>Save</dt-button>

<dt-button variant="secondary">Cancel</dt-button>

<dt-button variant="danger" size="sm">Delete</dt-button>

<dt-button variant="ghost" disabled>Disabled</dt-button>

<dt-button fullwidth>Full Width Button</dt-button>
```

## Full-Page Example — Action Buttons

```html
<dt-stack direction="row" gap="12" align="center">
  <dt-button>Primary</dt-button>
  <dt-button variant="secondary">Secondary</dt-button>
  <dt-button variant="ghost">Ghost</dt-button>
  <dt-button variant="danger">Danger</dt-button>
</dt-stack>
```
