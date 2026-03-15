# Color System

## Problem

DeskTalk has ~130 color values scattered across core SCSS files and MiniApp CSS Modules. These fall into three inconsistent patterns:

1. **CSS custom properties** defined in `global.scss` (20 tokens) — the intended system, but incomplete.
2. **SCSS file-scoped variables** in `InfoPanel.module.scss` and `Dock.module.scss` (~60 raw `rgba()` values) — completely disconnected from the CSS tokens.
3. **Hardcoded hex/rgba literals** in MiniApp CSS (~50 values) — often duplicating existing tokens or using ad-hoc Tailwind palette colors.

There is no way to change the accent color, switch between light and dark themes, or ensure visual consistency across MiniApps. The `general.theme` preference setting exists but nothing consumes it.

## Goals

1. A user sets **one accent color** in Preferences. Every other UI color is derived from it automatically.
2. Light and dark themes work by flipping lightness values — the hue and chroma stay consistent.
3. MiniApps consume the same token set as the core, with no need to hardcode colors or maintain fallback values.
4. The system is pure CSS (custom properties + `oklch()`). No JS runtime required for color math at render time.
5. The palette generation logic lives in a single JS module that the core runs once at startup and whenever the accent color or theme changes.

## Why OKLCH

OKLCH (Oklab Lightness-Chroma-Hue) is the color space for this system. The reasons:

| Property                           | HSL                                                                                                         | OKLCH                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Perceptual uniformity              | No. `hsl(60, 100%, 50%)` (yellow) looks far brighter than `hsl(240, 100%, 50%)` (blue) at the same L value. | Yes. Equal L values produce equal perceived brightness regardless of hue.                     |
| Predictable lightness manipulation | Unreliable. Shifting L in HSL produces uneven brightness jumps across hues.                                 | Reliable. Shifting L in OKLCH produces consistent brightness steps for any hue.               |
| Gamut mapping                      | No built-in concept. Out-of-gamut colors clip unpredictably.                                                | CSS `oklch()` with gamut mapping (`color()` fallback) is a solved problem in modern browsers. |
| Theme derivation                   | Requires per-hue adjustments to get visually balanced palettes.                                             | A single algorithm works for any input hue because lightness is perceptually uniform.         |
| CSS native support                 | `hsl()` supported everywhere.                                                                               | `oklch()` supported in all modern browsers (Chrome 111+, Firefox 113+, Safari 15.4+).         |

The core insight: when deriving surface, border, and text colors from an accent, we need to manipulate lightness predictably. OKLCH is the only CSS-native color space where "make this 20% lighter" means the same thing for purple as it does for yellow.

### Browser Support

`oklch()` is supported in Chrome 111+, Firefox 113+, and Safari 15.4+. DeskTalk is a locally-served desktop app where the user controls the browser. This is not a concern.

## Architecture

```
User picks accent color (any format)
        │
        ▼
┌──────────────────────┐
│  Palette Generator    │  (JS module in @desktalk/core)
│                       │
│  Input:  accent hex   │
│          theme mode   │
│                       │
│  Output: CSS string   │
│          of :root     │
│          variables    │
└──────────┬────────────┘
           │
           ▼
   Injected into <style id="dt-theme">
   on the document <head>
           │
           ▼
┌──────────────────────┐
│  Core components      │  consume var(--dt-*)
│  MiniApp components   │  consume var(--dt-*)
└───────────────────────┘
```

The palette generator is a **pure function**: `(accentHex: string, mode: 'light' | 'dark') => string`. It converts the accent to OKLCH, derives every token, and returns a CSS text block. The core injects this into a `<style>` element. When the user changes accent or theme, the core reruns the function and replaces the style text.

## Color Token Layers

The system uses three layers. Each layer builds on the one below it.

### Layer 1 — Primitive OKLCH Values

These are the raw OKLCH channels derived from the input accent. They are not used directly in component CSS. They exist so Layer 2 tokens can reference them.

```
--dt-accent-h        /* Hue (0-360) */
--dt-accent-c        /* Chroma (0-0.4) */
--dt-accent-l        /* Lightness (0-1) */
--dt-mode-sign       /* +1 for dark, -1 for light — used to flip lightness direction */
```

### Layer 2 — Palette Scale

A 13-step scale from the accent hue, varying only in lightness and chroma. This is analogous to Tailwind's `slate-50` through `slate-950`, but generated from the user's accent.

| Token            | Dark mode L | Light mode L | Chroma | Purpose       |
| ---------------- | ----------- | ------------ | ------ | ------------- |
| `--dt-scale-50`  | 0.98        | 0.98         | 0.005  | Lightest tint |
| `--dt-scale-100` | 0.94        | 0.94         | 0.01   |               |
| `--dt-scale-150` | 0.88        | 0.88         | 0.015  |               |
| `--dt-scale-200` | 0.80        | 0.80         | 0.02   |               |
| `--dt-scale-300` | 0.70        | 0.70         | 0.025  |               |
| `--dt-scale-400` | 0.60        | 0.60         | 0.03   |               |
| `--dt-scale-500` | 0.50        | 0.50         | 0.04   | Mid-tone      |
| `--dt-scale-600` | 0.40        | 0.40         | 0.03   |               |
| `--dt-scale-700` | 0.32        | 0.32         | 0.025  |               |
| `--dt-scale-800` | 0.24        | 0.24         | 0.03   |               |
| `--dt-scale-850` | 0.20        | 0.20         | 0.035  |               |
| `--dt-scale-900` | 0.16        | 0.16         | 0.04   |               |
| `--dt-scale-950` | 0.12        | 0.12         | 0.05   | Darkest shade |

All scale tokens share the accent hue. Chroma is kept very low (tinted neutral) so they work as background/surface/border colors without looking garish. The accent itself retains its original chroma.

### Layer 3 — Semantic Tokens

These are the tokens that components actually use. Each one maps to a scale step or a derived OKLCH value depending on the theme mode.

#### Background & Surface

| Token                 | Dark mode               | Light mode             | Usage                     |
| --------------------- | ----------------------- | ---------------------- | ------------------------- |
| `--dt-bg`             | scale-950               | scale-50               | Page background           |
| `--dt-bg-subtle`      | scale-900               | scale-100              | Recessed areas            |
| `--dt-surface`        | scale-850               | scale-100              | Cards, panels             |
| `--dt-surface-hover`  | scale-800               | scale-150              | Hovered cards/panels      |
| `--dt-surface-active` | scale-700               | scale-200              | Pressed/active cards      |
| `--dt-overlay`        | scale-900 / 85% opacity | scale-50 / 85% opacity | Dock, tooltips, dropdowns |

#### Text

| Token                 | Dark mode             | Light mode      | Usage                              |
| --------------------- | --------------------- | --------------- | ---------------------------------- |
| `--dt-text`           | scale-50              | scale-950       | Primary text                       |
| `--dt-text-secondary` | scale-300             | scale-600       | Secondary text                     |
| `--dt-text-muted`     | scale-400             | scale-500       | Disabled/placeholder text          |
| `--dt-text-on-accent` | scale-50 or scale-950 | (auto-contrast) | Text on accent-colored backgrounds |

#### Border

| Token                | Dark mode               | Light mode              | Usage              |
| -------------------- | ----------------------- | ----------------------- | ------------------ |
| `--dt-border`        | scale-800               | scale-200               | Standard borders   |
| `--dt-border-subtle` | scale-850 / 60% opacity | scale-150 / 60% opacity | Faint dividers     |
| `--dt-border-strong` | scale-700               | scale-300               | Emphasized borders |

#### Accent

| Token                | Value                                         | Usage                                          |
| -------------------- | --------------------------------------------- | ---------------------------------------------- |
| `--dt-accent`        | User's original color in OKLCH                | Primary accent (buttons, links, active states) |
| `--dt-accent-hover`  | Accent with L shifted toward mid-tone by 0.05 | Hovered accent                                 |
| `--dt-accent-active` | Accent with L shifted toward mid-tone by 0.10 | Pressed accent                                 |
| `--dt-accent-subtle` | Accent at 15% opacity                         | Accent tinted backgrounds                      |
| `--dt-accent-ghost`  | Accent at 8% opacity                          | Very faint accent wash                         |

#### Status

Status colors are **not** derived from the accent. They use fixed hues to preserve universal meaning (red = danger, green = success, amber = warning, blue = info). Their lightness and chroma are calibrated to match the accent palette's visual weight.

| Token                 | Hue (fixed)       | Usage                       |
| --------------------- | ----------------- | --------------------------- |
| `--dt-danger`         | 25 (red)          | Errors, destructive actions |
| `--dt-danger-subtle`  | 25 / 15% opacity  | Danger backgrounds          |
| `--dt-success`        | 155 (green)       | Success states              |
| `--dt-success-subtle` | 155 / 15% opacity | Success backgrounds         |
| `--dt-warning`        | 80 (amber)        | Warnings                    |
| `--dt-warning-subtle` | 80 / 15% opacity  | Warning backgrounds         |
| `--dt-info`           | 250 (blue)        | Informational               |
| `--dt-info-subtle`    | 250 / 15% opacity | Info backgrounds            |

Status token lightness follows the same mode-aware pattern: in dark mode, the base color sits at L ~0.70; in light mode, at L ~0.45. This keeps them legible against their respective backgrounds.

#### Component-Specific

These tokens exist for the shell chrome. They are derived from semantic tokens, not independent values.

| Token                 | Dark mode                   | Light mode                   | Usage                        |
| --------------------- | --------------------------- | ---------------------------- | ---------------------------- |
| `--dt-dock-bg`        | `--dt-overlay`              | `--dt-overlay`               | Dock background              |
| `--dt-actions-bar-bg` | `--dt-bg-subtle`            | `--dt-bg-subtle`             | Actions bar                  |
| `--dt-window-chrome`  | `--dt-surface`              | `--dt-surface`               | Window title bar             |
| `--dt-window-body`    | `--dt-bg`                   | `--dt-bg`                    | Window content area          |
| `--dt-info-panel-bg`  | `--dt-bg-subtle`            | `--dt-bg-subtle`             | Info/AI panel                |
| `--dt-wallpaper`      | Accent-hued gradient (dark) | Accent-hued gradient (light) | Desktop wallpaper background |

#### Glass Effect

For translucent/blur effects (Dock, tooltips), the system provides alpha-channel utilities rather than hardcoded `rgba()`:

| Token                  | Value                         | Usage                    |
| ---------------------- | ----------------------------- | ------------------------ |
| `--dt-glass`           | `--dt-surface` at 70% opacity | Frosted glass fill       |
| `--dt-glass-border`    | `--dt-text` at 10% opacity    | Glass element border     |
| `--dt-glass-highlight` | `--dt-text` at 5% opacity     | Top edge inset highlight |
| `--dt-shadow-color`    | `--dt-bg` at 40% opacity      | Box-shadow color         |

## Palette Generation Algorithm

### Input

```ts
interface ThemeInput {
  accent: string; // Any CSS color string (hex, rgb, hsl, oklch)
  mode: 'light' | 'dark';
}
```

### Steps

1. **Parse** the accent color into OKLCH channels `(L, C, H)`. Use the `culori` library for parsing and conversion (lightweight, tree-shakeable, supports all CSS color formats).

2. **Generate the neutral scale.** For each step in the scale table, compute:

   ```
   oklch(L_step  C_step  H_accent)
   ```

   Where `L_step` and `C_step` come from the scale table above. The hue is always the accent hue, giving every neutral a subtle tint of the user's chosen color.

3. **Assign semantic tokens.** Map scale steps to semantic tokens based on the mode. Dark mode uses high scale numbers (dark values) for backgrounds and low numbers (light values) for text. Light mode reverses this.

4. **Derive accent variants.** From the original accent `(L_a, C_a, H_a)`:
   - `accent-hover`: `oklch(L_a ± 0.05, C_a, H_a)` — direction depends on mode (darker in light mode, lighter in dark mode).
   - `accent-active`: `oklch(L_a ± 0.10, C_a, H_a)` — same direction, further.
   - `accent-subtle`: `oklch(L_a C_a H_a / 0.15)`
   - `accent-ghost`: `oklch(L_a C_a H_a / 0.08)`

5. **Derive status colors.** For each status hue, compute a base color with:
   - Dark mode: `oklch(0.70 0.18 H_status)`
   - Light mode: `oklch(0.45 0.18 H_status)`
   - Subtle variant: same color at 15% opacity.

6. **Compute text-on-accent.** Check the accent's L value. If L > 0.6, use `scale-950` (dark text). Otherwise use `scale-50` (light text). This ensures WCAG AA contrast on accent-colored buttons.

7. **Serialize** all tokens into a CSS string:
   ```css
   :root {
     --dt-accent: oklch(0.55 0.24 280);
     --dt-bg: oklch(0.12 0.05 280);
     /* ... all tokens ... */
   }
   ```

### Reference Implementation Sketch

```ts
import { converter, formatCss } from 'culori';

const toOklch = converter('oklch');

interface ThemeInput {
  accent: string;
  mode: 'light' | 'dark';
}

function generateThemeCSS(input: ThemeInput): string {
  const oklch = toOklch(input.accent);
  if (!oklch) throw new Error(`Invalid color: ${input.accent}`);

  const { l, c, h = 0 } = oklch;
  const dark = input.mode === 'dark';

  // Scale: [name, lightness, chroma]
  const scale: [string, number, number][] = [
    ['50', 0.98, 0.005],
    ['100', 0.94, 0.01],
    ['150', 0.88, 0.015],
    ['200', 0.8, 0.02],
    ['300', 0.7, 0.025],
    ['400', 0.6, 0.03],
    ['500', 0.5, 0.04],
    ['600', 0.4, 0.03],
    ['700', 0.32, 0.025],
    ['800', 0.24, 0.03],
    ['850', 0.2, 0.035],
    ['900', 0.16, 0.04],
    ['950', 0.12, 0.05],
  ];

  const lines: string[] = [];
  const put = (name: string, value: string) => lines.push(`  ${name}: ${value};`);

  // Layer 1 — primitives
  put('--dt-accent-h', `${h.toFixed(1)}`);
  put('--dt-accent-c', `${c.toFixed(3)}`);
  put('--dt-accent-l', `${l.toFixed(3)}`);

  // Layer 2 — scale
  for (const [name, lv, cv] of scale) {
    put(`--dt-scale-${name}`, `oklch(${lv} ${cv} ${h.toFixed(1)})`);
  }

  // Helper to reference a scale step
  const s = (name: string) => `var(--dt-scale-${name})`;

  // Layer 3 — semantic: background & surface
  put('--dt-bg', dark ? s('950') : s('50'));
  put('--dt-bg-subtle', dark ? s('900') : s('100'));
  put('--dt-surface', dark ? s('850') : s('100'));
  put('--dt-surface-hover', dark ? s('800') : s('150'));
  put('--dt-surface-active', dark ? s('700') : s('200'));

  // ... (remaining semantic mappings follow the same pattern)

  // Accent
  const shift = dark ? 0.05 : -0.05;
  put('--dt-accent', `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`);
  put('--dt-accent-hover', `oklch(${(l + shift).toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`);
  put('--dt-accent-active', `oklch(${(l + shift * 2).toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`);
  put('--dt-accent-subtle', `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)} / 0.15)`);
  put('--dt-accent-ghost', `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)} / 0.08)`);

  // Text on accent
  put('--dt-text-on-accent', l > 0.6 ? s('950') : s('50'));

  return `:root {\n${lines.join('\n')}\n}`;
}
```

This is a sketch — the actual implementation will be a complete module covering all tokens listed in Layer 3.

## Integration with Core

### Startup

1. Core reads `general.theme` (mode) and `general.accentColor` (hex string) from the config. If no accent is set, the default is `#7c6ff7` (the current purple).
2. Core calls `generateThemeCSS({ accent, mode })`.
3. Core injects the result into a `<style id="dt-theme">` element in `<head>`, **before** `global.scss` loads.

### Runtime Theme Change

1. User changes accent or theme in Preferences.
2. Preference MiniApp calls `ctx.config.set('general.accentColor', '#e05070')`.
3. Core receives the change, reruns `generateThemeCSS()`, and replaces the `<style id="dt-theme">` text content.
4. Core broadcasts `config:changed` event. MiniApps do **not** need to react — all colors update automatically via CSS custom properties.

### Config Schema Addition

Add to the Preference settings table:

| Category | Setting      | Type     | Default     | Description                                        |
| -------- | ------------ | -------- | ----------- | -------------------------------------------------- |
| General  | Accent Color | `string` | `"#7c6ff7"` | Primary accent color. Accepts any CSS color value. |

The existing `general.theme` setting (`"light"` / `"dark"`) is unchanged.

## Integration with MiniApps

### Consumption Rules

MiniApps use semantic tokens from Layer 3. They **never**:

- Reference Layer 1 primitives (`--dt-accent-h`, etc.)
- Reference Layer 2 scale tokens (`--dt-scale-*`) directly
- Hardcode color values (hex, rgb, rgba, hsl, oklch literals)
- Use SCSS variables for colors
- Include fallback values in `var()` calls — the tokens are always defined

```css
/* Good */
.card {
  background: var(--dt-surface);
  border: 1px solid var(--dt-border);
  color: var(--dt-text);
}

.card:hover {
  background: var(--dt-surface-hover);
}

.deleteButton {
  background: var(--dt-danger);
  color: var(--dt-text-on-accent);
}

/* Bad */
.card {
  background: #282840;
  background: var(--dt-surface, #282840); /* No fallbacks */
  background: var(--dt-scale-850); /* No scale refs */
}
```

### What If a MiniApp Needs a Color Not in the Token Set?

Use `oklch()` with the primitive channels to derive it:

```css
.specialHighlight {
  /* A lighter, less saturated version of the accent */
  background: oklch(
    calc(var(--dt-accent-l) + 0.2) calc(var(--dt-accent-c) * 0.5) var(--dt-accent-h) / 0.2
  );
}
```

This is the escape hatch. It keeps the color on-hue and mode-aware without introducing a hardcoded value. Layer 1 primitives exist specifically for this purpose.

### SDK Guidance

The `@desktalk/sdk` package should document the token list and provide:

1. A **TypeScript enum or const object** listing all token names for use in inline styles (rare, but sometimes needed for dynamic positioning overlays):

   ```ts
   // @desktalk/sdk
   export const ColorToken = {
     bg: 'var(--dt-bg)',
     surface: 'var(--dt-surface)',
     accent: 'var(--dt-accent)',
     // ...
   } as const;
   ```

2. A **lint rule** (ESLint plugin or stylelint rule) that flags hardcoded color values in `.module.css` / `.module.scss` files within the `packages/` directory.

## Migration Path

The migration from the current system to this one is incremental:

### Phase 1 — Generate and inject

- Implement `generateThemeCSS()` in `@desktalk/core`.
- Inject the generated `<style id="dt-theme">` at startup.
- Keep the existing `global.scss` `:root` block intact. The generated tokens will coexist alongside the old `--color-*` tokens.

### Phase 2 — Migrate core components

- Replace `--color-*` references in core SCSS files with `--dt-*` equivalents.
- Replace SCSS file-scoped color variables (`$panel-border`, `$dock-glass`, etc.) and raw `rgba()` values in `InfoPanel.module.scss` and `Dock.module.scss` with `--dt-*` tokens.
- Replace hardcoded hex values in `WindowChrome.module.scss` and `ActionsBar.module.scss`.

### Phase 3 — Migrate MiniApps

- Replace `var(--color-*, fallback)` patterns in MiniApp CSS with `var(--dt-*)` (no fallback).
- Replace hardcoded priority badge colors in `TodoItem.module.css` with status tokens (`--dt-danger`, `--dt-warning`, `--dt-success`).
- Replace hardcoded colors in `PreferenceApp.module.css`.

### Phase 4 — Remove legacy tokens

- Delete the color-related `--color-*` custom properties from `global.scss`.
- Add the stylelint rule to prevent regressions.
- Remove all `$color` SCSS variables.

### Phase 5 — Light mode

- Verify all components render correctly with `mode: 'light'`.
- Connect the `general.theme` preference to the palette generator.
- No component CSS changes should be needed — it all flows through the same tokens.

## Token Quick Reference

Complete list of all CSS custom properties the system produces. Use this as a checklist during migration.

```
/* Layer 1 — Primitives (escape hatch for MiniApps) */
--dt-accent-h
--dt-accent-c
--dt-accent-l
--dt-mode-sign

/* Layer 2 — Scale (core internal, not for direct use in components) */
--dt-scale-50
--dt-scale-100
--dt-scale-150
--dt-scale-200
--dt-scale-300
--dt-scale-400
--dt-scale-500
--dt-scale-600
--dt-scale-700
--dt-scale-800
--dt-scale-850
--dt-scale-900
--dt-scale-950

/* Layer 3 — Semantic (use these in component CSS) */

/* Background & Surface */
--dt-bg
--dt-bg-subtle
--dt-surface
--dt-surface-hover
--dt-surface-active
--dt-overlay

/* Text */
--dt-text
--dt-text-secondary
--dt-text-muted
--dt-text-on-accent

/* Border */
--dt-border
--dt-border-subtle
--dt-border-strong

/* Accent */
--dt-accent
--dt-accent-hover
--dt-accent-active
--dt-accent-subtle
--dt-accent-ghost

/* Status */
--dt-danger
--dt-danger-subtle
--dt-success
--dt-success-subtle
--dt-warning
--dt-warning-subtle
--dt-info
--dt-info-subtle

/* Shell Chrome */
--dt-dock-bg
--dt-actions-bar-bg
--dt-window-chrome
--dt-window-body
--dt-info-panel-bg
--dt-wallpaper

/* Glass & Shadow */
--dt-glass
--dt-glass-border
--dt-glass-highlight
--dt-shadow-color
```

## Dependencies

| Package  | Purpose                            | Size                                                                |
| -------- | ---------------------------------- | ------------------------------------------------------------------- |
| `culori` | Color parsing and OKLCH conversion | ~12 KB gzipped (tree-shakeable to ~4 KB for just `oklch` + `parse`) |

No other dependencies. The palette generator is a pure function with no DOM dependency — it can run on both server and client.

## Design Decisions

### Wallpaper

The desktop wallpaper is derived from the accent hue as a CSS gradient. The palette generator produces a `--dt-wallpaper` token:

- **Dark mode:** A diagonal gradient using three stops at the accent hue with decreasing lightness and chroma, creating a subtle depth effect:
  ```
  linear-gradient(135deg,
    oklch(0.25 0.08 H) 0%,
    oklch(0.30 0.10 H) 50%,
    oklch(0.40 0.04 H+30) 100%
  )
  ```
- **Light mode:** Same structure with higher lightness values:
  ```
  linear-gradient(135deg,
    oklch(0.85 0.06 H) 0%,
    oklch(0.80 0.08 H) 50%,
    oklch(0.75 0.03 H+30) 100%
  )
  ```

The third stop shifts the hue by +30 degrees to add visual interest without clashing. This replaces the current hardcoded `--desktop-wallpaper` gradient.

In a future iteration, users will be able to set a custom wallpaper image via Preferences, which would override this generated gradient. The config key `general.wallpaper` is reserved for this — when set to a file path or URL, the core uses that image instead of the generated gradient. Until that feature is built, `--dt-wallpaper` is always the generated gradient.

### Third-Party MiniApp Theming

MiniApps must always use the global accent. There is no per-MiniApp color override mechanism. This keeps the desktop visually cohesive — every window, dock icon highlight, and active state uses the same palette. A MiniApp that introduced its own brand color would break the unified feel of the OS-like environment.

### High-Contrast Mode

Deferred. Not part of this design. The two-mode system (light/dark) is sufficient for the current stage. High-contrast can be added later as a third mode value (`'light' | 'dark' | 'high-contrast'`) without changing the token architecture — it would just use a different lightness/chroma mapping in the palette generator.
