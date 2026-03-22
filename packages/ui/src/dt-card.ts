import cardCss from './styles/card.css?raw';

const CARD_CLS = 'dt-card-inner';

type CardVariant = 'default' | 'outlined' | 'filled';

/**
 * `<dt-card>` — framework-agnostic card web component.
 *
 * Renders a card container with a solid border using the theme accent color
 * and no border-radius.
 *
 * ## Attributes
 * - `variant` — visual style: default | outlined | filled (default "default")
 *
 * ## Usage
 * ```html
 * <dt-card>
 *   <h3>Title</h3>
 *   <p>Card content goes here.</p>
 * </dt-card>
 *
 * <dt-card variant="outlined">
 *   <p>Outlined card with transparent background.</p>
 * </dt-card>
 * ```
 */
export class DtCard extends HTMLElement {
  // ── Observed attributes ─────────────────────────────────────────────────
  static get observedAttributes(): string[] {
    return ['variant'];
  }

  // ── Attribute helpers ───────────────────────────────────────────────────
  get variant(): CardVariant {
    const val = this.getAttribute('variant');
    if (val === 'outlined' || val === 'filled') return val;
    return 'default';
  }

  set variant(val: CardVariant) {
    this.setAttribute('variant', val);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = cardCss;
    shadow.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.className = CARD_CLS;
    wrapper.innerHTML = '<slot></slot>';
    shadow.appendChild(wrapper);
  }
}
