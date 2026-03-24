import listViewCss from './styles/list-view.css?raw';
import { createBoundTemplate } from './lib/template-bind';
import { DtVirtualizer } from './lib/virtualizer';

export type DtListViewSelectable = 'none' | 'single' | 'multi';

export interface DtListViewItemClickDetail<T = unknown> {
  item: T;
  index: number;
}

export interface DtListViewSelectionChangeDetail<T = unknown> {
  selected: T[];
}

export type DtListViewRenderItem<T = unknown> = (
  item: T,
  container: HTMLElement,
  index: number,
) => void;

const DEFAULT_ESTIMATE = 56;

function ensureRecord(item: unknown): Record<string, unknown> {
  if (item && typeof item === 'object') {
    return item as Record<string, unknown>;
  }
  return { value: item };
}

/**
 * `<dt-list-view>` — virtualized list web component for long collections.
 *
 * Supports two sizing modes:
 * - fixed-height mode via `item-height`
 * - variable-height mode when `item-height` is omitted
 *
 * ## Attributes
 * - `item-height` — fixed row height in px; omit for measured variable-height rows
 * - `dividers` — when present, shows dividers between items
 * - `selectable` — selection mode: `none`, `single`, or `multi`
 * - `empty-text` — text shown when the list has no items
 *
 * ## Properties
 * - `items` — array of item objects to render
 * - `renderItem` — optional custom renderer `(item, container, index) => void`
 * - `selectedItems` — readonly array of currently selected item objects
 *
 * ## Template binding
 * When using a child `<template>`, bindings are applied as follows:
 * - `data-field="title"` sets `textContent` from `item.title`
 * - `data-field-variant="statusVariant"` sets the `variant` attribute from `item.statusVariant`
 *
 * ## Events
 * - `dt-item-click` — fired when an item is clicked; `detail` contains `{ item, index }`
 * - `dt-selection-change` — fired when selection changes; `detail.selected` is the selected items array
 *
 * ## Usage
 * ```html
 * <dt-list-view id="tasks" item-height="72" dividers selectable="single">
 *   <template>
 *     <dt-stack gap="8">
 *       <dt-stack direction="row" align="center" gap="8">
 *         <strong data-field="title"></strong>
 *         <dt-badge data-field="status" data-field-variant="statusVariant"></dt-badge>
 *       </dt-stack>
 *       <span class="text-muted" data-field="summary"></span>
 *     </dt-stack>
 *   </template>
 * </dt-list-view>
 * <script>
 *   const list = document.getElementById('tasks');
 *   list.items = [
 *     { title: 'Review report', status: 'Queued', statusVariant: 'warning', summary: 'Waiting on CPU budget' },
 *     { title: 'Ship release', status: 'Done', statusVariant: 'success', summary: 'Published 4 minutes ago' },
 *   ];
 * </script>
 * ```
 */
export class DtListView extends HTMLElement {
  private _items: unknown[] = [];
  private _selectedIndices = new Set<number>();
  private _renderItem: DtListViewRenderItem | null = null;
  private readonly _virtualizer = new DtVirtualizer({
    estimateSize: DEFAULT_ESTIMATE,
    overscan: 5,
  });
  private readonly _viewport: HTMLDivElement;
  private readonly _spacer: HTMLDivElement;
  private readonly _itemsLayer: HTMLDivElement;
  private readonly _emptyState: HTMLDivElement;
  private _resizeObserver: ResizeObserver | null = null;
  private _itemResizeObserver: ResizeObserver | null = null;

  static get observedAttributes(): string[] {
    return ['item-height', 'dividers', 'selectable', 'empty-text'];
  }

  get items(): unknown[] {
    return this._items;
  }

  set items(value: unknown[]) {
    this._items = Array.isArray(value) ? value : [];
    this._selectedIndices = new Set(
      [...this._selectedIndices].filter((index) => index < this._items.length),
    );
    this._virtualizer.setCount(this._items.length);
    this._syncSizingMode(true);
    this._render();
  }

  get selectedItems(): unknown[] {
    return [...this._selectedIndices].sort((a, b) => a - b).map((index) => this._items[index]);
  }

  get renderItem(): DtListViewRenderItem | null {
    return this._renderItem;
  }

  set renderItem(value: DtListViewRenderItem | null) {
    this._renderItem = typeof value === 'function' ? value : null;
    this._render();
  }

  get itemHeight(): number | null {
    const raw = this.getAttribute('item-height');
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  set itemHeight(value: number | null) {
    if (value === null || value <= 0) {
      this.removeAttribute('item-height');
      return;
    }
    this.setAttribute('item-height', String(value));
  }

  get selectable(): DtListViewSelectable {
    const value = this.getAttribute('selectable');
    if (value === 'single' || value === 'multi') {
      return value;
    }
    return 'none';
  }

  set selectable(value: DtListViewSelectable) {
    this.setAttribute('selectable', value);
  }

  get emptyText(): string {
    return this.getAttribute('empty-text') ?? 'No items';
  }

  set emptyText(value: string) {
    this.setAttribute('empty-text', value);
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = listViewCss;
    shadow.appendChild(style);

    this._viewport = document.createElement('div');
    this._viewport.className = 'dt-list-view';
    this._viewport.addEventListener('scroll', this._onScroll, { passive: true });

    this._spacer = document.createElement('div');
    this._spacer.className = 'dt-list-spacer';

    this._itemsLayer = document.createElement('div');
    this._itemsLayer.className = 'dt-list-items';

    this._emptyState = document.createElement('div');
    this._emptyState.className = 'dt-list-empty';

    this._spacer.append(this._itemsLayer, this._emptyState);
    this._viewport.appendChild(this._spacer);
    shadow.appendChild(this._viewport);
  }

  connectedCallback(): void {
    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this._viewport) {
          this._virtualizer.setViewportHeight(entry.contentRect.height);
          this._render();
        }
      }
    });
    this._resizeObserver.observe(this._viewport);

    this._itemResizeObserver = new ResizeObserver((entries) => {
      let adjustment = 0;
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        const index = Number(target.dataset.index);
        if (!Number.isFinite(index)) {
          continue;
        }
        adjustment += this._virtualizer.measure(index, entry.contentRect.height);
      }

      if (adjustment !== 0) {
        this._viewport.scrollTop += adjustment;
      }

      if (entries.length > 0) {
        this._render();
      }
    });

    this._virtualizer.setCount(this._items.length);
    this._virtualizer.setViewportHeight(this._viewport.clientHeight);
    this._syncSizingMode(false);
    this._render();
  }

  disconnectedCallback(): void {
    this._viewport.removeEventListener('scroll', this._onScroll);
    this._resizeObserver?.disconnect();
    this._itemResizeObserver?.disconnect();
    this._resizeObserver = null;
    this._itemResizeObserver = null;
  }

  attributeChangedCallback(name: string): void {
    if (name === 'item-height') {
      this._syncSizingMode(true);
    }

    if (name === 'selectable' && this.selectable === 'none' && this._selectedIndices.size > 0) {
      this._selectedIndices.clear();
      this._emitSelectionChange();
    }

    this._render();
  }

  private _onScroll = (): void => {
    this._virtualizer.setScrollTop(this._viewport.scrollTop);
    this._render();
  };

  private _syncSizingMode(resetMeasurements: boolean): void {
    const fixedHeight = this.itemHeight;
    this._virtualizer.setFixedSize(fixedHeight);
    this._virtualizer.setEstimateSize(fixedHeight ?? DEFAULT_ESTIMATE);
    if (resetMeasurements) {
      this._virtualizer.resetMeasurements();
    }
  }

  private _render(): void {
    if (!this.isConnected) {
      return;
    }

    this._emptyState.textContent = this.emptyText;
    this._emptyState.hidden = this._items.length > 0;

    if (this._items.length === 0) {
      this._itemsLayer.replaceChildren();
      this._spacer.style.height = '100%';
      return;
    }

    this._virtualizer.setScrollTop(this._viewport.scrollTop);
    this._virtualizer.setViewportHeight(this._viewport.clientHeight);
    this._virtualizer.setCount(this._items.length);

    const range = this._virtualizer.getRange();
    this._spacer.style.height = `${Math.max(range.totalHeight, this._viewport.clientHeight)}px`;
    this._itemsLayer.style.transform = `translateY(${range.paddingTop}px)`;

    const fragment = document.createDocumentFragment();
    for (let index = range.start; index < range.end; index += 1) {
      fragment.appendChild(this._renderVisibleItem(index));
    }

    this._itemsLayer.replaceChildren(fragment);
  }

  private _renderVisibleItem(index: number): HTMLElement {
    const item = this._items[index];
    const itemElement = document.createElement('div');
    itemElement.className = 'dt-list-item';
    itemElement.dataset.index = String(index);

    if (this.selectable !== 'none') {
      itemElement.classList.add('dt-list-item--interactive');
      itemElement.setAttribute('role', 'option');
      itemElement.setAttribute('aria-selected', String(this._selectedIndices.has(index)));
      itemElement.tabIndex = 0;
    }

    if (this._selectedIndices.has(index)) {
      itemElement.classList.add('dt-list-item--selected');
    }

    if (this.itemHeight !== null) {
      itemElement.style.minHeight = `${this.itemHeight}px`;
    }

    if (this._renderItem) {
      this._renderItem(item, itemElement, index);
    } else {
      const template = this._getTemplate();
      if (template) {
        itemElement.appendChild(createBoundTemplate(template, ensureRecord(item)));
      } else {
        itemElement.textContent = String(item ?? '');
      }
    }

    itemElement.addEventListener('click', () => this._handleItemClick(index));
    itemElement.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this._handleItemClick(index);
      }
    });

    if (this.itemHeight === null) {
      this._itemResizeObserver?.observe(itemElement);
    }

    return itemElement;
  }

  private _handleItemClick(index: number): void {
    const item = this._items[index];
    const selectable = this.selectable;

    if (selectable === 'single') {
      this._selectedIndices = new Set([index]);
      this._emitSelectionChange();
      this._render();
    } else if (selectable === 'multi') {
      if (this._selectedIndices.has(index)) {
        this._selectedIndices.delete(index);
      } else {
        this._selectedIndices.add(index);
      }
      this._emitSelectionChange();
      this._render();
    }

    this.dispatchEvent(
      new CustomEvent<DtListViewItemClickDetail>('dt-item-click', {
        detail: { item, index },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _emitSelectionChange(): void {
    this.dispatchEvent(
      new CustomEvent<DtListViewSelectionChangeDetail>('dt-selection-change', {
        detail: { selected: this.selectedItems },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _getTemplate(): HTMLTemplateElement | null {
    for (const child of Array.from(this.children)) {
      if (child instanceof HTMLTemplateElement) {
        return child;
      }
    }
    return null;
  }
}
