import markdownEditorCss from './styles/markdown-editor.css?raw';
import { loadMilkdown } from './lib/milkdown-loader';
import type { DtMilkdownRuntime } from './lib/milkdown-loader';

export interface DtMarkdownEditorChangeDetail {
  value: string;
}

/**
 * `<dt-markdown-editor>` — full WYSIWYG markdown editor powered by Milkdown.
 *
 * The component lazy-loads Milkdown on first use, injects the required editor
 * styles into its shadow root, and exposes a simple `value` property that reads
 * and writes markdown.
 *
 * ## Attributes
 * - `placeholder` — empty-state hint text
 * - `readonly` — when present, disables editing
 *
 * ## Properties
 * - `value` — JS-only markdown value for get/set access
 * - `readonly` — boolean reflection of the `readonly` attribute
 *
 * ## Events
 * - `dt-change` — debounced content updates with `{ value }`
 * - `dt-focus` — fired when the editor gains focus
 * - `dt-blur` — fired when the editor loses focus
 */
export class DtMarkdownEditor extends HTMLElement {
  private readonly _shadow: ShadowRoot;
  private readonly _runtimeStyleAnchor: Comment;
  private readonly _surface: HTMLDivElement;
  private readonly _content: HTMLDivElement;
  private readonly _status: HTMLDivElement;
  private _runtime: DtMilkdownRuntime | null = null;
  private _loadPromise: Promise<DtMilkdownRuntime> | null = null;
  private _editor: import('@milkdown/crepe').Crepe | null = null;
  private _pendingValue = '';
  private _changeTimer: ReturnType<typeof setTimeout> | null = null;
  private _setupToken = 0;
  private _suppressNextChange = false;

  static get observedAttributes(): string[] {
    return ['placeholder', 'readonly'];
  }

  get placeholder(): string {
    return this.getAttribute('placeholder') ?? '';
  }

  set placeholder(value: string) {
    this.setAttribute('placeholder', value);
  }

  get readonly(): boolean {
    return this.hasAttribute('readonly');
  }

  set readonly(value: boolean) {
    this.toggleAttribute('readonly', value);
  }

  get value(): string {
    if (this._editor) {
      this._pendingValue = this._editor.getMarkdown();
    }

    return this._pendingValue;
  }

  set value(value: string) {
    const nextValue = String(value ?? '');
    this._pendingValue = nextValue;

    if (this._editor && this._runtime && this._editor.getMarkdown() !== nextValue) {
      this._suppressNextChange = true;
      this._editor.editor.action(this._runtime.replaceAll(nextValue));
    }
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    this._shadow = shadow;

    const style = document.createElement('style');
    style.textContent = markdownEditorCss;
    shadow.appendChild(style);

    this._runtimeStyleAnchor = document.createComment('runtime-styles');
    shadow.appendChild(this._runtimeStyleAnchor);

    this._surface = document.createElement('div');
    this._surface.className = 'dt-markdown-editor';

    this._content = document.createElement('div');
    this._content.className = 'dt-markdown-editor__surface';

    const mount = document.createElement('div');
    mount.className = 'dt-markdown-editor__content';
    this._content.appendChild(mount);

    this._status = document.createElement('div');
    this._status.className = 'dt-markdown-editor__status';
    this._status.textContent = 'Loading editor';

    this._surface.append(this._content, this._status);
    shadow.appendChild(this._surface);
  }

  connectedCallback(): void {
    void this._initializeEditor();
  }

  disconnectedCallback(): void {
    this._setupToken += 1;
    this._clearChangeTimer();
    void this._destroyEditor();
  }

  attributeChangedCallback(name: string): void {
    if (name === 'readonly') {
      this._editor?.setReadonly(this.readonly);
      return;
    }

    if (name === 'placeholder' && this.isConnected) {
      void this._initializeEditor(true);
    }
  }

  private async _ensureRuntime(): Promise<DtMilkdownRuntime> {
    if (this._runtime) {
      return this._runtime;
    }

    if (!this._loadPromise) {
      this._loadPromise = loadMilkdown().then((runtime) => {
        this._runtime = runtime;
        const anchor = this._runtimeStyleAnchor;
        for (const entry of runtime.cssEntries) {
          const el = document.createElement('style');
          el.dataset.css = entry.name;
          el.textContent = entry.css;
          anchor.parentNode!.insertBefore(el, anchor.nextSibling);
        }
        return runtime;
      });
    }

    return this._loadPromise;
  }

  private async _initializeEditor(force = false): Promise<void> {
    const setupToken = ++this._setupToken;
    this._setStatus('Loading editor');

    if (force) {
      await this._destroyEditor();
    } else if (this._editor) {
      this._setStatus(null);
      return;
    }

    try {
      const runtime = await this._ensureRuntime();
      if (!this.isConnected || setupToken !== this._setupToken) {
        return;
      }

      this._content.replaceChildren();
      const mount = document.createElement('div');
      mount.className = 'dt-markdown-editor__content';
      this._content.appendChild(mount);

      const editor = new runtime.Crepe({
        root: mount,
        defaultValue: this._pendingValue,
        features: {
          [runtime.Crepe.Feature.CodeMirror]: false,
          [runtime.Crepe.Feature.ImageBlock]: false,
          [runtime.Crepe.Feature.Latex]: false,
        },
        featureConfigs: {
          [runtime.Crepe.Feature.Placeholder]: {
            text: this.placeholder,
            mode: 'doc',
          },
        },
      });

      editor.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          this._pendingValue = markdown;
          if (this._suppressNextChange) {
            this._suppressNextChange = false;
            return;
          }
          this._queueChange(markdown);
        });
        listener.focus(() => {
          this.dispatchEvent(new CustomEvent('dt-focus', { bubbles: true, composed: true }));
        });
        listener.blur(() => {
          this.dispatchEvent(new CustomEvent('dt-blur', { bubbles: true, composed: true }));
        });
      });

      await editor.create();

      if (!this.isConnected || setupToken !== this._setupToken) {
        await editor.destroy();
        return;
      }

      this._editor = editor;
      this._editor.setReadonly(this.readonly);
      this._pendingValue = this._editor.getMarkdown();
      this._setStatus(null);
    } catch {
      if (setupToken === this._setupToken) {
        this._setStatus('Failed to load editor');
      }
    }
  }

  private async _destroyEditor(): Promise<void> {
    const editor = this._editor;
    this._editor = null;
    if (!editor) {
      return;
    }

    try {
      await editor.destroy();
    } catch {
      // Ignore teardown errors while the host is disconnecting.
    }
  }

  private _queueChange(markdown: string): void {
    this._clearChangeTimer();
    this._changeTimer = setTimeout(() => {
      this._changeTimer = null;
      this.dispatchEvent(
        new CustomEvent<DtMarkdownEditorChangeDetail>('dt-change', {
          bubbles: true,
          composed: true,
          detail: { value: markdown },
        }),
      );
    }, 300);
  }

  private _clearChangeTimer(): void {
    if (this._changeTimer) {
      clearTimeout(this._changeTimer);
      this._changeTimer = null;
    }
  }

  private _setStatus(message: string | null): void {
    if (message) {
      this._status.hidden = false;
      this._status.textContent = message;
      return;
    }

    this._status.hidden = true;
  }
}
