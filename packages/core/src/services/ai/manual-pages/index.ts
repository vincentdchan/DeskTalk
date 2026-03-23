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
    description: 'DeskTalk web components, injected utilities, and pre-styled typography rules.',
    file: 'html-components.md',
    related: ['html/tokens', 'html/layouts', 'html/bridge', 'html/examples'],
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
    description: 'window.DeskTalk APIs for reading state and running constrained commands.',
    file: 'html-bridge.md',
    related: ['html/components', 'html/storage', 'desktop/windows', 'desktop/actions'],
  },
  {
    path: 'html/storage',
    title: 'HTML Storage',
    description: 'How LiveApps persist data with DeskTalk.storage KV and collections.',
    file: 'html-storage.md',
    related: ['html/bridge', 'html/examples', 'editing/preview'],
  },
  {
    path: 'html/examples',
    title: 'HTML Examples',
    description: 'Complete examples showing valid DeskTalk preview structure and styling.',
    file: 'html-examples.md',
    related: ['html/tokens', 'html/components', 'html/layouts', 'html/bridge', 'html/storage'],
  },
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
    related: ['desktop/windows', 'editing/preview'],
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
