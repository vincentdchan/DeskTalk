import { STAT_CLS, STAT_CSS } from './styles/stat';

type StatSize = 'sm' | 'md' | 'lg';
type StatVariant = 'default' | 'outlined' | 'filled';

/**
 * `<dt-stat>` — framework-agnostic statistic/metric display web component.
 *
 * Displays a metric/KPI with label, value, and optional description.
 * Designed for dashboards and system monitors.
 *
 * ## Attributes
 * - `label` — the metric label (e.g., "CPU Usage", "Memory")
 * - `value` — the metric value (e.g., "42%", "8.2 GB")
 * - `description` — optional descriptive text
 * - `size` — size variant: `sm`, `md` (default), `lg`
 * - `variant` — visual style: `default`, `outlined`, `filled`
 * - `trend` — optional trend indicator: `up`, `down`, `neutral` (shows +/− symbol)
 * - `trend-value` — value to display with trend (e.g., "+5%")
 *
 * ## Usage
 * ```html
 * <dt-stat label="CPU Usage" value="42%"></dt-stat>
 *
 * <dt-stat label="Memory" value="8.2 GB" description="of 16 GB used"></dt-stat>
 *
 * <dt-stat label="Uptime" value="99.9%" size="lg" variant="filled"></dt-stat>
 *
 * <dt-stat
 *   label="Traffic"
 *   value="12.5k"
 *   description="visitors today"
 *   trend="up"
 *   trend-value="+18%"
 * ></dt-stat>
 * ```
 */
export class DtStat extends HTMLElement {
  // ── Observed attributes ─────────────────────────────────────────────────
  static get observedAttributes(): string[] {
    return ['label', 'value', 'description', 'size', 'variant', 'trend', 'trend-value'];
  }

  // ── Internal refs ───────────────────────────────────────────────────────
  private _container!: HTMLDivElement;
  private _labelEl!: HTMLDivElement;
  private _valueEl!: HTMLDivElement;
  private _descEl!: HTMLDivElement;
  private _trendEl!: HTMLDivElement;

  // ── Attribute helpers ───────────────────────────────────────────────────
  get label(): string | null {
    return this.getAttribute('label');
  }

  set label(val: string | null) {
    if (val === null) {
      this.removeAttribute('label');
    } else {
      this.setAttribute('label', val);
    }
  }

  get value(): string | null {
    return this.getAttribute('value');
  }

  set value(val: string | null) {
    if (val === null) {
      this.removeAttribute('value');
    } else {
      this.setAttribute('value', val);
    }
  }

  get description(): string | null {
    return this.getAttribute('description');
  }

  set description(val: string | null) {
    if (val === null) {
      this.removeAttribute('description');
    } else {
      this.setAttribute('description', val);
    }
  }

  get size(): StatSize {
    const val = this.getAttribute('size');
    if (val === 'sm' || val === 'lg') return val;
    return 'md';
  }

  set size(val: StatSize) {
    this.setAttribute('size', val);
  }

  get variant(): StatVariant {
    const val = this.getAttribute('variant');
    if (val === 'outlined' || val === 'filled') return val;
    return 'default';
  }

  set variant(val: StatVariant) {
    this.setAttribute('variant', val);
  }

  get trend(): 'up' | 'down' | 'neutral' | null {
    const val = this.getAttribute('trend');
    if (val === 'up' || val === 'down' || val === 'neutral') return val;
    return null;
  }

  set trend(val: 'up' | 'down' | 'neutral' | null) {
    if (val === null) {
      this.removeAttribute('trend');
    } else {
      this.setAttribute('trend', val);
    }
  }

  get trendValue(): string | null {
    return this.getAttribute('trend-value');
  }

  set trendValue(val: string | null) {
    if (val === null) {
      this.removeAttribute('trend-value');
    } else {
      this.setAttribute('trend-value', val);
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STAT_CSS;
    shadow.appendChild(style);

    this._container = document.createElement('div');
    this._container.className = STAT_CLS;

    this._labelEl = document.createElement('div');
    this._labelEl.className = 'label';
    this._container.appendChild(this._labelEl);

    this._valueEl = document.createElement('div');
    this._valueEl.className = 'value';
    this._container.appendChild(this._valueEl);

    this._descEl = document.createElement('div');
    this._descEl.className = 'description';
    this._container.appendChild(this._descEl);

    this._trendEl = document.createElement('div');
    this._trendEl.className = 'trend';
    this._container.appendChild(this._trendEl);

    shadow.appendChild(this._container);

    this._render();
  }

  // ── Updates ─────────────────────────────────────────────────────────────

  attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null): void {
    if (
      name === 'label' ||
      name === 'value' ||
      name === 'description' ||
      name === 'size' ||
      name === 'variant' ||
      name === 'trend' ||
      name === 'trend-value'
    ) {
      this._render();
    }
  }

  private _render(): void {
    this._labelEl.textContent = this.label ?? '';
    this._labelEl.style.display = this.label ? 'block' : 'none';

    this._valueEl.textContent = this.value ?? '';
    this._valueEl.style.display = this.value ? 'block' : 'none';

    this._descEl.textContent = this.description ?? '';
    this._descEl.style.display = this.description ? 'block' : 'none';

    const trend = this.trend;
    const trendValue = this.trendValue;

    if (trend && trendValue) {
      this._trendEl.style.display = 'inline-flex';
      this._trendEl.className = `trend ${trend}`;

      let symbol = '';
      if (trend === 'up') symbol = '↑';
      else if (trend === 'down') symbol = '↓';
      else symbol = '→';

      this._trendEl.textContent = `${symbol} ${trendValue}`;
    } else {
      this._trendEl.style.display = 'none';
    }
  }
}
