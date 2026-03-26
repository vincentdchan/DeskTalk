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

## Available Components

Each component has its own manual page with full attributes and examples.

### Layout

- `html/components/dt-grid` — Auto-responsive grid layout
- `html/components/dt-stack` — Flexbox stack for vertical or horizontal layouts (`direction` must be `row` or `column`, never `horizontal` / `vertical`)

### Display

- `html/components/dt-card` — Visually grouped content container
- `html/components/dt-stat` — Metric/KPI display
- `html/components/dt-badge` — Inline status pill/badge
- `html/components/dt-divider` — Horizontal or vertical separator

### Interactive

- `html/components/dt-button` — Themed button for actions
- `html/components/dt-select` — Dropdown select
- `html/components/dt-tooltip` — Hover/focus hints

### Data

- `html/components/dt-list-view` — Virtualized list for long collections
- `html/components/dt-table-view` — Virtualized table for structured data
- `html/components/dt-chart` — Interactive charts (via `.data` JS property)

### Content

- `html/components/dt-markdown` — Themed markdown renderer
- `html/components/dt-markdown-editor` — WYSIWYG markdown editor

Call `read_manual` with one of the paths above for full documentation.
