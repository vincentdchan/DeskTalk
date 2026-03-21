/**
 * CSS for the `<dt-divider>` web component.
 *
 * Horizontal and vertical separator/divider component.
 */

/** Unique class name used inside the shadow root. */
export const DIVIDER_CLS = 'dt-divider-inner';

export const DIVIDER_CSS = /* css */ `
:host {
  display: block;
}

.${DIVIDER_CLS} {
  border: none;
  margin: 0;
  flex-shrink: 0;
}

/* Horizontal (default) */
:host([direction="horizontal"]) .${DIVIDER_CLS},
.${DIVIDER_CLS} {
  width: 100%;
  height: 1px;
  background: var(--dt-border);
}

/* Vertical */
:host([direction="vertical"]) .${DIVIDER_CLS} {
  width: 1px;
  height: 100%;
  min-height: 1em;
  background: var(--dt-border);
}

/* Style variants for horizontal */
:host([direction="horizontal"][style-variant="subtle"]) .${DIVIDER_CLS},
:host([style-variant="subtle"]) .${DIVIDER_CLS} {
  background: var(--dt-border-subtle);
}

:host([direction="horizontal"][style-variant="strong"]) .${DIVIDER_CLS},
:host([style-variant="strong"]) .${DIVIDER_CLS} {
  background: var(--dt-border-strong);
}

/* Style variants for vertical */
:host([direction="vertical"][style-variant="subtle"]) .${DIVIDER_CLS} {
  background: var(--dt-border-subtle);
}

:host([direction="vertical"][style-variant="strong"]) .${DIVIDER_CLS} {
  background: var(--dt-border-strong);
}

/* Spacing for standalone use */
:host([spacing="sm"]) .${DIVIDER_CLS} { margin: 8px 0; }
:host([spacing="md"]) .${DIVIDER_CLS} { margin: 16px 0; }
:host([spacing="lg"]) .${DIVIDER_CLS} { margin: 24px 0; }

:host([direction="vertical"][spacing="sm"]) .${DIVIDER_CLS} { margin: 0 8px; }
:host([direction="vertical"][spacing="md"]) .${DIVIDER_CLS} { margin: 0 16px; }
:host([direction="vertical"][spacing="lg"]) .${DIVIDER_CLS} { margin: 0 24px; }
`;
