# Desktop Actions

Use the `action` tool to call MiniApp actions by name.

## Source of Truth

Every user message starts with a `[Desktop Context]` block.

That block tells you:

- which window is focused
- which actions are registered on the focused window
- the parameter schema for each action

Read it before invoking `action`.

## Rules

- Provide all required params as a JSON object.
- If `windowId` is omitted, the action runs on the focused window.
- If you need to target a different window, pass `windowId` explicitly or focus that window first.

## Preview Editing Pattern

For Preview edits, use `Get State` first.

The expected sequence is:

1. Call the focused Preview action `Get State`.
2. Read `file.path` from the action result.
3. Use the built-in `read` tool to inspect the file.
4. Use `edit` with an exact `oldText` match.

Do not guess Preview file paths.
