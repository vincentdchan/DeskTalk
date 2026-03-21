/**
 * CSS for the `<dt-stack>` web component.
 *
 * Flexbox stack for vertical/horizontal layouts with automatic responsive behavior.
 */

/** Unique class name used inside the shadow root. */
export const STACK_CLS = 'dt-stack-inner';

export const STACK_CSS = /* css */ `
:host {
  display: block;
  margin-bottom: 16px;
}

.${STACK_CLS} {
  display: flex;
  flex-direction: var(--flex-direction, column);
  gap: var(--stack-gap, 16px);
  align-items: var(--align-items, stretch);
}

/* Direction variants */
:host([direction="column"]) .${STACK_CLS} { --flex-direction: column; }
:host([direction="row"]) .${STACK_CLS} { --flex-direction: row; }

/* Gap variants */
:host([gap="0"]) .${STACK_CLS} { --stack-gap: 0; }
:host([gap="4"]) .${STACK_CLS} { --stack-gap: 4px; }
:host([gap="8"]) .${STACK_CLS} { --stack-gap: 8px; }
:host([gap="12"]) .${STACK_CLS} { --stack-gap: 12px; }
:host([gap="16"]) .${STACK_CLS} { --stack-gap: 16px; }
:host([gap="20"]) .${STACK_CLS} { --stack-gap: 20px; }
:host([gap="24"]) .${STACK_CLS} { --stack-gap: 24px; }
:host([gap="32"]) .${STACK_CLS} { --stack-gap: 32px; }

/* Align variants */
:host([align="start"]) .${STACK_CLS} { --align-items: flex-start; }
:host([align="center"]) .${STACK_CLS} { --align-items: center; }
:host([align="end"]) .${STACK_CLS} { --align-items: flex-end; }
:host([align="stretch"]) .${STACK_CLS} { --align-items: stretch; }

/* Responsive: row stacks wrap to column below 480px */
@media (max-width: 480px) {
  :host([direction="row"]) .${STACK_CLS} {
    --flex-direction: column;
  }
}

/* Slotted content defaults */
::slotted(*) {
  min-width: 0; /* prevent overflow in flex items */
}
`;
