# `<dt-markdown-editor>`

WYSIWYG markdown editor powered by Milkdown. Users edit formatted content directly, while the component stores and returns markdown.

## Attributes

- `placeholder` — empty editor hint text
- `readonly` — makes the editor read-only
- `.value` JS property — get or replace the current markdown document
- `dt-change` event — emitted with `{ value }` after content changes (debounced)
- `dt-focus` event — emitted when the editor gains focus
- `dt-blur` event — emitted when the editor loses focus

**When to use:** Use for notes, documentation, comments, change logs, prompts, and any workflow that needs rich text authoring without building your own editor UI.

## Examples

```html
<dt-markdown-editor
  id="note-editor"
  placeholder="Write something..."
  style="height: 400px"
></dt-markdown-editor>
<dt-button id="save-note">Save</dt-button>

<script>
  const editor = document.getElementById('note-editor');
  editor.value = '# Team Notes\n\n- Review onboarding docs\n- Schedule release check';

  document.getElementById('save-note').addEventListener('click', () => {
    window.DeskTalk.storage.set('notes.latest', editor.value);
  });
</script>
```

## Full-Page Example — Markdown Note Editor

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Notes</title>
    <style>
      body {
        background: var(--dt-bg);
      }

      #editor {
        height: 420px;
      }
    </style>
  </head>
  <body>
    <h1>Operations Notes</h1>
    <dt-stack gap="12">
      <dt-stack direction="row" align="center" gap="8">
        <dt-button id="save">Save</dt-button>
        <dt-badge id="status" variant="neutral">Saved</dt-badge>
      </dt-stack>
      <dt-card>
        <dt-markdown-editor id="editor" placeholder="Capture findings..."></dt-markdown-editor>
      </dt-card>
    </dt-stack>

    <script>
      const editor = document.getElementById('editor');
      const status = document.getElementById('status');
      const save = document.getElementById('save');
      const saved =
        window.DeskTalk.storage.get('ops.note') ||
        '# Incident Review\n\n## Timeline\n\n- 09:00 Started investigation';

      editor.value = saved;

      editor.addEventListener('dt-change', () => {
        status.textContent = 'Unsaved';
        status.setAttribute('variant', 'warning');
      });

      save.addEventListener('click', () => {
        window.DeskTalk.storage.set('ops.note', editor.value);
        status.textContent = 'Saved';
        status.setAttribute('variant', 'success');
      });
    </script>
  </body>
</html>
```
