import { Marked, Renderer } from 'marked';

import type { DtMarkedRenderOptions, DtMarkedRuntime } from './lib/marked-loader';

declare global {
  interface Window {
    __DtMarked?: DtMarkedRuntime;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

function sanitizeUrl(value: string | null | undefined): string {
  if (!value) {
    return '#';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '#';
  }

  const normalized = trimmed.toLowerCase();
  if (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:')
  ) {
    return '#';
  }

  return trimmed;
}

function enhanceRenderedHtml(html: string): string {
  return html
    .replaceAll('<a ', '<a class="dt-md-link" ')
    .replaceAll('<img ', '<img class="dt-md-image" loading="lazy" ')
    .replaceAll('<table>', '<table class="dt-md-table">')
    .replaceAll('<blockquote>', '<blockquote class="dt-md-blockquote">')
    .replaceAll('<pre><code', '<pre class="dt-md-pre"><code');
}

function createRenderer(unsafeHtml: boolean): Renderer {
  const renderer = new Renderer();

  renderer.link = function link(token) {
    return Renderer.prototype.link.call(this, {
      ...token,
      href: sanitizeUrl(token.href),
    });
  };

  renderer.image = function image(token) {
    return Renderer.prototype.image.call(this, {
      ...token,
      href: sanitizeUrl(token.href),
    });
  };

  renderer.code = (token) => {
    const language = token.lang ? ` class="language-${escapeAttribute(token.lang)}"` : '';
    return `<pre class="dt-md-pre"><code${language}>${escapeHtml(token.text)}</code></pre>\n`;
  };

  renderer.codespan = (token) => `<code>${escapeHtml(token.text)}</code>`;

  renderer.html = (token) => (unsafeHtml ? token.text : escapeHtml(token.text));

  return renderer;
}

const safeMarkdown = new Marked({ gfm: true, renderer: createRenderer(false) });
const unsafeMarkdown = new Marked({ gfm: true, renderer: createRenderer(true) });

window.__DtMarked = {
  render(markdown: string, options?: DtMarkedRenderOptions): string {
    const instance = options?.unsafeHtml ? unsafeMarkdown : safeMarkdown;
    return enhanceRenderedHtml(instance.parse(markdown) as string);
  },
};
