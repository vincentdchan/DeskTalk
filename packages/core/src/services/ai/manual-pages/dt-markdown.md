# `<dt-markdown>`

Themed markdown renderer for rich text, documentation, notes, and AI-generated prose. Content can be inline between the tags or assigned through the `.content` JS property.

## Attributes

- `streaming` — shows a blinking caret and tolerates incomplete markdown while content updates
- `unsafe-html` — allows raw HTML in the markdown source
- `.content` JS property — markdown source string; overrides inline text content
- `dt-link-click` event — emitted with `{ href }` when a rendered link is clicked

**When to use:** Use for READMEs, release notes, help panels, generated reports, and any text that is more naturally authored as markdown than raw HTML.

## Examples

```html
<dt-markdown id="release-notes"></dt-markdown>

<dt-markdown id="stream-output" streaming></dt-markdown>

<script>
  document.getElementById('release-notes').content = `# Release Notes

- Added virtualized tables
- Improved command latency
- Fixed stale auth session refresh

> All systems are operational.`;

  const output = document.getElementById('stream-output');
  output.content = '# Build Report\n\nCollecting results';
  setTimeout(() => {
    output.content = '# Build Report\n\nCollecting results...\n\n- Core: passed\n- UI: passed';
    output.streaming = false;
  }, 600);
</script>
```

## Full-Page Example — Markdown Viewer

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Release Notes</title>
    <style>
      body {
        background: var(--dt-bg);
      }

      #notes {
        max-height: 420px;
        overflow: auto;
      }
    </style>
  </head>
  <body>
    <h1>Release Notes</h1>
    <dt-card>
      <dt-markdown id="notes"></dt-markdown>
    </dt-card>

    <script>
      document.getElementById('notes').content = `# DeskTalk 0.8.0

## Highlights

- Added virtualized list and table components
- Improved miniapp activation performance
- Refined storage docs for LiveApps

## Verification

| Package | Status |
| ------- | ------ |
| Core    | Passed |
| UI      | Passed |
| Miniapp | Passed |

> Use \`dt-link-click\` if you want to intercept links inside rendered markdown.`;
    </script>
  </body>
</html>
```
