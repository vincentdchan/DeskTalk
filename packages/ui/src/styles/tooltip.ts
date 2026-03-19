/**
 * CSS for the tooltip popup element.
 *
 * The popup is appended to `document.body` (outside the shadow root) so it can
 * escape any overflow/clipping ancestor.  Styles reference `--dt-*` custom
 * properties defined on `:root` so the tooltip matches the active DeskTalk
 * theme automatically.
 */

/** Unique class prefix to avoid collisions in the global scope. */
export const CLS = 'dt-tooltip-popup';

/**
 * Inline stylesheet injected once into `<head>` for the body-level popup.
 * Using a `<style>` element rather than inline styles lets us use pseudo-
 * elements (the directional arrow).
 */
export const POPUP_CSS = /* css */ `
.${CLS} {
  position: fixed;
  z-index: 2147483647;
  padding: 6px 10px;
  border-radius: 6px;
  background: color-mix(in oklab, var(--dt-bg) 90%, black);
  box-shadow: 0 4px 12px var(--dt-shadow-color);
  border: 1px solid var(--dt-border);
  color: var(--dt-text);
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}

/* ── Arrow (border + fill trick) ─────────────────────────────────────────── */

.${CLS}::after,
.${CLS}::before {
  content: '';
  position: absolute;
  left: 50%;
}

/* ── top placement (arrow points down) ───────────────────────────────────── */

.${CLS}[data-actual-placement="top"] {
  transform: translateX(-50%);
}
.${CLS}[data-actual-placement="top"]::after {
  bottom: -5px;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid color-mix(in oklab, var(--dt-bg) 90%, black);
  transform: translateX(-50%);
}
.${CLS}[data-actual-placement="top"]::before {
  bottom: -6px;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid var(--dt-border);
  transform: translateX(-50%);
  z-index: -1;
}

/* ── bottom placement (arrow points up) ──────────────────────────────────── */

.${CLS}[data-actual-placement="bottom"] {
  transform: translateX(-50%);
}
.${CLS}[data-actual-placement="bottom"]::after {
  top: -5px;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 5px solid color-mix(in oklab, var(--dt-bg) 90%, black);
  transform: translateX(-50%);
}
.${CLS}[data-actual-placement="bottom"]::before {
  top: -6px;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid var(--dt-border);
  transform: translateX(-50%);
  z-index: -1;
}

/* ── left placement (arrow points right) ─────────────────────────────────── */

.${CLS}[data-actual-placement="left"] {
  transform: translateY(-50%);
}
.${CLS}[data-actual-placement="left"]::after,
.${CLS}[data-actual-placement="left"]::before {
  left: auto;
  top: 50%;
}
.${CLS}[data-actual-placement="left"]::after {
  right: -5px;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 5px solid color-mix(in oklab, var(--dt-bg) 90%, black);
  transform: translateY(-50%);
}
.${CLS}[data-actual-placement="left"]::before {
  right: -6px;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 6px solid var(--dt-border);
  transform: translateY(-50%);
  z-index: -1;
}

/* ── right placement (arrow points left) ─────────────────────────────────── */

.${CLS}[data-actual-placement="right"] {
  transform: translateY(-50%);
}
.${CLS}[data-actual-placement="right"]::after,
.${CLS}[data-actual-placement="right"]::before {
  left: auto;
  top: 50%;
}
.${CLS}[data-actual-placement="right"]::after {
  left: -5px;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-right: 5px solid color-mix(in oklab, var(--dt-bg) 90%, black);
  transform: translateY(-50%);
}
.${CLS}[data-actual-placement="right"]::before {
  left: -6px;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-right: 6px solid var(--dt-border);
  transform: translateY(-50%);
  z-index: -1;
}
`;
