/**
 * CSS for the `<dt-card>` web component.
 *
 * Uses `--dt-*` custom properties so the card follows the active DeskTalk
 * theme automatically. The card has a solid border with the theme accent
 * color and no border-radius, per design spec.
 */

/** Unique class name used inside the shadow root. */
export const CARD_CLS = 'dt-card-inner';

export const CARD_CSS = /* css */ `
:host {
  display: block;
  margin-bottom: 16px;
}

.${CARD_CLS} {
  background: var(--dt-surface);
  border: 1px solid var(--dt-accent);
  border-radius: 4px;
  padding: 20px;
  color: var(--dt-text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  margin-bottom: 12px;
}

:host([variant="outlined"]) .${CARD_CLS} {
  background: transparent;
}

:host([variant="filled"]) .${CARD_CLS} {
  background: var(--dt-accent-subtle);
}

/* ── Slotted heading ─────────────────────────────────────────────────────── */

::slotted(h1),
::slotted(h2),
::slotted(h3),
::slotted(h4),
::slotted(h5),
::slotted(h6) {
  color: var(--dt-text);
  margin: 0 0 8px;
  line-height: 1.3;
}

::slotted(p) {
  color: var(--dt-text-secondary);
  margin: 0 0 8px;
  line-height: 1.6;
}

::slotted(p:last-child) {
  margin-bottom: 0;
}
`;
