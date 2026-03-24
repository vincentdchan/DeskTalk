import tableViewCss from './styles/table-view.css?raw';
import { createBoundTemplate } from './lib/template-bind';
import { DtVirtualizer } from './lib/virtualizer';

export type DtTableViewAlign = 'left' | 'center' | 'right';
export type DtTableViewSortDirection = 'asc' | 'desc';

export interface DtTableViewSortDetail {
  field: string;
  direction: DtTableViewSortDirection;
}

export interface DtTableViewRowClickDetail<T = unknown> {
  row: T;
  index: number;
}

interface DtTableColumnConfig {
  field: string;
  header: string;
  width: string;
  minWidth: string;
  align: DtTableViewAlign;
  template: HTMLTemplateElement | null;
}

function ensureRecord(row: unknown): Record<string, unknown> {
  if (row && typeof row === 'object') {
    return row as Record<string, unknown>;
  }
  return { value: row };
}

function normalizeAlign(value: string | null): DtTableViewAlign {
  if (value === 'center' || value === 'right') {
    return value;
  }
  return 'left';
}

export class DtColumn extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['field', 'header', 'width', 'min-width', 'align'];
  }

  get field(): string {
    return this.getAttribute('field') ?? '';
  }

  get header(): string {
    return this.getAttribute('header') ?? this.field;
  }

  get width(): string {
    return this.getAttribute('width') ?? 'auto';
  }

  get minWidth(): string {
    return this.getAttribute('min-width') ?? '0';
  }

  get align(): DtTableViewAlign {
    return normalizeAlign(this.getAttribute('align'));
  }

  connectedCallback(): void {
    this.hidden = true;
  }

  attributeChangedCallback(): void {
    this.dispatchEvent(new CustomEvent('dt-column-change', { bubbles: true, composed: true }));
  }
}

/**
 * `<dt-table-view>` — virtualized data table for structured row/column data.
 *
 * Columns are declared with child `<dt-column>` elements. Rows are provided via
 * the JS-only `rows` property. Sorting is event-driven: the component updates
 * header state and emits `dt-sort`, while the consumer is responsible for
 * reordering and reassigning `rows`.
 *
 * ## Attributes
 * - `row-height` — fixed row height in px
 * - `sortable` — when present, enables sortable header cells
 * - `striped` — when present, alternates row backgrounds
 * - `bordered` — when present, shows cell borders
 * - `empty-text` — text shown when there are no rows or no columns
 *
 * ## Properties
 * - `rows` — array of row objects to render
 *
 * ## `<dt-column>` attributes
 * - `field` — row field key
 * - `header` — header label; defaults to `field`
 * - `width` — column width in px or `auto`
 * - `min-width` — minimum column width
 * - `align` — `left`, `center`, or `right`
 *
 * If a `<dt-column>` contains a child `<template>`, that template is cloned for
 * each cell in the column. Template bindings work the same way as in
 * `<dt-list-view>`:
 * - `data-field="status"` sets text content from `row.status`
 * - `data-field-variant="statusVariant"` sets the `variant` attribute from `row.statusVariant`
 *
 * ## Events
 * - `dt-sort` — fired with `{ field, direction }` when a header is activated
 * - `dt-row-click` — fired with `{ row, index }` when a body row is clicked
 *
 * ## Usage
 * ```html
 * <dt-table-view id="processes" row-height="40" sortable striped>
 *   <dt-column field="name" header="Process" width="220"></dt-column>
 *   <dt-column field="cpu" header="CPU %" width="100" align="right"></dt-column>
 *   <dt-column field="status" header="Status" width="140">
 *     <template>
 *       <dt-badge data-field="status" data-field-variant="statusVariant"></dt-badge>
 *     </template>
 *   </dt-column>
 * </dt-table-view>
 * <script>
 *   const table = document.getElementById('processes');
 *   const rows = [
 *     { name: 'node', cpu: '12.4', status: 'running', statusVariant: 'success' },
 *     { name: 'cron', cpu: '1.2', status: 'idle', statusVariant: 'neutral' },
 *   ];
 *   table.rows = rows;
 *   table.addEventListener('dt-sort', (event) => {
 *     const { field, direction } = event.detail;
 *     table.rows = [...rows].sort((a, b) =>
 *       direction === 'asc'
 *         ? String(a[field]).localeCompare(String(b[field]), undefined, { numeric: true })
 *         : String(b[field]).localeCompare(String(a[field]), undefined, { numeric: true }),
 *     );
 *   });
 * </script>
 * ```
 */
export class DtTableView extends HTMLElement {
  private _rows: unknown[] = [];
  private _columns: DtTableColumnConfig[] = [];
  private readonly _virtualizer = new DtVirtualizer({
    estimateSize: 40,
    overscan: 5,
    fixedSize: 40,
  });
  private readonly _root: HTMLDivElement;
  private readonly _scroll: HTMLDivElement;
  private readonly _header: HTMLDivElement;
  private readonly _body: HTMLDivElement;
  private readonly _canvas: HTMLDivElement;
  private readonly _emptyState: HTMLDivElement;
  private _resizeObserver: ResizeObserver | null = null;
  private _mutationObserver: MutationObserver | null = null;
  private _sortField: string | null = null;
  private _sortDirection: DtTableViewSortDirection = 'asc';

  static get observedAttributes(): string[] {
    return ['row-height', 'sortable', 'striped', 'bordered', 'empty-text'];
  }

  get rows(): unknown[] {
    return this._rows;
  }

  set rows(value: unknown[]) {
    this._rows = Array.isArray(value) ? value : [];
    this._virtualizer.setCount(this._rows.length);
    this._render();
  }

  get rowHeight(): number {
    const raw = Number(this.getAttribute('row-height') ?? '40');
    return Number.isFinite(raw) && raw > 0 ? raw : 40;
  }

  set rowHeight(value: number) {
    this.setAttribute('row-height', String(value));
  }

  get sortable(): boolean {
    return this.hasAttribute('sortable');
  }

  get emptyText(): string {
    return this.getAttribute('empty-text') ?? 'No data';
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = tableViewCss;
    shadow.appendChild(style);

    this._root = document.createElement('div');
    this._root.className = 'dt-table-view';

    this._scroll = document.createElement('div');
    this._scroll.className = 'dt-table-scroll';
    this._scroll.addEventListener('scroll', this._onScroll, { passive: true });

    this._header = document.createElement('div');
    this._header.className = 'dt-table-header';

    this._body = document.createElement('div');
    this._body.className = 'dt-table-body';

    this._canvas = document.createElement('div');
    this._canvas.className = 'dt-table-canvas';

    this._emptyState = document.createElement('div');
    this._emptyState.className = 'dt-table-empty';

    this._body.append(this._canvas, this._emptyState);
    this._scroll.append(this._header, this._body);
    this._root.appendChild(this._scroll);
    shadow.appendChild(this._root);
  }

  connectedCallback(): void {
    this._virtualizer.setFixedSize(this.rowHeight);
    this._virtualizer.setEstimateSize(this.rowHeight);
    this._syncColumns();

    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this._scroll) {
          const headerHeight = this._header.offsetHeight;
          this._virtualizer.setViewportHeight(Math.max(0, entry.contentRect.height - headerHeight));
          this._render();
        }
      }
    });
    this._resizeObserver.observe(this._scroll);

    this._mutationObserver = new MutationObserver(() => {
      this._syncColumns();
      this._render();
    });
    this._mutationObserver.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['field', 'header', 'width', 'min-width', 'align'],
    });

    this._virtualizer.setCount(this._rows.length);
    this._virtualizer.setViewportHeight(
      Math.max(0, this._scroll.clientHeight - this._header.offsetHeight),
    );
    this._render();
  }

  disconnectedCallback(): void {
    this._scroll.removeEventListener('scroll', this._onScroll);
    this._resizeObserver?.disconnect();
    this._mutationObserver?.disconnect();
    this._resizeObserver = null;
    this._mutationObserver = null;
  }

  attributeChangedCallback(name: string): void {
    if (name === 'row-height') {
      this._virtualizer.setFixedSize(this.rowHeight);
      this._virtualizer.setEstimateSize(this.rowHeight);
    }
    this._render();
  }

  private _onScroll = (): void => {
    this._virtualizer.setScrollTop(Math.max(0, this._scroll.scrollTop - this._header.offsetHeight));
    this._renderBody();
  };

  private _syncColumns(): void {
    this._columns = Array.from(this.children)
      .filter((child): child is DtColumn => child instanceof DtColumn)
      .map((column) => ({
        field: column.field,
        header: column.header,
        width: column.width,
        minWidth: column.minWidth,
        align: column.align,
        template:
          Array.from(column.children).find(
            (child): child is HTMLTemplateElement => child instanceof HTMLTemplateElement,
          ) ?? null,
      }))
      .filter((column) => column.field);
  }

  private _render(): void {
    if (!this.isConnected) {
      return;
    }

    this._emptyState.textContent = this.emptyText;
    const columnsTemplate =
      this._columns.length > 0
        ? this._columns.map((column) => this._toGridColumn(column)).join(' ')
        : 'minmax(0, 1fr)';
    this._header.style.setProperty('--dt-table-columns', columnsTemplate);
    this._canvas.style.setProperty('--dt-table-columns', columnsTemplate);

    this._renderHeader();
    this._renderBody();
  }

  private _renderHeader(): void {
    const fragment = document.createDocumentFragment();

    for (const column of this._columns) {
      const cell = document.createElement('div');
      cell.className = 'dt-table-header-cell';
      cell.dataset.align = column.align;

      if (this.sortable) {
        cell.classList.add('dt-table-header-cell--sortable');
        cell.tabIndex = 0;
        cell.setAttribute('role', 'button');
        cell.setAttribute('aria-label', `Sort by ${column.header}`);
        cell.addEventListener('click', () => this._requestSort(column.field));
        cell.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this._requestSort(column.field);
          }
        });
      }

      const label = document.createElement('span');
      label.className = 'dt-table-header-label';
      label.textContent = column.header;

      if (this.sortable) {
        const indicator = document.createElement('span');
        indicator.className = 'dt-table-sort-indicator';
        if (this._sortField === column.field) {
          indicator.textContent = this._sortDirection === 'asc' ? '▲' : '▼';
        } else {
          indicator.textContent = '↕';
        }
        label.appendChild(indicator);
      }

      cell.appendChild(label);
      fragment.appendChild(cell);
    }

    this._header.replaceChildren(fragment);
  }

  private _renderBody(): void {
    if (this._rows.length === 0 || this._columns.length === 0) {
      this._emptyState.hidden = false;
      this._canvas.replaceChildren();
      this._body.style.height = '140px';
      this._canvas.style.height = '0px';
      return;
    }

    this._emptyState.hidden = true;
    this._virtualizer.setCount(this._rows.length);
    this._virtualizer.setScrollTop(Math.max(0, this._scroll.scrollTop - this._header.offsetHeight));
    this._virtualizer.setViewportHeight(
      Math.max(0, this._scroll.clientHeight - this._header.offsetHeight),
    );

    const range = this._virtualizer.getRange();
    this._body.style.height = `${Math.max(range.totalHeight, this._scroll.clientHeight - this._header.offsetHeight)}px`;
    this._canvas.style.height = `${range.totalHeight}px`;

    const fragment = document.createDocumentFragment();
    for (let index = range.start; index < range.end; index += 1) {
      fragment.appendChild(this._renderRow(index));
    }

    this._canvas.replaceChildren(fragment);
  }

  private _renderRow(index: number): HTMLElement {
    const row = this._rows[index];
    const rowElement = document.createElement('div');
    rowElement.className = 'dt-table-row dt-table-row--clickable';
    rowElement.style.top = `${this._virtualizer.getOffset(index)}px`;
    rowElement.style.height = `${this.rowHeight}px`;
    rowElement.style.setProperty(
      '--dt-table-columns',
      this._header.style.getPropertyValue('--dt-table-columns'),
    );
    rowElement.addEventListener('click', () => {
      this.dispatchEvent(
        new CustomEvent<DtTableViewRowClickDetail>('dt-row-click', {
          detail: { row, index },
          bubbles: true,
          composed: true,
        }),
      );
    });

    const record = ensureRecord(row);

    for (const column of this._columns) {
      const cell = document.createElement('div');
      cell.className = 'dt-table-cell';
      cell.dataset.align = column.align;

      if (column.template) {
        cell.appendChild(createBoundTemplate(column.template, record));
      } else {
        const value = record[column.field];
        cell.textContent = value === null || value === undefined ? '' : String(value);
      }

      rowElement.appendChild(cell);
    }

    return rowElement;
  }

  private _requestSort(field: string): void {
    if (this._sortField === field) {
      this._sortDirection = this._sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this._sortField = field;
      this._sortDirection = 'asc';
    }

    this._renderHeader();
    this.dispatchEvent(
      new CustomEvent<DtTableViewSortDetail>('dt-sort', {
        detail: { field, direction: this._sortDirection },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _toGridColumn(column: DtTableColumnConfig): string {
    const minWidth = /^\d+$/.test(column.minWidth) ? `${column.minWidth}px` : column.minWidth;
    if (column.width === 'auto') {
      return `minmax(${minWidth}, 1fr)`;
    }

    const width = /^\d+$/.test(column.width) ? `${column.width}px` : column.width;
    return `minmax(${minWidth}, ${width})`;
  }
}
