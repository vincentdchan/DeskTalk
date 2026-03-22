import gridCss from './styles/grid.css?raw';

const GRID_CLS = 'dt-grid-inner';

type GridCols = '1' | '2' | '3' | '4' | '5' | '6';
type GridGap = '0' | '4' | '8' | '12' | '16' | '20' | '24' | '32';
type GridMinWidth = '150' | '180' | '200' | '220' | '260' | '300';

/**
 * `<dt-grid>` — framework-agnostic responsive grid web component.
 *
 * Provides a grid layout that auto-collapses to single column in narrow views.
 * Uses CSS Grid's repeat(auto-fit) pattern with minmax for responsive behavior.
 *
 * ## Attributes
 * - `cols` — fixed number of columns (1-6). Auto-fit responsive when omitted.
 * - `gap` — spacing between items: 0, 4, 8, 12, 16, 20, 24, 32 (default: 16)
 * - `min-width` — minimum width for auto-fit columns: 150, 180, 200, 220, 260, 300 (default: 220)
 *
 * ## Usage
 * ```html
 * <!-- Auto-responsive: columns collapse based on available space -->
 * <dt-grid>
 *   <dt-card>Item 1</dt-card>
 *   <dt-card>Item 2</dt-card>
 *   <dt-card>Item 3</dt-card>
 * </dt-grid>
 *
 * <!-- Fixed 3 columns, collapses to 1 on mobile -->
 * <dt-grid cols="3" gap="24">
 *   <dt-card>Item 1</dt-card>
 *   <dt-card>Item 2</dt-card>
 *   <dt-card>Item 3</dt-card>
 * </dt-grid>
 *
 * <!-- Narrow items: more columns fit side-by-side -->
 * <dt-grid min-width="150">
 *   <dt-stat label="CPU" value="42%"></dt-stat>
 *   <dt-stat label="RAM" value="8GB"></dt-stat>
 *   <dt-stat label="Disk" value="256GB"></dt-stat>
 * </dt-grid>
 * ```
 */
export class DtGrid extends HTMLElement {
  // ── Observed attributes ─────────────────────────────────────────────────
  static get observedAttributes(): string[] {
    return ['cols', 'gap', 'min-width'];
  }

  // ── Attribute helpers ───────────────────────────────────────────────────
  get cols(): GridCols | null {
    const val = this.getAttribute('cols');
    if (val === '1' || val === '2' || val === '3' || val === '4' || val === '5' || val === '6') {
      return val;
    }
    return null;
  }

  set cols(val: GridCols | null) {
    if (val === null) {
      this.removeAttribute('cols');
    } else {
      this.setAttribute('cols', val);
    }
  }

  get gap(): GridGap {
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

  set gap(val: GridGap) {
    this.setAttribute('gap', val);
  }

  get minWidth(): GridMinWidth {
    const val = this.getAttribute('min-width');
    if (val === '150' || val === '180' || val === '200' || val === '260' || val === '300') {
      return val;
    }
    return '220';
  }

  set minWidth(val: GridMinWidth) {
    this.setAttribute('min-width', val);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = gridCss;
    shadow.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.className = GRID_CLS;
    wrapper.innerHTML = '<slot></slot>';
    shadow.appendChild(wrapper);
  }
}
