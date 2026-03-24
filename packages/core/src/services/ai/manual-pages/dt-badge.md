# `<dt-badge>`

Inline status pill/badge.

## Attributes

- `variant` — status color: `accent` (default), `success`, `danger`, `warning`, `info`, `neutral`
- `size` — size: `sm`, `md` (default), `lg`
- `text` — badge text (alternative to slot content)

**When to use:** Use for status indicators, labels, category tags.

## Examples

```html
<dt-badge>New</dt-badge>

<dt-badge variant="success">Active</dt-badge>

<dt-badge variant="danger" size="lg">Error</dt-badge>

<dt-badge variant="info" size="sm">Beta</dt-badge>
```

## Full-Page Example — Status Badges

```html
<dt-stack direction="row" gap="8">
  <dt-badge>Default</dt-badge>
  <dt-badge variant="success">Success</dt-badge>
  <dt-badge variant="warning">Warning</dt-badge>
  <dt-badge variant="danger">Error</dt-badge>
  <dt-badge variant="info">Info</dt-badge>
  <dt-badge variant="neutral">Neutral</dt-badge>
</dt-stack>
```
