# HTML Tokens

Use these semantic DeskTalk tokens for all colors in generated previews.

## Required

- Use `--dt-*` CSS custom properties for all colors.
- Never hardcode `hex`, `rgb`, `rgba`, `hsl`, or `oklch` values.
- The final HTML must be a complete document with `<html>`, `<head>`, and `<body>`.
- Inline CSS and JavaScript; do not reference external files or CDNs unless the user explicitly asks.

## Semantic Tokens

- Backgrounds: `--dt-bg`, `--dt-bg-subtle`, `--dt-surface`, `--dt-surface-hover`, `--dt-surface-active`
- Text: `--dt-text`, `--dt-text-secondary`, `--dt-text-muted`, `--dt-text-on-accent`
- Borders: `--dt-border`, `--dt-border-subtle`, `--dt-border-strong`
- Accent: `--dt-accent`, `--dt-accent-hover`, `--dt-accent-active`, `--dt-accent-subtle`, `--dt-accent-ghost`
- Status: `--dt-danger`, `--dt-danger-subtle`, `--dt-success`, `--dt-success-subtle`, `--dt-warning`, `--dt-warning-subtle`, `--dt-info`, `--dt-info-subtle`
- Effects: `--dt-overlay`, `--dt-glass`, `--dt-shadow-color`

## Guidance

- Prefer semantic tokens over one-off palette definitions.
- Use status tokens for alerts, badges, and health indicators.
- Use accent tokens for primary actions or emphasis, not as a replacement for every surface.
- If you need a muted treatment, combine standard layout with tokens such as `--dt-bg-subtle`, `--dt-text-muted`, and `--dt-border-subtle`.
