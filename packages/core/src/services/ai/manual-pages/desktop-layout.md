# Desktop Layout

Use the `layout` tool for tiling-layout operations on the current desktop.

## Actions

- `action="focus_direction"` with `direction` -> move focus to the neighboring window in that direction
- `action="swap"` with `direction` -> swap the focused window with its neighboring window in that direction
- `action="resize"` with `delta` -> adjust the focused split ratio; positive grows the focused window and negative shrinks it
- `action="rotate"` -> toggle the focused parent split between horizontal and vertical
- `action="equalize"` -> reset the focused parent split ratio to 50/50
- `action="split_mode"` with `mode` -> set how the next opened window will split (`horizontal`, `vertical`, or `auto`)

## Usage Patterns

- Read the `[Desktop Context]` block first so you understand the current tree and which window is focused.
- Use `desktop` with `action="list"` when you need fresh window IDs or want to confirm which window should be focused before changing layout.
- Use small resize deltas such as `0.05`, `0.1`, or `-0.1` for incremental changes.
- If a layout command fails, re-read the current layout before retrying.

## Examples

- Make the focused pane a bit wider: `action="resize", delta=0.1`
- Shrink the focused pane slightly: `action="resize", delta=-0.05`
- Swap the focused pane with the pane on the right: `action="swap", direction="right"`
- Move focus to the pane above: `action="focus_direction", direction="up"`
- Turn a side-by-side split into a top/bottom split: `action="rotate"`
- Reset the current split to equal halves: `action="equalize"`
- Make the next opened window split vertically: `action="split_mode", mode="vertical"`

## Result Expectations

- Layout actions fail with an error when the focused window has no valid neighbor or no adjustable parent split.
- `split_mode` only affects future window opens.
