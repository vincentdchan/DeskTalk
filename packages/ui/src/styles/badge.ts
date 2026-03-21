/**
 * CSS for the `<dt-badge>` web component.
 *
 * Status badge/pill component for inline labels.
 */

/** Unique class name used inside the shadow root. */
export const BADGE_CLS = 'dt-badge-inner';

export const BADGE_CSS = /* css */ `
:host {
  display: inline-flex;
  vertical-align: middle;
}

.${BADGE_CLS} {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.4;
  white-space: nowrap;
}

/* Variant: accent (default) */
:host([variant="accent"]) .${BADGE_CLS},
.${BADGE_CLS} {
  background: var(--dt-accent-subtle);
  color: var(--dt-accent);
}

/* Variant: success */
:host([variant="success"]) .${BADGE_CLS} {
  background: var(--dt-success-subtle);
  color: var(--dt-success);
}

/* Variant: danger */
:host([variant="danger"]) .${BADGE_CLS} {
  background: var(--dt-danger-subtle);
  color: var(--dt-danger);
}

/* Variant: warning */
:host([variant="warning"]) .${BADGE_CLS} {
  background: var(--dt-warning-subtle);
  color: var(--dt-warning);
}

/* Variant: info */
:host([variant="info"]) .${BADGE_CLS} {
  background: var(--dt-info-subtle);
  color: var(--dt-info);
}

/* Variant: default/neutral */
:host([variant="default"]) .${BADGE_CLS},
:host([variant="neutral"]) .${BADGE_CLS} {
  background: var(--dt-surface-hover);
  color: var(--dt-text-secondary);
}

/* Size variants */
:host([size="sm"]) .${BADGE_CLS} {
  padding: 1px 6px;
  font-size: 0.6875rem;
}

:host([size="lg"]) .${BADGE_CLS} {
  padding: 4px 12px;
  font-size: 0.875rem;
}
`;
