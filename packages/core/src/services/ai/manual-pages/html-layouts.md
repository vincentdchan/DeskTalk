# HTML Layouts

These layout rules are mandatory when using `create_liveapp`.

## Content Sections

- Every visually distinct content block must be wrapped in `<dt-card>`.
- This includes anything that would otherwise need background, border, padding, radius, or shadow.
- Do not create custom container classes such as `.card`, `.panel`, `.box`, `.tile`, `.section`, `.info-card`, or `.stat-box`.
- Do not style a plain `<div>` or `<section>` to look like a card.

## Allowed Plain `<div>` Usage

Use plain `<div>` only for structural layout:

- `display`
- `gap`
- `flex-*`
- `grid-*`
- `align-items`
- `justify-content`
- `width`
- `max-width`
- `margin`

If a wrapper becomes visually distinct, convert it to `<dt-card>`.

## Document Structure

- Return a full HTML document.
- Inline CSS and JavaScript in the document.
- Use semantic HTML tags for content structure.
- Keep layouts responsive for both desktop and smaller Preview window sizes.

## Authoring Pattern

1. Build page structure with semantic headings and paragraphs.
2. Use layout `<div>` wrappers only for grids and flex rows.
3. Wrap each visible section in `<dt-card>`.
4. Apply visual color through `--dt-*` tokens and existing utility classes.
