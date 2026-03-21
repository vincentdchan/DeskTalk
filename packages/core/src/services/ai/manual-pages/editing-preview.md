# Preview Editing

Use this workflow when the user asks to change content already shown in a Preview window.

## Preferred Flow

1. Call the focused Preview action `Get State`.
2. Read `file.path` from the result.
3. Use the built-in `read` tool on that file.
4. Call `edit` with an exact `oldText` match.
5. Use `undo_edit` or `redo_edit` later with the same file path if needed.

## Rules

- Prefer `edit` over regenerating HTML when the request is a targeted revision.
- Do not guess the file path.
- Do not edit blind; always inspect the current file first.
- `oldText` must match exactly once or the tool fails.
- After `edit`, `undo_edit`, or `redo_edit`, Preview reload is automatic through DeskTalk events.

## When to Regenerate Instead

Regenerate with `generate_html` only when the user wants a new visual artifact, a major redesign, or content that is not already represented by the current Preview document.
