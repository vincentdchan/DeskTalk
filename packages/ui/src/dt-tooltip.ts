import tooltipCss from './styles/tooltip.css?raw';

const CLS = 'dt-tooltip-popup';

type Placement = 'top' | 'bottom' | 'left' | 'right';

const ARROW_GAP = 8; // px gap between trigger and tooltip

/** Ensure the shared popup stylesheet is injected exactly once. */
let styleInjected = false;
function ensureStyles(): void {
  if (styleInjected) return;
  const style = document.createElement('style');
  style.setAttribute('data-dt-tooltip', '');
  style.textContent = tooltipCss;
  document.head.appendChild(style);
  styleInjected = true;
}

/**
 * `<dt-tooltip>` — framework-agnostic tooltip web component.
 *
 * Uses Shadow DOM with a `<slot>` for the trigger element.  The tooltip popup
 * is appended to `document.body` so it can escape overflow/clip ancestors.
 *
 * ## Attributes
 * - `content`   — tooltip text (required)
 * - `placement` — preferred side: top | bottom | left | right (default "top")
 * - `delay`     — show delay in milliseconds (default 0)
 * - `disabled`  — when present, tooltip is suppressed
 *
 * ## Usage
 * ```html
 * <dt-tooltip content="Save file" placement="top">
 *   <button>Save</button>
 * </dt-tooltip>
 * ```
 */
export class DtTooltip extends HTMLElement {
  // ── Private state ───────────────────────────────────────────────────────
  private _popup: HTMLDivElement | null = null;
  private _showTimeout: ReturnType<typeof setTimeout> | null = null;
  private _tooltipId = '';
  private _visible = false;

  // ── Observed attributes ─────────────────────────────────────────────────
  static get observedAttributes(): string[] {
    return ['content', 'placement', 'delay', 'disabled'];
  }

  // ── Attribute helpers (getters + setters so frameworks can set props) ───
  get content(): string {
    return this.getAttribute('content') ?? '';
  }
  set content(val: string) {
    this.setAttribute('content', val);
  }

  get placement(): Placement {
    const val = this.getAttribute('placement');
    if (val === 'bottom' || val === 'left' || val === 'right') return val;
    return 'top';
  }
  set placement(val: Placement) {
    this.setAttribute('placement', val);
  }

  get delay(): number {
    const val = Number(this.getAttribute('delay'));
    return Number.isFinite(val) && val > 0 ? val : 0;
  }
  set delay(val: number | string) {
    this.setAttribute('delay', String(val));
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

  // ── Lifecycle ───────────────────────────────────────────────────────────

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<slot></slot>';

    this._tooltipId = `dt-tip-${Math.random().toString(36).slice(2, 9)}`;
  }

  connectedCallback(): void {
    ensureStyles();

    this.addEventListener('mouseenter', this._onEnter);
    this.addEventListener('mouseleave', this._onLeave);
    this.addEventListener('focusin', this._onEnter);
    this.addEventListener('focusout', this._onLeave);
  }

  disconnectedCallback(): void {
    this.removeEventListener('mouseenter', this._onEnter);
    this.removeEventListener('mouseleave', this._onLeave);
    this.removeEventListener('focusin', this._onEnter);
    this.removeEventListener('focusout', this._onLeave);
    this._hide();
  }

  attributeChangedCallback(name: string, _old: string | null, _next: string | null): void {
    if (name === 'disabled' && this.disabled) {
      this._hide();
    }
    if (name === 'content' && this._popup) {
      this._popup.textContent = this.content;
    }
  }

  // ── Event handlers (arrow functions for stable `this`) ──────────────────

  private _onEnter = (): void => {
    if (this.disabled || !this.content) return;

    if (this._showTimeout !== null) clearTimeout(this._showTimeout);

    const show = (): void => {
      this._createPopup();
      this._position();
      this._visible = true;
    };

    if (this.delay > 0) {
      this._showTimeout = setTimeout(show, this.delay);
    } else {
      show();
    }
  };

  private _onLeave = (): void => {
    this._hide();
  };

  // ── Popup management ────────────────────────────────────────────────────

  private _createPopup(): void {
    if (this._popup) return;

    const popup = document.createElement('div');
    popup.className = CLS;
    popup.id = this._tooltipId;
    popup.setAttribute('role', 'tooltip');
    popup.textContent = this.content;
    document.body.appendChild(popup);
    this._popup = popup;

    // Wire ARIA on the first slotted child (the logical trigger)
    const trigger = this._getTrigger();
    if (trigger) {
      trigger.setAttribute('aria-describedby', this._tooltipId);
    }
  }

  private _hide(): void {
    if (this._showTimeout !== null) {
      clearTimeout(this._showTimeout);
      this._showTimeout = null;
    }
    if (this._popup) {
      // Remove ARIA from trigger
      const trigger = this._getTrigger();
      if (trigger) {
        trigger.removeAttribute('aria-describedby');
      }

      this._popup.remove();
      this._popup = null;
      this._visible = false;
    }
  }

  private _getTrigger(): Element | null {
    // First slotted child, or fall back to the host element itself
    const slot = this.shadowRoot?.querySelector('slot');
    const assigned = slot?.assignedElements();
    return assigned && assigned.length > 0 ? assigned[0] : null;
  }

  // ── Positioning with flip logic ─────────────────────────────────────────

  private _position(): void {
    const popup = this._popup;
    if (!popup) return;

    const triggerRect = this.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let actual = this.placement;

    // Flip if not enough space on the preferred side
    if (actual === 'top' && triggerRect.top - popupRect.height - ARROW_GAP < 0) {
      actual = 'bottom';
    } else if (actual === 'bottom' && triggerRect.bottom + popupRect.height + ARROW_GAP > vh) {
      actual = 'top';
    } else if (actual === 'left' && triggerRect.left - popupRect.width - ARROW_GAP < 0) {
      actual = 'right';
    } else if (actual === 'right' && triggerRect.right + popupRect.width + ARROW_GAP > vw) {
      actual = 'left';
    }

    popup.setAttribute('data-actual-placement', actual);

    let top: number;
    let left: number;

    switch (actual) {
      case 'top':
        left = triggerRect.left + triggerRect.width / 2;
        top = triggerRect.top - popupRect.height - ARROW_GAP;
        break;
      case 'bottom':
        left = triggerRect.left + triggerRect.width / 2;
        top = triggerRect.bottom + ARROW_GAP;
        break;
      case 'left':
        left = triggerRect.left - popupRect.width - ARROW_GAP;
        top = triggerRect.top + triggerRect.height / 2;
        break;
      case 'right':
        left = triggerRect.right + ARROW_GAP;
        top = triggerRect.top + triggerRect.height / 2;
        break;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }
}
