import markdownCss from './styles/markdown.css?raw';
import { loadMarked } from './lib/marked-loader';
import type { DtMarkedRuntime } from './lib/marked-loader';

export interface DtMarkdownLinkClickDetail {
  href: string;
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll('\r\n', '\n');
}

function dedentBlock(value: string): string {
  const lines = normalizeLineEndings(value).split('\n');

  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }

  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;

  if (minIndent === 0) {
    return lines.join('\n');
  }

  return lines.map((line) => line.slice(minIndent)).join('\n');
}

function closeStreamingBlocks(value: string): string {
  const normalized = normalizeLineEndings(value);
  const fenceCount = (normalized.match(/(^|\n)(```|~~~)/g) ?? []).length;
  if (fenceCount % 2 === 0) {
    return normalized;
  }

  const closingFence = normalized.includes('~~~') && !normalized.includes('```') ? '~~~' : '```';
  return `${normalized}\n${closingFence}`;
}

/**
 * `<dt-markdown>` — themed markdown renderer for LiveApps.
 *
 * Markdown can be provided either inline between the tags or through the JS-only
 * `content` property. When `streaming` is present the component appends a live
 * caret and performs lightweight fence balancing for incomplete code blocks.
 *
 * ## Attributes
 * - `streaming` — when present, shows a blinking caret for in-progress content
 * - `unsafe-html` — when present, allows raw HTML in the markdown source
 *
 * ## Properties
 * - `content` — JS-only markdown source; overrides inline light-DOM text
 * - `streaming` — boolean reflection of the `streaming` attribute
 *
 * ## Events
 * - `dt-link-click` — fired with `{ href }` when a rendered link is activated
 */
export class DtMarkdown extends HTMLElement {
  private readonly _body: HTMLDivElement;
  private readonly _caret: HTMLSpanElement;
  private _contentOverride: string | null = null;
  private _runtime: DtMarkedRuntime | null = null;
  private _loadPromise: Promise<DtMarkedRuntime> | null = null;
  private _observer: MutationObserver | null = null;
  private _renderFrame = 0;

  static get observedAttributes(): string[] {
    return ['streaming', 'unsafe-html'];
  }

  get content(): string {
    return this._contentOverride ?? this._readInlineMarkdown();
  }

  set content(value: string) {
    this._contentOverride = String(value ?? '');
    this._scheduleRender();
  }

  get streaming(): boolean {
    return this.hasAttribute('streaming');
  }

  set streaming(value: boolean) {
    this.toggleAttribute('streaming', value);
  }

  get unsafeHtml(): boolean {
    return this.hasAttribute('unsafe-html');
  }

  set unsafeHtml(value: boolean) {
    this.toggleAttribute('unsafe-html', value);
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = markdownCss;
    shadow.appendChild(style);

    this._body = document.createElement('div');
    this._body.className = 'dt-markdown';
    this._body.addEventListener('click', this._onLinkClick);

    this._caret = document.createElement('span');
    this._caret.className = 'dt-markdown__caret';
    this._caret.textContent = '▌';
    this._caret.hidden = true;

    shadow.append(this._body, this._caret);
  }

  connectedCallback(): void {
    if (!this._observer) {
      this._observer = new MutationObserver(() => {
        if (this._contentOverride === null) {
          this._scheduleRender();
        }
      });

      this._observer.observe(this, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    void this._ensureRuntime();
    this._scheduleRender();
  }

  disconnectedCallback(): void {
    this._observer?.disconnect();
    this._observer = null;
    if (this._renderFrame !== 0) {
      cancelAnimationFrame(this._renderFrame);
      this._renderFrame = 0;
    }
  }

  attributeChangedCallback(): void {
    this._scheduleRender();
  }

  private _onLinkClick = (event: Event): void => {
    const path = event.composedPath();
    const anchor = path.find((entry) => entry instanceof HTMLAnchorElement) as
      | HTMLAnchorElement
      | undefined;
    if (!anchor) {
      return;
    }

    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent<DtMarkdownLinkClickDetail>('dt-link-click', {
        bubbles: true,
        composed: true,
        detail: { href: anchor.getAttribute('href') ?? '#' },
      }),
    );
  };

  private _readInlineMarkdown(): string {
    return dedentBlock(this.textContent ?? '');
  }

  private _scheduleRender(): void {
    if (this._renderFrame !== 0) {
      return;
    }

    this._renderFrame = requestAnimationFrame(() => {
      this._renderFrame = 0;
      void this._render();
    });
  }

  private async _ensureRuntime(): Promise<DtMarkedRuntime> {
    if (this._runtime) {
      return this._runtime;
    }

    if (!this._loadPromise) {
      this._loadPromise = loadMarked().then((runtime) => {
        this._runtime = runtime;
        return runtime;
      });
    }

    return this._loadPromise;
  }

  private async _render(): Promise<void> {
    const runtime = await this._ensureRuntime();
    let markdown = this.content;

    if (this.streaming) {
      markdown = closeStreamingBlocks(markdown);
    }

    this._body.innerHTML = runtime.render(markdown, {
      unsafeHtml: this.unsafeHtml,
    });
    this._caret.hidden = !this.streaming;
  }
}
