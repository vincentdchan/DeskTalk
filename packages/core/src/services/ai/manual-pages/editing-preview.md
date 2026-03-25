# Preview Editing

Use this workflow when the user asks to change content already shown in a Preview window.

## Preferred Flow

1. Call the focused Preview action `Get State`.
2. Read `file.path` from the result — this is a **home-relative** path.
3. Join `file.path` with the `Home` directory from `[Desktop Context]` to get the absolute path.
4. Use the built-in `read` tool on the absolute path.
5. Call `edit` with an exact `oldText` match. (`edit` accepts both absolute and home-relative paths.)
6. Use `undo_edit` or `redo_edit` later with the same file path if needed.

## Rules

- Prefer `edit` over regenerating HTML when the request is a targeted revision.
- Do not guess the file path.
- Do not edit blind; always inspect the current file first.
- `oldText` must match exactly once or the tool fails.
- After `edit`, `undo_edit`, or `redo_edit`, Preview reload is automatic through DeskTalk events.
- If the LiveApp uses `DeskTalk.storage` and you change the expected data shape, also inspect and migrate the relevant storage files.

## When to Regenerate Instead

Regenerate with `create_liveapp` only when the user wants a new visual artifact, a major redesign, or content that is not already represented by the current Preview document.
