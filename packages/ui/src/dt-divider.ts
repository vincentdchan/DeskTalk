import { DIVIDER_CLS, DIVIDER_CSS } from './styles/divider';

type DividerDirection = 'horizontal' | 'vertical';
type DividerStyle = 'default' | 'subtle' | 'strong';
type DividerSpacing = 'sm' | 'md' | 'lg';

/**
 * `<dt-divider>` — framework-agnostic divider/separator web component.
 *
 * Horizontal or vertical separator line for organizing content.
 *
 * ## Attributes
 * - `direction` — divider orientation: `horizontal` (default) or `vertical`
 * - `style-variant` — border style: `default`, `subtle`, `strong`
 * - `spacing` — margin around divider: `sm`, `md`, `lg`
 *
 * ## Usage
 * ```html
 * <!-- Horizontal divider (default) -->
 * <dt-divider></dt-divider>
 *
 * <!-- Subtle horizontal divider with spacing -->
 * <dt-divider style-variant="subtle" spacing="md"></dt-divider>
 *
 * <!-- Vertical divider in a row layout -->
 * <dt-stack direction="row">
 *   <span>Left</span>
 *   <dt-divider direction="vertical"></dt-divider>
 *   <span>Right</span>
 * </dt-stack>
 * ```
 */
export class DtDivider extends HTMLElement {
  // ── Observed attributes ─────────────────────────────────────────────────
  static get observedAttributes(): string[] {
    return ['direction', 'style-variant', 'spacing'];
  }

  // ── Attribute helpers ───────────────────────────────────────────────────
  get direction(): DividerDirection {
    const val = this.getAttribute('direction');
    if (val === 'vertical') return 'vertical';
    return 'horizontal';
  }

  set direction(val: DividerDirection) {
    this.setAttribute('direction', val);
  }

  get styleVariant(): DividerStyle {
    const val = this.getAttribute('style-variant');
    if (val === 'subtle' || val === 'strong') return val;
    return 'default';
  }

  set styleVariant(val: DividerStyle) {
    this.setAttribute('style-variant', val);
  }

  get spacing(): DividerSpacing | null {
    const val = this.getAttribute('spacing');
    if (val === 'sm' || val === 'md' || val === 'lg') return val;
    return null;
  }

  set spacing(val: DividerSpacing | null) {
    if (val === null) {
      this.removeAttribute('spacing');
    } else {
      this.setAttribute('spacing', val);
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = DIVIDER_CSS;
    shadow.appendChild(style);

    const hr = document.createElement('hr');
    hr.className = DIVIDER_CLS;
    shadow.appendChild(hr);
  }
}
