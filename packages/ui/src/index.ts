/**
 * @desktalk/ui — Framework-agnostic web components for the DeskTalk design system.
 *
 * Importing this module registers all custom elements.  The shell loads it once;
 * every miniapp gets the elements for free because they share the same document.
 */

import { DtTooltip } from './dt-tooltip';
import { DtCard } from './dt-card';
import { DtSelect } from './dt-select';
import { DtGrid } from './dt-grid';
import { DtStack } from './dt-stack';
import { DtStat } from './dt-stat';
import { DtBadge } from './dt-badge';
import { DtButton } from './dt-button';
import { DtDivider } from './dt-divider';
import { DtColumn, DtTableView } from './dt-table-view';
import { DtListView } from './dt-list-view';
import { DtMarkdown } from './dt-markdown';
import { DtMarkdownEditor } from './dt-markdown-editor';
import './ui-elements';

export {
  DtTooltip,
  DtCard,
  DtSelect,
  DtGrid,
  DtStack,
  DtStat,
  DtBadge,
  DtButton,
  DtDivider,
  DtListView,
  DtTableView,
  DtColumn,
  DtMarkdown,
  DtMarkdownEditor,
};

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

if (!customElements.get('dt-grid')) {
  customElements.define('dt-grid', DtGrid);
}

if (!customElements.get('dt-stack')) {
  customElements.define('dt-stack', DtStack);
}

if (!customElements.get('dt-stat')) {
  customElements.define('dt-stat', DtStat);
}

if (!customElements.get('dt-badge')) {
  customElements.define('dt-badge', DtBadge);
}

if (!customElements.get('dt-button')) {
  customElements.define('dt-button', DtButton);
}

if (!customElements.get('dt-divider')) {
  customElements.define('dt-divider', DtDivider);
}

if (!customElements.get('dt-list-view')) {
  customElements.define('dt-list-view', DtListView);
}

if (!customElements.get('dt-table-view')) {
  customElements.define('dt-table-view', DtTableView);
}

if (!customElements.get('dt-column')) {
  customElements.define('dt-column', DtColumn);
}

if (!customElements.get('dt-markdown')) {
  customElements.define('dt-markdown', DtMarkdown);
}

if (!customElements.get('dt-markdown-editor')) {
  customElements.define('dt-markdown-editor', DtMarkdownEditor);
}
