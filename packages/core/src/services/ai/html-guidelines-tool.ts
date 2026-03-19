import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

const readHtmlGuidelinesSchema = Type.Object({});

const HTML_GUIDELINES = [
  '# DeskTalk HTML Guidelines',
  '',
  'Use these rules before calling `generate_html`.',
  '',
  '## Required',
  '- Use semantic `--dt-*` CSS custom properties for all colors.',
  '- Never hardcode hex, rgb, rgba, hsl, or oklch values.',
  '- Provide a complete HTML document with `<html>`, `<head>`, and `<body>`.',
  '- Inline CSS and JavaScript; do not reference external files or CDNs unless explicitly needed.',
  '',
  '## Semantic Tokens',
  '- Backgrounds: `--dt-bg`, `--dt-bg-subtle`, `--dt-surface`, `--dt-surface-hover`, `--dt-surface-active`',
  '- Text: `--dt-text`, `--dt-text-secondary`, `--dt-text-muted`, `--dt-text-on-accent`',
  '- Borders: `--dt-border`, `--dt-border-subtle`, `--dt-border-strong`',
  '- Accent: `--dt-accent`, `--dt-accent-hover`, `--dt-accent-active`, `--dt-accent-subtle`, `--dt-accent-ghost`',
  '- Status: `--dt-danger`, `--dt-danger-subtle`, `--dt-success`, `--dt-success-subtle`, `--dt-warning`, `--dt-warning-subtle`, `--dt-info`, `--dt-info-subtle`',
  '- Effects: `--dt-overlay`, `--dt-glass`, `--dt-shadow-color`',
  '',
  '## Auto-Injected Styles',
  '- A `<style data-dt-theme>` block is injected automatically at execution time.',
  "- That injected style contains the full DeskTalk `:root { --dt-* }` token set for the user's current accent color and theme mode.",
  '- It also contains a base stylesheet for `body`, headings, links, tables, cards, buttons, badges, `code`, and `pre`.',
  '- A `window.DeskTalk` bridge is also injected automatically for generated HTML previews.',
  '- `await DeskTalk.getState(selector)` supports: `desktop.summary`, `desktop.windows`, `desktop.focusedWindow`, `theme.current`, and `preview.context`.',
  '- `await DeskTalk.exec(program, args, options)` runs a non-interactive command with `shell: false`, a workspace-scoped cwd, output limits, and timeouts.',
  '- Commands on the dangerous list such as `rm`, `chmod`, `sudo`, `kill`, or destructive `git` subcommands trigger a native confirmation dialog before execution.',
  '- Catastrophic commands such as filesystem formatting or `rm` against `/` are blocked outright.',
  '- Available utility classes: `.card`, `.badge`, `.badge-danger`, `.badge-success`, `.badge-warning`, `.badge-info`, `.btn`, `.text-muted`, `.text-secondary`, `.accent-bg`.',
  '- Prefer those semantic tokens and utility classes over custom color literals or one-off palette definitions.',
  '',
  '## Bridge Examples',
  '```html',
  '<script>',
  '  async function loadDesktopState() {',
  "    const desktop = await window.DeskTalk.getState('desktop.summary');",
  '    console.log(desktop.windows);',
  '  }',
  '',
  '  async function runSafeCommand() {',
  "    const result = await window.DeskTalk.exec('git', ['status', '--short']);",
  '    console.log(result.stdout);',
  '  }',
  '</script>',
  '```',
  '',
  '## Example',
  '```html',
  '<div class="card">',
  '  <h2 style="color: var(--dt-text);">Title</h2>',
  '  <p class="text-secondary">Description</p>',
  '  <button class="btn">Action</button>',
  '</div>',
  '```',
].join('\n');

export function createReadHtmlGuidelinesTool(): ToolDefinition {
  return {
    name: 'read_html_guidelines',
    label: 'Read HTML Guidelines',
    description:
      'Read the detailed DeskTalk HTML styling rules for generate_html, including allowed color tokens, injected classes, and examples.',
    promptSnippet: 'Read detailed styling rules before using generate_html.',
    parameters: readHtmlGuidelinesSchema,
    async execute() {
      return {
        content: [{ type: 'text', text: HTML_GUIDELINES }],
        details: { ok: true },
      };
    },
  };
}
