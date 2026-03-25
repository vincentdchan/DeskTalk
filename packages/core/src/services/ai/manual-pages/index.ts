export interface ManualPageMeta {
  path: string;
  title: string;
  description: string;
  file: string;
  related: string[];
}

export const MANUAL_PAGES: ManualPageMeta[] = [
  {
    path: 'html/tokens',
    title: 'HTML Tokens',
    description: 'Semantic --dt-* CSS properties for colors, surfaces, borders, and status.',
    file: 'html-tokens.md',
    related: ['html/components', 'html/layouts', 'html/examples'],
  },
  {
    path: 'html/components',
    title: 'HTML Components',
    description:
      'Overview of all DeskTalk web components, auto-injected assets, typography, and utility classes.',
    file: 'html-components.md',
    related: ['html/tokens', 'html/layouts', 'html/examples'],
  },
  {
    path: 'html/layouts',
    title: 'HTML Layouts',
    description: 'Rules for dt-card usage, allowed layout divs, and document structure.',
    file: 'html-layouts.md',
    related: ['html/tokens', 'html/components', 'html/examples'],
  },
  {
    path: 'html/bridge',
    title: 'HTML Bridge',
    description:
      'window.DeskTalk APIs for reading state, making HTTP requests, and running constrained commands.',
    file: 'html-bridge.md',
    related: [
      'html/components',
      'html/storage',
      'html/actions',
      'desktop/windows',
      'desktop/actions',
    ],
  },
  {
    path: 'html/actions',
    title: 'LiveApp Actions',
    description: 'Register LiveApp actions that the AI can invoke from the focused Preview window.',
    file: 'html-actions.md',
    related: ['html/bridge', 'html/storage', 'desktop/actions'],
  },
  {
    path: 'html/storage',
    title: 'HTML Storage',
    description: 'How LiveApps persist data with DeskTalk.storage KV and collections.',
    file: 'html-storage.md',
    related: ['html/bridge', 'html/actions', 'html/examples', 'editing/preview'],
  },
  {
    path: 'html/examples',
    title: 'HTML Examples',
    description:
      'Multi-component full-page examples showing valid DeskTalk preview structure and styling.',
    file: 'html-examples.md',
    related: ['html/tokens', 'html/components', 'html/layouts', 'html/bridge', 'html/storage'],
  },

  // ── Per-component pages ──────────────────────────────────────────────

  {
    path: 'html/components/dt-card',
    title: 'dt-card',
    description: 'Visually grouped content container with variant styles.',
    file: 'dt-card.md',
    related: ['html/components', 'html/layouts', 'html/components/dt-grid'],
  },
  {
    path: 'html/components/dt-tooltip',
    title: 'dt-tooltip',
    description: 'Hover or focus hint tooltip for interactive elements.',
    file: 'dt-tooltip.md',
    related: ['html/components', 'html/components/dt-button'],
  },
  {
    path: 'html/components/dt-select',
    title: 'dt-select',
    description: 'Dropdown select component.',
    file: 'dt-select.md',
    related: ['html/components', 'html/components/dt-button'],
  },
  {
    path: 'html/components/dt-grid',
    title: 'dt-grid',
    description: 'Auto-responsive grid layout with configurable columns and gap.',
    file: 'dt-grid.md',
    related: ['html/components', 'html/layouts', 'html/components/dt-stack'],
  },
  {
    path: 'html/components/dt-stack',
    title: 'dt-stack',
    description: 'Flexbox stack for vertical or horizontal layouts.',
    file: 'dt-stack.md',
    related: ['html/components', 'html/layouts', 'html/components/dt-grid'],
  },
  {
    path: 'html/components/dt-stat',
    title: 'dt-stat',
    description: 'Metric/KPI display with label, value, trend, and description.',
    file: 'dt-stat.md',
    related: ['html/components', 'html/components/dt-grid', 'html/components/dt-card'],
  },
  {
    path: 'html/components/dt-badge',
    title: 'dt-badge',
    description: 'Inline status pill/badge with variant colors.',
    file: 'dt-badge.md',
    related: ['html/components', 'html/components/dt-button'],
  },
  {
    path: 'html/components/dt-divider',
    title: 'dt-divider',
    description: 'Horizontal or vertical separator line.',
    file: 'dt-divider.md',
    related: ['html/components', 'html/components/dt-stack'],
  },
  {
    path: 'html/components/dt-list-view',
    title: 'dt-list-view',
    description: 'Virtualized list for long collections with templates.',
    file: 'dt-list-view.md',
    related: ['html/components', 'html/components/dt-table-view', 'html/components/dt-card'],
  },
  {
    path: 'html/components/dt-table-view',
    title: 'dt-table-view',
    description: 'Virtualized table for structured row/column data with sorting.',
    file: 'dt-table-view.md',
    related: ['html/components', 'html/components/dt-list-view', 'html/components/dt-card'],
  },
  {
    path: 'html/components/dt-chart',
    title: 'dt-chart',
    description: 'Interactive Chart.js chart with declarative dt-dataset children.',
    file: 'dt-chart.md',
    related: ['html/components', 'html/components/dt-card', 'html/components/dt-grid'],
  },
  {
    path: 'html/components/dt-markdown',
    title: 'dt-markdown',
    description: 'Themed markdown renderer for rich text and documentation.',
    file: 'dt-markdown.md',
    related: ['html/components', 'html/components/dt-markdown-editor', 'html/components/dt-card'],
  },
  {
    path: 'html/components/dt-markdown-editor',
    title: 'dt-markdown-editor',
    description: 'WYSIWYG markdown editor powered by Milkdown.',
    file: 'dt-markdown-editor.md',
    related: ['html/components', 'html/components/dt-markdown', 'html/storage'],
  },
  {
    path: 'html/components/dt-button',
    title: 'dt-button',
    description: 'Themed button component with variant and size options.',
    file: 'dt-button.md',
    related: ['html/components', 'html/components/dt-stack'],
  },

  // ── Desktop & editing pages ──────────────────────────────────────────

  {
    path: 'desktop/windows',
    title: 'Desktop Windows',
    description: 'How to list windows, open MiniApps, focus windows, and manage desktop state.',
    file: 'desktop-windows.md',
    related: ['desktop/actions', 'editing/preview'],
  },
  {
    path: 'desktop/actions',
    title: 'Desktop Actions',
    description: 'How to use the action tool with the Desktop Context block and window actions.',
    file: 'desktop-actions.md',
    related: ['desktop/windows', 'html/actions', 'editing/preview'],
  },
  {
    path: 'editing/preview',
    title: 'Preview Editing',
    description: 'The exact Get State -> read -> edit workflow for updating existing Preview HTML.',
    file: 'editing-preview.md',
    related: [
      'desktop/actions',
      'desktop/windows',
      'html/layouts',
      'html/examples',
      'html/storage',
    ],
  },
];

export const MANUAL_PAGE_MAP = new Map(MANUAL_PAGES.map((page) => [page.path, page]));
