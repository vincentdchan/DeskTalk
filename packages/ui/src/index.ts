/**
 * @desktalk/ui — Framework-agnostic web components for the DeskTalk design system.
 *
 * Importing this module registers all custom elements.  The shell loads it once;
 * every miniapp gets the elements for free because they share the same document.
 */

import { DtTooltip } from './dt-tooltip';
import { DtCard } from './dt-card';
import { DtSelect } from './dt-select';
import './ui-elements';

export { DtTooltip, DtCard, DtSelect };

// ── Auto-register ────────────────────────────────────────────────────────────

if (!customElements.get('dt-tooltip')) {
  customElements.define('dt-tooltip', DtTooltip);
}

if (!customElements.get('dt-card')) {
  customElements.define('dt-card', DtCard);
}

if (!customElements.get('dt-select')) {
  customElements.define('dt-select', DtSelect);
}
