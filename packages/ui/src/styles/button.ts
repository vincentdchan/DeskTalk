/**
 * CSS for the `<dt-button>` web component.
 *
 * Themed button component with multiple variants and sizes.
 */

/** Unique class name used inside the shadow root. */
export const BUTTON_CLS = 'dt-button-inner';

export const BUTTON_CSS = /* css */ `
:host {
  display: inline-flex;
  vertical-align: middle;
}

.${BUTTON_CLS} {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.4;
  cursor: pointer;
  transition: all 0.15s ease;
  background: var(--dt-accent);
  color: var(--dt-text-on-accent);
}

.${BUTTON_CLS}:hover:not(:disabled) {
  background: var(--dt-accent-hover);
}

.${BUTTON_CLS}:active:not(:disabled) {
  background: var(--dt-accent-active);
}

.${BUTTON_CLS}:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Variant: primary (default) */
:host([variant="primary"]) .${BUTTON_CLS},
.${BUTTON_CLS} {
  background: var(--dt-accent);
  color: var(--dt-text-on-accent);
  border-color: transparent;
}

/* Variant: secondary */
:host([variant="secondary"]) .${BUTTON_CLS} {
  background: var(--dt-surface);
  color: var(--dt-text);
  border-color: var(--dt-border);
}

:host([variant="secondary"]) .${BUTTON_CLS}:hover:not(:disabled) {
  background: var(--dt-surface-hover);
}

:host([variant="secondary"]) .${BUTTON_CLS}:active:not(:disabled) {
  background: var(--dt-surface-active);
}

/* Variant: ghost */
:host([variant="ghost"]) .${BUTTON_CLS} {
  background: transparent;
  color: var(--dt-text-secondary);
  border-color: transparent;
}

:host([variant="ghost"]) .${BUTTON_CLS}:hover:not(:disabled) {
  background: var(--dt-accent-ghost);
  color: var(--dt-text);
}

:host([variant="ghost"]) .${BUTTON_CLS}:active:not(:disabled) {
  background: var(--dt-accent-subtle);
}

/* Variant: danger */
:host([variant="danger"]) .${BUTTON_CLS} {
  background: var(--dt-danger);
  color: var(--dt-text-on-accent);
  border-color: transparent;
}

:host([variant="danger"]) .${BUTTON_CLS}:hover:not(:disabled) {
  filter: brightness(1.1);
}

:host([variant="danger"]) .${BUTTON_CLS}:active:not(:disabled) {
  filter: brightness(0.9);
}

/* Size: sm */
:host([size="sm"]) .${BUTTON_CLS} {
  padding: 4px 12px;
  font-size: 0.8125rem;
}

/* Size: lg */
:host([size="lg"]) .${BUTTON_CLS} {
  padding: 12px 24px;
  font-size: 1rem;
}

/* Full width */
:host([fullwidth]) .${BUTTON_CLS} {
  width: 100%;
}

/* Slotted icon */
::slotted([slot="icon"]) {
  display: inline-flex;
  width: 1em;
  height: 1em;
}
`;
