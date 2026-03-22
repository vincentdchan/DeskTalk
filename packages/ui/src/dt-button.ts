import buttonCss from './styles/button.css?raw';

const BUTTON_CLS = 'dt-button-inner';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * `<dt-button>` — framework-agnostic button web component.
 *
 * Themed button with multiple variants and sizes. Automatically styles to match
 * the DeskTalk design system using CSS custom properties.
 *
 * ## Attributes
 * - `variant` — button style: `primary` (default), `secondary`, `ghost`, `danger`
 * - `size` — button size: `sm`, `md` (default), `lg`
 * - `disabled` — disables the button
 * - `fullwidth` — makes the button fill its container width
 * - `type` — HTML button type: `button` (default), `submit`, `reset`
 *
 * ## Slots
 * - default — button content (text, icons, etc.)
 * - `icon` — icon element positioned before the content
 *
 * ## Usage
 * ```html
 * <dt-button>Save</dt-button>
 *
 * <dt-button variant="secondary">Cancel</dt-button>
 *
 * <dt-button variant="danger" size="sm">Delete</dt-button>
 *
 * <dt-button variant="ghost" disabled>Disabled</dt-button>
 *
 * <dt-button fullwidth>Full Width Button</dt-button>
 * ```
 */
export class DtButton extends HTMLElement {
  // ── Observed attributes ─────────────────────────────────────────────────
  static get observedAttributes(): string[] {
    return ['variant', 'size', 'disabled', 'fullwidth', 'type'];
  }

  // ── Internal refs ───────────────────────────────────────────────────────
  private _button!: HTMLButtonElement;
  private _slot!: HTMLSlotElement;

  // ── Attribute helpers ───────────────────────────────────────────────────
  get variant(): ButtonVariant {
    const val = this.getAttribute('variant');
    if (val === 'secondary' || val === 'ghost' || val === 'danger') return val;
    return 'primary';
  }

  set variant(val: ButtonVariant) {
    this.setAttribute('variant', val);
  }

  get size(): ButtonSize {
    const val = this.getAttribute('size');
    if (val === 'sm' || val === 'lg') return val;
    return 'md';
  }

  set size(val: ButtonSize) {
    this.setAttribute('size', val);
  }

  get disabled(): boolean {
    return this.hasAttribute('disabled');
  }

  set disabled(val: boolean) {
    if (val) {
      this.setAttribute('disabled', '');
    } else {
      this.removeAttribute('disabled');
    }
  }

  get fullwidth(): boolean {
    return this.hasAttribute('fullwidth');
  }

  set fullwidth(val: boolean) {
    if (val) {
      this.setAttribute('fullwidth', '');
    } else {
      this.removeAttribute('fullwidth');
    }
  }

  get type(): 'button' | 'submit' | 'reset' {
    const val = this.getAttribute('type');
    if (val === 'submit' || val === 'reset') return val;
    return 'button';
  }

  set type(val: 'button' | 'submit' | 'reset') {
    this.setAttribute('type', val);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = buttonCss;
    shadow.appendChild(style);

    this._button = document.createElement('button');
    this._button.className = BUTTON_CLS;
    this._button.type = this.type;
    this._button.disabled = this.disabled;

    this._slot = document.createElement('slot');
    this._button.appendChild(this._slot);

    shadow.appendChild(this._button);
  }

  // ── Updates ─────────────────────────────────────────────────────────────

  attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null): void {
    switch (name) {
      case 'disabled':
        this._button.disabled = this.disabled;
        break;
      case 'type':
        this._button.type = this.type;
        break;
    }
  }
}
