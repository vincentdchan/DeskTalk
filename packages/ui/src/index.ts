/**
 * @desktalk/ui — Framework-agnostic web components for the DeskTalk design system.
 *
 * Importing this module registers all custom elements.  The shell loads it once;
 * every miniapp gets the elements for free because they share the same document.
 */

import { DtTooltip } from './dt-tooltip';
import './ui-elements';

export { DtTooltip };

// ── Auto-register ────────────────────────────────────────────────────────────

if (!customElements.get('dt-tooltip')) {
  customElements.define('dt-tooltip', DtTooltip);
}
