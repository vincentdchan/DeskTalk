# Desktop Windows

Use the `desktop` tool for window-level operations.

## Actions

- `action="list"` -> get all open windows, the focused window, and available MiniApps
- `action="open"` with `miniAppId` -> open a MiniApp window
- `action="focus"` with `windowId` -> focus a window
- `action="maximize"` with `windowId` -> maximize a window
- `action="close"` with `windowId` -> close a window

## Usage Patterns

- Use `list` when you need fresh window IDs mid-conversation.
- Use `open` when the user wants a MiniApp launched and you do not already have a suitable window.
- If you need to act on a specific existing window, either focus it first or pass `windowId` explicitly.
- Opening a MiniApp with the same shallow-equal args may focus the existing window instead of creating a duplicate.

## Result Expectations

- `list` returns the current window set plus focused-window actions.
- `open` returns a `windowId` for the opened or focused window.
- Mutating actions fail if the target window does not exist.
