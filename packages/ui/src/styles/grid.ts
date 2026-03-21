/**
 * CSS for the `<dt-grid>` web component.
 *
 * Auto-responsive grid layout. Columns collapse automatically in narrow views.
 * Uses CSS Grid's repeat(auto-fit) pattern with minmax for responsive behavior.
 */

/** Unique class name used inside the shadow root. */
export const GRID_CLS = 'dt-grid-inner';

export const GRID_CSS = /* css */ `
:host {
  display: block;
  margin-bottom: 16px;
}

.${GRID_CLS} {
  display: grid;
  gap: var(--grid-gap, 16px);
  grid-template-columns: repeat(auto-fit, minmax(var(--min-width, 220px), 1fr));
}

:host([cols="1"]) .${GRID_CLS} {
  grid-template-columns: repeat(1, 1fr);
}

:host([cols="2"]) .${GRID_CLS} {
  grid-template-columns: repeat(2, 1fr);
}

:host([cols="3"]) .${GRID_CLS} {
  grid-template-columns: repeat(3, 1fr);
}

:host([cols="4"]) .${GRID_CLS} {
  grid-template-columns: repeat(4, 1fr);
}

:host([cols="5"]) .${GRID_CLS} {
  grid-template-columns: repeat(5, 1fr);
}

:host([cols="6"]) .${GRID_CLS} {
  grid-template-columns: repeat(6, 1fr);
}

/* Responsive: fixed columns collapse to auto-fit below 480px */
@media (max-width: 480px) {
  :host([cols="2"]) .${GRID_CLS},
  :host([cols="3"]) .${GRID_CLS},
  :host([cols="4"]) .${GRID_CLS},
  :host([cols="5"]) .${GRID_CLS},
  :host([cols="6"]) .${GRID_CLS} {
    grid-template-columns: 1fr;
  }
}

/* Gap variants */
:host([gap="0"]) .${GRID_CLS} { --grid-gap: 0; }
:host([gap="4"]) .${GRID_CLS} { --grid-gap: 4px; }
:host([gap="8"]) .${GRID_CLS} { --grid-gap: 8px; }
:host([gap="12"]) .${GRID_CLS} { --grid-gap: 12px; }
:host([gap="16"]) .${GRID_CLS} { --grid-gap: 16px; }
:host([gap="20"]) .${GRID_CLS} { --grid-gap: 20px; }
:host([gap="24"]) .${GRID_CLS} { --grid-gap: 24px; }
:host([gap="32"]) .${GRID_CLS} { --grid-gap: 32px; }

/* Min-width variants for auto-fit mode */
:host([min-width="150"]) .${GRID_CLS} { --min-width: 150px; }
:host([min-width="180"]) .${GRID_CLS} { --min-width: 180px; }
:host([min-width="200"]) .${GRID_CLS} { --min-width: 200px; }
:host([min-width="220"]) .${GRID_CLS} { --min-width: 220px; }
:host([min-width="260"]) .${GRID_CLS} { --min-width: 260px; }
:host([min-width="300"]) .${GRID_CLS} { --min-width: 300px; }

/* Slotted content defaults */
::slotted(*) {
  min-width: 0; /* prevent overflow */
}
`;
