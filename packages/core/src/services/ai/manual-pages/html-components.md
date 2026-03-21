# HTML Components

DeskTalk injects shared UI primitives into every generated Preview document.

## Auto-Injected Assets

- A `<link data-dt-theme>` stylesheet is injected automatically when `generate_html` runs.
- That stylesheet includes the full `--dt-*` token set for the current theme and accent color.
- It also includes base styling for `body`, headings, paragraphs, links, tables, cards, buttons, badges, `code`, and `pre`.
- A `window.DeskTalk` bridge is also injected automatically.

## Utility Classes

- `.badge`
- `.badge-danger`
- `.badge-success`
- `.badge-warning`
- `.badge-info`
- `.btn`
- `.text-muted`
- `.text-secondary`
- `.accent-bg`

Use these existing utility classes before creating one-off visual treatments.

## Typography

Headings (`h1`-`h6`) and paragraphs (`p`) are pre-styled by the injected stylesheet.

- Never add CSS rules or inline styles that target headings or paragraphs directly.
- Do not override their font size, weight, family, color, margin, line height, letter spacing, or text transform.
- Use native tags and let the injected theme styles handle typography.
- If you need muted or secondary text, use wrapper styles or utility classes such as `.text-muted` and `.text-secondary`.

## DeskTalk Web Components

### `<dt-card>`

Use `<dt-card>` for any visually grouped content: information panels, stat blocks, feature tiles, settings groups, and list items that need a visible container.

- `variant="default"` -> solid surface background
- `variant="outlined"` -> transparent background
- `variant="filled"` -> accent-subtle background

### `<dt-tooltip>`

Use `<dt-tooltip>` for hover or focus hints around interactive elements.

- `content`
- `placement` -> `top | bottom | left | right`
- `delay`
- `disabled`

Example:

```html
<dt-tooltip content="Save file" placement="top">
  <button class="btn">Save</button>
</dt-tooltip>
```
