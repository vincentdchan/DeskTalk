import badgeCss from './styles/badge.css?raw';

const BADGE_CLS = 'dt-badge-inner';

type BadgeVariant = 'accent' | 'success' | 'danger' | 'warning' | 'info' | 'default' | 'neutral';
type BadgeSize = 'sm' | 'md' | 'lg';

/**
 * `<dt-badge>` — framework-agnostic status badge web component.
 *
 * Inline status pill/badge for labels and indicators.
 *
 * ## Attributes
 * - `variant` — status color: `accent` (default), `success`, `danger`, `warning`, `info`, `neutral`
 * - `size` — size: `sm`, `md` (default), `lg`
 * - `text` — the badge text (alternative to slot)
 *
 * ## Usage
 * ```html
 * <dt-badge>New</dt-badge>
 *
 * <dt-badge variant="success">Active</dt-badge>
 *
 * <dt-badge variant="danger" size="lg">Error</dt-badge>
 *
 * <dt-badge variant="info" size="sm">Beta</dt-badge>
 * ```
 */
export class DtBadge extends HTMLElement {
  // ── Observed attributes ─────────────────────────────────────────────────
  static get observedAttributes(): string[] {
    return ['variant', 'size', 'text'];
  }

  // ── Internal refs ───────────────────────────────────────────────────────
  private _container!: HTMLSpanElement;
  private _slot!: HTMLSlotElement;

  // ── Attribute helpers ───────────────────────────────────────────────────
  get variant(): BadgeVariant {
    const val = this.getAttribute('variant');
    if (
      val === 'success' ||
      val === 'danger' ||
      val === 'warning' ||
      val === 'info' ||
      val === 'default' ||
      val === 'neutral'
    ) {
      return val;
    }
    return 'accent';
  }

  set variant(val: BadgeVariant) {
    this.setAttribute('variant', val);
  }

  get size(): BadgeSize {
    const val = this.getAttribute('size');
    if (val === 'sm' || val === 'lg') return val;
    return 'md';
  }

  set size(val: BadgeSize) {
    this.setAttribute('size', val);
  }

  get text(): string | null {
    return this.getAttribute('text');
  }

  set text(val: string | null) {
    if (val === null) {
      this.removeAttribute('text');
    } else {
      this.setAttribute('text', val);
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = badgeCss;
    shadow.appendChild(style);

    this._container = document.createElement('span');
    this._container.className = BADGE_CLS;

    // If text attribute is set, use it; otherwise use a slot
    const textAttr = this.text;
    if (textAttr !== null) {
      this._container.textContent = textAttr;
    } else {
      this._slot = document.createElement('slot');
      this._container.appendChild(this._slot);
    }

    shadow.appendChild(this._container);
  }

  // ── Updates ─────────────────────────────────────────────────────────────

  attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null): void {
    if (name === 'text') {
      this._render();
    }
  }

  private _render(): void {
    const textAttr = this.text;
    if (textAttr !== null) {
      this._container.textContent = textAttr;
    }
  }
}
