# HTML Layouts

These layout rules are mandatory when using `create_liveapp`.

## Layout Components

Always use the built-in layout components for structure:

- **`<dt-grid>`** — for multi-column layouts. Auto-responsive by default.
- **`<dt-stack>`** — for linear arrangements (vertical lists, horizontal button rows). Use `direction="row"` for horizontal and `direction="column"` for vertical. Never use `horizontal` or `vertical` as attribute values.

Do not create custom grid or flexbox layouts with raw CSS unless absolutely necessary.

## Content Sections

- Every visually distinct content block must be wrapped in `<dt-card>`.
- This includes anything that would otherwise need background, border, padding, radius, or shadow.
- Do not create custom container classes such as `.card`, `.panel`, `.box`, `.tile`, `.section`, `.info-card`, or `.stat-box`.
- Do not style a plain `<div>` or `<section>` to look like a card.

## Allowed Plain `<div>` Usage

Use plain `<div>` only for the most minimal structural needs:

- `display: flex` / `display: grid` (only when layout components don't fit)
- `gap`, `flex-*`, `grid-*`
- `align-items`, `justify-content`
- `width`, `max-width`, `min-width`
- `margin`, `padding`

If a wrapper becomes visually distinct, convert it to `<dt-card>`.

## Document Structure

- Return a full HTML document.
- Inline CSS and JavaScript in the document.
- Use semantic HTML tags for content structure.
- Use layout components for responsive behavior — they handle narrow views automatically.

## Responsive Design

The layout components (`<dt-grid>`, `<dt-stack>`) handle responsive behavior internally:

- `<dt-grid>` without `cols` attribute uses `auto-fit` — items wrap naturally
- `<dt-grid>` with `cols` collapses to single column below 480px
- `<dt-stack direction="row">` wraps to column below 480px
- `<dt-stack>` only accepts `direction="row"` or `direction="column"`
- Body padding is responsive (smaller on narrow views)

Do not add custom media queries for basic responsive behavior.

## Authoring Pattern

1. Build page structure with semantic headings and paragraphs.
2. Use `<dt-grid>` or `<dt-stack>` for layout containers.
3. Wrap each visible content section in `<dt-card>`.
4. Use `<dt-stat>` for metrics, `<dt-badge>` for status indicators, `<dt-button>` for actions.
5. Use `<dt-list-view>` for long lists and `<dt-table-view>` for structured multi-column data instead of hand-rolling custom scrollers.
6. Apply visual color only through `--dt-*` tokens and utility classes.

## Examples

### Dashboard with Auto-Responsive Grid

```html
<dt-grid>
  <dt-stat label="CPU" value="42%"></dt-stat>
  <dt-stat label="RAM" value="8.2 GB"></dt-stat>
  <dt-stat label="Disk" value="256 GB"></dt-stat>
  <dt-stat label="Network" value="1.2 GB/s"></dt-stat>
</dt-grid>
```

### Action Buttons in a Row

```html
<dt-stack direction="row" gap="12">
  <dt-button>Save</dt-button>
  <dt-button variant="secondary">Cancel</dt-button>
  <dt-button variant="ghost">Reset</dt-button>
</dt-stack>
```

### Cards in a Vertical Stack

```html
<dt-stack>
  <dt-card>
    <h3>System Status</h3>
    <dt-badge variant="success">All Systems Operational</dt-badge>
  </dt-card>

  <dt-card>
    <h3>Recent Activity</h3>
    <p>12 events in the last hour.</p>
    <dt-button size="sm">View All</dt-button>
  </dt-card>
</dt-stack>
```

### Long Collection in a Card

```html
<dt-card>
  <h3>Recent Jobs</h3>
  <dt-list-view item-height="68" dividers style="height: 320px;">
    <template>
      <dt-stack direction="row" align="center" gap="8">
        <strong data-field="name"></strong>
        <dt-badge data-field="state" data-field-variant="stateVariant"></dt-badge>
      </dt-stack>
    </template>
  </dt-list-view>
</dt-card>
```

### Structured Data Table

```html
<dt-card>
  <h3>Running Processes</h3>
  <dt-table-view row-height="40" striped style="height: 320px;">
    <dt-column field="name" header="Process" width="220"></dt-column>
    <dt-column field="cpu" header="CPU %" align="right" width="100"></dt-column>
    <dt-column field="memory" header="Memory" align="right" width="120"></dt-column>
  </dt-table-view>
</dt-card>
```
