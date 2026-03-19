/**
 * @desktalk/ui — Framework-agnostic web components for the DeskTalk design system.
 *
 * Importing this module registers all custom elements.  The shell loads it once;
 * every miniapp gets the elements for free because they share the same document.
 */

import { DtTooltip } from './dt-tooltip';

export { DtTooltip };

// ── Auto-register ────────────────────────────────────────────────────────────

if (!customElements.get('dt-tooltip')) {
  customElements.define('dt-tooltip', DtTooltip);
}

// ── JSX global augmentation ──────────────────────────────────────────────────
// Allows <dt-tooltip> to be used in JSX/TSX without type errors.
// React 19 with jsx: "react-jsx" resolves IntrinsicElements from the React
// module namespace, so we augment both the global and React-scoped versions.

type DtTooltipAttributes = Partial<{
  content: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  delay: number | string;
  disabled: boolean;
  class: string;
  style: string | Record<string, string>;
}>;

type DtTooltipJSXProps = DtTooltipAttributes & {
  children?: unknown;
  ref?: unknown;
  key?: string | number | null;
};

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'dt-tooltip': DtTooltipJSXProps;
    }
  }
}
