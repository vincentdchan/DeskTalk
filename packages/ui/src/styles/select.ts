/**
 * CSS for the `<dt-select>` web component.
 *
 * The trigger button lives inside the shadow root and uses `:host` selectors.
 * The dropdown menu is appended to `document.body` (to escape overflow
 * clipping), so its styles are injected once into `<head>` as a global
 * stylesheet — the same pattern used by `<dt-tooltip>`.
 *
 * All styles reference `--dt-*` custom properties so the select follows the
 * active DeskTalk theme automatically.
 */

// ── Shadow-scoped styles (trigger button) ──────────────────────────────────

/** Class applied to the trigger button inside the shadow root. */
export const TRIGGER_CLS = 'dt-select-trigger';

/** Class applied to the label span inside the trigger. */
export const LABEL_CLS = 'dt-select-label';

/** Class applied to the chevron span inside the trigger. */
export const CHEVRON_CLS = 'dt-select-chevron';

export const TRIGGER_CSS = /* css */ `
:host {
  display: block;
  width: 100%;
  min-width: 0;
  position: relative;
}

:host([disabled]) .${TRIGGER_CLS} {
  cursor: not-allowed;
  opacity: 0.5;
}

.${TRIGGER_CLS} {
  display: flex;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--dt-border-subtle);
  border-radius: 8px;
  background: color-mix(in oklab, var(--dt-surface) 88%, transparent);
  color: var(--dt-text);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    color 140ms ease;
  user-select: none;
}

.${TRIGGER_CLS}:hover:not([disabled]) {
  border-color: color-mix(in oklab, var(--dt-accent) 35%, var(--dt-border-subtle));
  background: color-mix(in oklab, var(--dt-surface) 94%, var(--dt-accent-ghost));
}

.${TRIGGER_CLS}[aria-expanded="true"] {
  border-color: color-mix(in oklab, var(--dt-accent) 35%, var(--dt-border-subtle));
  background: color-mix(in oklab, var(--dt-surface) 94%, var(--dt-accent-ghost));
}

.${LABEL_CLS} {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.${CHEVRON_CLS} {
  color: var(--dt-text-muted);
  font-size: 11px;
  transition: transform 140ms ease;
}

.${TRIGGER_CLS}[aria-expanded="true"] .${CHEVRON_CLS} {
  transform: rotate(180deg);
}
`;

// ── Global styles (dropdown menu on document.body) ─────────────────────────

/** Class applied to the dropdown menu element. */
export const MENU_CLS = 'dt-select-menu';

/** Class applied to each option element. */
export const OPTION_CLS = 'dt-select-option';

/** Class applied to the active (selected) option. */
export const OPTION_ACTIVE_CLS = 'dt-select-option--active';

export const MENU_CSS = /* css */ `
.${MENU_CLS} {
  position: fixed;
  z-index: 2147483646;
  display: flex;
  min-width: 240px;
  max-width: min(320px, 72vw);
  max-height: 260px;
  flex-direction: column;
  overflow-y: auto;
  border: 1px solid var(--dt-border-subtle);
  border-radius: 10px;
  background: color-mix(in oklab, var(--dt-bg) 92%, var(--dt-surface));
  box-shadow: 0 18px 48px rgb(0 0 0 / 0.22);
  backdrop-filter: blur(18px) saturate(140%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.${MENU_CLS}[data-open] {
  opacity: 1;
  pointer-events: auto;
}

.${OPTION_CLS} {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dt-text-secondary);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease;
  user-select: none;
}

.${OPTION_CLS}:hover {
  background: color-mix(in oklab, var(--dt-accent) 10%, var(--dt-surface));
  color: var(--dt-text);
}

.${OPTION_CLS}.${OPTION_ACTIVE_CLS} {
  background: color-mix(in oklab, var(--dt-accent) 14%, var(--dt-surface));
  color: var(--dt-text);
}

.${OPTION_CLS} span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;
