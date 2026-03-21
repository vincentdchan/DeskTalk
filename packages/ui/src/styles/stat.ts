/**
 * CSS for the `<dt-stat>` web component.
 *
 * Metric/KPI display component with label, value, and optional description.
 */

/** Unique class name used inside the shadow root. */
export const STAT_CLS = 'dt-stat-inner';

export const STAT_CSS = /* css */ `
:host {
  display: block;
}

.${STAT_CLS} {
  background: var(--dt-surface);
  border: 1px solid var(--dt-accent);
  border-radius: 4px;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.${STAT_CLS} .label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--dt-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.${STAT_CLS} .value {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--dt-text);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.${STAT_CLS} .description {
  font-size: 0.875rem;
  color: var(--dt-text-secondary);
  line-height: 1.4;
}

/* Size variants */
:host([size="sm"]) .${STAT_CLS} .value {
  font-size: 1.25rem;
}

:host([size="sm"]) .${STAT_CLS} {
  padding: 16px;
}

:host([size="lg"]) .${STAT_CLS} .value {
  font-size: 2.25rem;
}

:host([size="lg"]) .${STAT_CLS} {
  padding: 24px;
}

/* Variant: outlined */
:host([variant="outlined"]) .${STAT_CLS} {
  background: transparent;
}

/* Variant: filled */
:host([variant="filled"]) .${STAT_CLS} {
  background: var(--dt-accent-subtle);
  border-color: var(--dt-border);
}

/* Trend indicators */
.${STAT_CLS} .trend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  margin-top: 4px;
}

.${STAT_CLS} .trend.positive {
  color: var(--dt-success);
}

.${STAT_CLS} .trend.negative {
  color: var(--dt-danger);
}

.${STAT_CLS} .trend.neutral {
  color: var(--dt-text-muted);
}
`;
