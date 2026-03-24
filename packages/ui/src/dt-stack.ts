import stackCss from './styles/stack.css?raw';

const STACK_CLS = 'dt-stack-inner';

type StackDirection = 'column' | 'row';
type StackGap = '0' | '4' | '8' | '12' | '16' | '20' | '24' | '32';
type StackAlign = 'start' | 'center' | 'end' | 'stretch';

function normalizeDirection(value: string | null): StackDirection {
  if (value === 'row' || value === 'horizontal') {
    return 'row';
  }

  return 'column';
}

/**
 * `<dt-stack>` — framework-agnostic flexbox stack web component.
 *
 * Provides vertical or horizontal flexbox layout with responsive behavior.
 * Row stacks automatically wrap to column on narrow views.
 *
 * ## Attributes
 * - `direction` — stack direction: `column` (default) or `row`
 * - `gap` — spacing between items: 0, 4, 8, 12, 16, 20, 24, 32 (default: 16)
 * - `align` — cross-axis alignment: `start`, `center`, `end`, `stretch` (default: stretch)
 *
 * ## Usage
 * ```html
 * <!-- Vertical stack (default) -->
 * <dt-stack>
 *   <dt-card>Item 1</dt-card>
 *   <dt-card>Item 2</dt-card>
 *   <dt-card>Item 3</dt-card>
 * </dt-stack>
 *
 * <!-- Horizontal row (wraps to column on narrow views) -->
 * <dt-stack direction="row" gap="24">
 *   <dt-button>Save</dt-button>
 *   <dt-button variant="secondary">Cancel</dt-button>
 * </dt-stack>
 *
 * <!-- Centered horizontal row -->
 * <dt-stack direction="row" align="center" gap="8">
 *   <dt-badge variant="success">Active</dt-badge>
 *   <span>System running</span>
 * </dt-stack>
 * ```
 */
export class DtStack extends HTMLElement {
  // ── Observed attributes ─────────────────────────────────────────────────
  static get observedAttributes(): string[] {
    return ['direction', 'gap', 'align'];
  }

  // ── Attribute helpers ───────────────────────────────────────────────────
  get direction(): StackDirection {
    return normalizeDirection(this.getAttribute('direction'));
  }

  set direction(val: StackDirection) {
    this.setAttribute('direction', normalizeDirection(val));
  }

  get gap(): StackGap {
    const val = this.getAttribute('gap');
    if (
      val === '0' ||
      val === '4' ||
      val === '8' ||
      val === '12' ||
      val === '20' ||
      val === '24' ||
      val === '32'
    ) {
      return val;
    }
    return '16';
  }

  set gap(val: StackGap) {
    this.setAttribute('gap', val);
  }

  get align(): StackAlign {
    const val = this.getAttribute('align');
    if (val === 'start' || val === 'center' || val === 'end') {
      return val;
    }
    return 'stretch';
  }

  set align(val: StackAlign) {
    this.setAttribute('align', val);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  connectedCallback() {
    this.#normalizeAttributes();
  }

  attributeChangedCallback(name: string): void {
    if (name === 'direction') {
      this.#normalizeAttributes();
    }
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = stackCss;
    shadow.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.className = STACK_CLS;
    wrapper.innerHTML = '<slot></slot>';
    shadow.appendChild(wrapper);
  }

  #normalizeAttributes(): void {
    const rawDirection = this.getAttribute('direction');
    const normalizedDirection = normalizeDirection(rawDirection);
    if (rawDirection !== null && rawDirection !== normalizedDirection) {
      this.setAttribute('direction', normalizedDirection);
    }
  }
}
