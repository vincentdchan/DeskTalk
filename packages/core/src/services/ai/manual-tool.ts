import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import { MANUAL_PAGES, MANUAL_PAGE_MAP, type ManualPageMeta } from './manual-pages/index';

const readManualSchema = Type.Object({
  page: Type.Optional(
    Type.String({
      description:
        'Manual page path to read, such as "html/tokens", "html/components/dt-card", or "editing/preview". Omit to list available pages.',
    }),
  ),
});

type ReadManualParams = {
  page?: string;
};

function getManualPagesDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'manual-pages');
}

function renderOverview(): string {
  const groups: { label: string; prefix: string }[] = [
    { label: 'HTML Generation', prefix: 'html/' },
    { label: 'Component Reference', prefix: 'html/components/' },
    { label: 'Desktop', prefix: 'desktop/' },
    { label: 'Editing', prefix: 'editing/' },
  ];

  const lines = ['# DeskTalk Manual', '', 'Available pages:', ''];

  for (const group of groups) {
    const pages = MANUAL_PAGES.filter(
      (page) =>
        page.path.startsWith(group.prefix) &&
        // Avoid listing component pages under the generic html/ group
        (group.prefix === 'html/components/' || !page.path.startsWith('html/components/')),
    );
    if (pages.length === 0) continue;
    lines.push(`## ${group.label}`, '');
    for (const page of pages) {
      lines.push(`- ${page.path} - ${page.description}`);
    }
    lines.push('');
  }

  lines.push('Call `read_manual` with `page` set to one of the paths above.');
  return lines.join('\n');
}

function renderRelated(page: ManualPageMeta): string {
  if (page.related.length === 0) {
    return '';
  }

  const lines = ['', '---', 'Related pages:'];
  for (const relatedPath of page.related) {
    const relatedPage = MANUAL_PAGE_MAP.get(relatedPath);
    if (relatedPage) {
      lines.push(`- ${relatedPage.path} - ${relatedPage.description}`);
    }
  }
  return lines.join('\n');
}

function readPageContent(page: ManualPageMeta): string {
  const filePath = join(getManualPagesDir(), page.file);
  if (!existsSync(filePath)) {
    throw new Error(`Manual page asset is missing: ${page.file}`);
  }

  return `${readFileSync(filePath, 'utf-8').trimEnd()}${renderRelated(page)}`;
}

export function createReadManualTool(): ToolDefinition {
  return {
    name: 'read_manual',
    label: 'Read Manual',
    description:
      'Read a page from the DeskTalk system manual. Covers HTML generation, per-component references (html/components/dt-*), desktop window management, actions, and Preview editing workflows. Call without a page to list available pages.',
    promptSnippet: 'Read the DeskTalk manual for detailed tool usage and system guidelines.',
    promptGuidelines: [
      'Call without params to see the manual table of contents.',
      'Read only the pages needed for the current task instead of loading everything.',
      'For component details, read the per-component page (e.g. "html/components/dt-card") instead of the overview.',
      'Use related page references at the bottom of each page to drill deeper when needed.',
    ],
    parameters: readManualSchema,
    async execute(_toolCallId, params) {
      const input = params as ReadManualParams;
      const pagePath = input.page?.trim();

      if (!pagePath) {
        const content = renderOverview();
        return {
          content: [{ type: 'text', text: content }],
          details: {
            ok: true,
            page: 'overview',
            availablePages: MANUAL_PAGES.map((page) => page.path),
          },
        };
      }

      const page = MANUAL_PAGE_MAP.get(pagePath);
      if (!page) {
        const content = [`Unknown manual page: ${pagePath}`, '', renderOverview()].join('\n');
        return {
          content: [{ type: 'text', text: content }],
          details: {
            ok: false,
            page: pagePath,
            availablePages: MANUAL_PAGES.map((entry) => entry.path),
          },
        };
      }

      const content = readPageContent(page);
      return {
        content: [{ type: 'text', text: content }],
        details: { ok: true, page: page.path, title: page.title, related: page.related },
      };
    },
  };
}
