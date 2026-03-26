import chartCss from './styles/chart.css?raw';
import { loadChartJs } from './lib/chart-loader';
import type { DtChartRuntime } from './lib/chart-loader';

type DtChartLegend = 'top' | 'bottom' | 'left' | 'right' | 'none';
type DtChartType = 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'radar' | 'scatter' | 'bubble';
type DtChartCoreType = Exclude<DtChartType, 'area'>;

export interface DtChartDatasetInput {
  label?: string;
  data: Array<number | { x: number; y: number } | { x: number; y: number; r: number }>;
  color?: string;
}

export interface DtChartDataInput {
  labels?: string[];
  datasets: DtChartDatasetInput[];
}

export interface DtChartClickDetail {
  label: string | null;
  datasetIndex: number;
  index: number;
  value: unknown;
}

interface HslColor {
  h: number;
  s: number;
  l: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseCsv(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseColorToHsl(value: string): HslColor | null {
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1];
    const normalized =
      raw.length === 3
        ? raw
            .split('')
            .map((char) => `${char}${char}`)
            .join('')
        : raw;
    const r = parseInt(normalized.slice(0, 2), 16) / 255;
    const g = parseInt(normalized.slice(2, 4), 16) / 255;
    const b = parseInt(normalized.slice(4, 6), 16) / 255;
    return rgbToHsl(r, g, b);
  }

  const rgb = value
    .trim()
    .match(
      /^rgba?\((\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:[,/\s]+[\d.]+)?\)$/i,
    );
  if (rgb) {
    return rgbToHsl(Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255);
  }

  const hsl = value
    .trim()
    .match(/^hsla?\(([-\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:[,/\s]+[\d.]+)?\)$/i);
  if (hsl) {
    return {
      h: ((Number(hsl[1]) % 360) + 360) % 360,
      s: clamp(Number(hsl[2]), 0, 100),
      l: clamp(Number(hsl[3]), 0, 100),
    };
  }

  return null;
}

function rgbToHsl(r: number, g: number, b: number): HslColor {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  if (delta !== 0) {
    switch (max) {
      case r:
        h = 60 * (((g - b) / delta) % 6);
        break;
      case g:
        h = 60 * ((b - r) / delta + 2);
        break;
      default:
        h = 60 * ((r - g) / delta + 4);
        break;
    }
  }

  return {
    h: (h + 360) % 360,
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslString(color: HslColor, alpha = 1): string {
  return `hsla(${Math.round(color.h)} ${Math.round(color.s)}% ${Math.round(color.l)}% / ${alpha})`;
}

function getPalette(accent: string): HslColor[] {
  const base = parseColorToHsl(accent) ?? { h: 185, s: 88, l: 56 };
  const offsets = [0, 32, 68, 118, 164, 212, 258, 304];
  return offsets.map((offset, index) => ({
    h: (base.h + offset) % 360,
    s: clamp(base.s - index * 2, 55, 90),
    l: clamp(base.l + (index % 2 === 0 ? 0 : 6) - index, 38, 66),
  }));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override as T) ?? base;
  }

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] =
      isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return result as T;
}

function normalizeLegend(value: string | null): DtChartLegend {
  if (value === 'top' || value === 'bottom' || value === 'left' || value === 'right') {
    return value;
  }
  return 'none';
}

function normalizeType(value: string | null): DtChartType {
  if (
    value === 'bar' ||
    value === 'line' ||
    value === 'area' ||
    value === 'pie' ||
    value === 'doughnut' ||
    value === 'radar' ||
    value === 'scatter' ||
    value === 'bubble'
  ) {
    return value;
  }
  return 'bar';
}

function isCartesianType(type: DtChartType): boolean {
  return (
    type === 'bar' || type === 'line' || type === 'area' || type === 'scatter' || type === 'bubble'
  );
}

function formatLabels(value: string[]): string[] {
  return value.map((item) => item.trim()).filter(Boolean);
}

/**
 * `<dt-chart>` — lazy-loaded Chart.js wrapper.
 *
 * Set the `.data` JS property to provide chart data. This is the only supported
 * method for filling data into the chart.
 */
export class DtChart extends HTMLElement {
  private readonly _canvas: HTMLCanvasElement;
  private readonly _status: HTMLDivElement;
  private _runtime: DtChartRuntime | null = null;
  private _loadPromise: Promise<DtChartRuntime> | null = null;
  private _chart: import('chart.js').Chart | null = null;
  private _renderedType: DtChartCoreType | null = null;
  private _dataInput: DtChartDataInput | null = null;
  private _optionsOverride: Record<string, unknown> | null = null;
  private _syncFrame = 0;

  static get observedAttributes(): string[] {
    return ['type', 'legend', 'stacked', 'labels'];
  }

  get type(): DtChartType {
    return normalizeType(this.getAttribute('type'));
  }

  set type(value: DtChartType) {
    this.setAttribute('type', value);
  }

  get legend(): DtChartLegend {
    return normalizeLegend(this.getAttribute('legend'));
  }

  set legend(value: DtChartLegend) {
    this.setAttribute('legend', value);
  }

  get stacked(): boolean {
    return this.hasAttribute('stacked');
  }

  set stacked(value: boolean) {
    this.toggleAttribute('stacked', value);
  }

  get labels(): string[] {
    return formatLabels(parseCsv(this.getAttribute('labels')));
  }

  set labels(value: string[]) {
    this.setAttribute('labels', value.join(','));
  }

  get data(): DtChartDataInput | null {
    return this._dataInput;
  }

  set data(value: DtChartDataInput | null) {
    this._dataInput = value ? structuredClone(value) : null;
    this._scheduleSync();
  }

  get options(): Record<string, unknown> | null {
    return this._optionsOverride;
  }

  set options(value: Record<string, unknown> | null) {
    this._optionsOverride = value ? structuredClone(value) : null;
    void this._renderChart();
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = chartCss;
    shadow.appendChild(style);

    const root = document.createElement('div');
    root.className = 'dt-chart';

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'dt-chart__canvas';

    this._status = document.createElement('div');
    this._status.className = 'dt-chart__status';
    this._status.textContent = 'Loading chart';

    root.append(this._canvas, this._status);
    shadow.appendChild(root);
  }

  connectedCallback(): void {
    this._canvas.addEventListener('click', this._handleCanvasClick);
    void this._ensureRuntime().then(() => this._renderChart());
    this._scheduleSync();
  }

  disconnectedCallback(): void {
    this._canvas.removeEventListener('click', this._handleCanvasClick);
    if (this._syncFrame !== 0) {
      cancelAnimationFrame(this._syncFrame);
      this._syncFrame = 0;
    }
    this._chart?.destroy();
    this._chart = null;
    this._renderedType = null;
  }

  attributeChangedCallback(): void {
    this._scheduleSync();
  }

  private _handleCanvasClick = (event: Event): void => {
    if (!this._chart) {
      return;
    }

    const points = this._chart.getElementsAtEventForMode(
      event as unknown as MouseEvent,
      'nearest',
      { intersect: true },
      true,
    );
    const point = points[0];
    if (!point) {
      return;
    }

    const label = Array.isArray(this._chart.data.labels)
      ? ((this._chart.data.labels[point.index] as string | undefined) ?? null)
      : null;
    const dataset = this._chart.data.datasets[point.datasetIndex];
    const value = Array.isArray(dataset?.data) ? dataset.data[point.index] : undefined;

    this.dispatchEvent(
      new CustomEvent<DtChartClickDetail>('dt-chart-click', {
        bubbles: true,
        composed: true,
        detail: {
          label,
          datasetIndex: point.datasetIndex,
          index: point.index,
          value,
        },
      }),
    );
  };

  private _scheduleSync(): void {
    if (this._syncFrame !== 0) {
      return;
    }

    this._syncFrame = requestAnimationFrame(() => {
      this._syncFrame = 0;
      this._syncFromCurrentSource();
    });
  }

  private _syncFromCurrentSource(): void {
    void this._renderChart();
  }

  private async _ensureRuntime(): Promise<DtChartRuntime> {
    if (this._runtime) {
      return this._runtime;
    }

    if (!this._loadPromise) {
      this._loadPromise = loadChartJs().then((runtime) => {
        this._runtime = runtime;
        return runtime;
      });
    }

    return this._loadPromise;
  }

  private async _renderChart(): Promise<void> {
    const data = this._dataInput;
    if (!data) {
      this._setStatus('Waiting for data');
      return;
    }

    const runtime = await this._ensureRuntime();
    const config = this._buildConfig(runtime, data);
    const nextType = config.type as DtChartCoreType;

    if (!this._chart || this._renderedType !== nextType) {
      this._chart?.destroy();
      this._chart = new runtime.Chart(this._canvas, config as never);
      this._renderedType = nextType;
    } else {
      this._chart.data = config.data as never;
      this._chart.options = config.options as never;
      this._chart.update();
    }

    this._setStatus(data.datasets.length > 0 ? null : 'Waiting for data');
  }

  private _buildConfig(_runtime: DtChartRuntime, data: DtChartDataInput) {
    const computed = getComputedStyle(this);
    const accent = computed.getPropertyValue('--dt-accent').trim() || '#42d4ff';
    const text = computed.getPropertyValue('--dt-text').trim() || '#d6ebff';
    const muted = computed.getPropertyValue('--dt-text-muted').trim() || '#7b93a6';
    const border = computed.getPropertyValue('--dt-border').trim() || 'rgba(123, 147, 166, 0.3)';
    const font =
      computed.getPropertyValue('--font-mono').trim() ||
      "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace";
    const palette = getPalette(accent);
    const normalizedType = this.type === 'area' ? 'line' : this.type;
    const chartData = {
      labels: data.labels ?? this.labels,
      datasets: data.datasets.map((dataset, index) => {
        const tone = palette[index % palette.length];
        const color = dataset.color ?? hslString(tone, 1);
        const baseDataset = {
          label: dataset.label ?? '',
          data: dataset.data,
          backgroundColor:
            normalizedType === 'line' || normalizedType === 'radar' || normalizedType === 'scatter'
              ? hslString(tone, normalizedType === 'scatter' ? 0.95 : 0.24)
              : color,
          borderColor: color,
          pointBackgroundColor: color,
          pointBorderColor: color,
          pointHoverBackgroundColor: color,
          pointRadius: this.type === 'line' || this.type === 'area' ? 3 : 4,
          pointHoverRadius: this.type === 'line' || this.type === 'area' ? 5 : 6,
          borderWidth: normalizedType === 'radar' ? 2 : 2,
          tension: normalizedType === 'line' || this.type === 'area' ? 0.32 : undefined,
          fill: this.type === 'area',
        };

        if (normalizedType === 'pie' || normalizedType === 'doughnut') {
          return {
            ...baseDataset,
            backgroundColor: Array.isArray(dataset.data)
              ? dataset.data.map((_, itemIndex) =>
                  hslString(palette[itemIndex % palette.length], 0.86),
                )
              : color,
            borderColor: Array.isArray(dataset.data)
              ? dataset.data.map((_, itemIndex) =>
                  hslString(palette[itemIndex % palette.length], 1),
                )
              : color,
            borderWidth: 1,
          };
        }

        if (normalizedType === 'scatter' || normalizedType === 'bubble') {
          return {
            ...baseDataset,
            showLine: false,
            backgroundColor: hslString(tone, 0.78),
          };
        }

        return baseDataset;
      }),
    };

    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 320,
      },
      interaction: {
        mode: 'nearest',
        intersect: true,
      },
      plugins: {
        legend: {
          display: this.legend !== 'none',
          position: this.legend === 'none' ? 'top' : this.legend,
          labels: {
            color: text,
            boxWidth: 12,
            boxHeight: 12,
            padding: 14,
            font: {
              family: font,
              size: 11,
            },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(10, 18, 24, 0.92)',
          borderColor: colorMix(border, accent, 0.35),
          borderWidth: 1,
          titleColor: text,
          bodyColor: text,
          footerColor: muted,
          titleFont: { family: font, size: 11 },
          bodyFont: { family: font, size: 11 },
          padding: 10,
        },
      },
      scales: isCartesianType(this.type)
        ? {
            x: {
              stacked: this.stacked,
              grid: { display: false, color: border },
              border: { color: border },
              ticks: {
                color: muted,
                font: { family: font, size: 11 },
              },
            },
            y: {
              stacked: this.stacked,
              beginAtZero: true,
              grid: { display: false, color: border },
              border: { color: border },
              ticks: {
                color: muted,
                font: { family: font, size: 11 },
              },
            },
          }
        : normalizedType === 'radar'
          ? {
              r: {
                angleLines: { color: border },
                grid: { color: border },
                pointLabels: {
                  color: muted,
                  font: { family: font, size: 11 },
                },
                ticks: {
                  color: muted,
                  backdropColor: 'transparent',
                  font: { family: font, size: 10 },
                },
              },
            }
          : undefined,
    };

    return {
      type: normalizedType,
      data: chartData,
      options: deepMerge(baseOptions, this._optionsOverride ?? {}),
    };
  }

  private _setStatus(message: string | null): void {
    if (!message) {
      this._status.hidden = true;
      return;
    }

    this._status.hidden = false;
    this._status.textContent = message;
  }
}

function colorMix(primary: string, secondary: string, weight: number): string {
  const first = parseColorToHsl(primary);
  const second = parseColorToHsl(secondary);
  if (!first || !second) {
    return primary;
  }

  const ratio = clamp(weight, 0, 1);
  const hueDelta = ((((second.h - first.h) % 360) + 540) % 360) - 180;
  return hslString({
    h: (first.h + hueDelta * ratio + 360) % 360,
    s: first.s + (second.s - first.s) * ratio,
    l: first.l + (second.l - first.l) * ratio,
  });
}
