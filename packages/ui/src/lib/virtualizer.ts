export interface VirtualRange {
  start: number;
  end: number;
  paddingTop: number;
  paddingBottom: number;
  totalHeight: number;
}

interface VirtualizerOptions {
  count?: number;
  estimateSize?: number;
  overscan?: number;
  fixedSize?: number | null;
}

export class DtVirtualizer {
  private _count = 0;
  private _estimateSize = 56;
  private _overscan = 5;
  private _fixedSize: number | null = null;
  private _viewportHeight = 0;
  private _scrollTop = 0;
  private _sizes = new Map<number, number>();

  constructor(options: VirtualizerOptions = {}) {
    this._count = options.count ?? 0;
    this._estimateSize = options.estimateSize ?? 56;
    this._overscan = options.overscan ?? 5;
    this._fixedSize = options.fixedSize ?? null;
  }

  setCount(count: number): void {
    this._count = Math.max(0, count);
    for (const index of this._sizes.keys()) {
      if (index >= this._count) {
        this._sizes.delete(index);
      }
    }
  }

  setViewportHeight(height: number): void {
    this._viewportHeight = Math.max(0, height);
  }

  setScrollTop(scrollTop: number): void {
    this._scrollTop = Math.max(0, scrollTop);
  }

  setEstimateSize(size: number): void {
    this._estimateSize = Math.max(1, size);
  }

  setFixedSize(size: number | null): void {
    this._fixedSize = size && size > 0 ? size : null;
  }

  resetMeasurements(): void {
    this._sizes.clear();
  }

  measure(index: number, size: number): number {
    if (this._fixedSize !== null || index < 0 || index >= this._count) {
      return 0;
    }

    const normalized = Math.max(1, Math.round(size));
    const previous = this._sizes.get(index);
    if (previous === normalized) {
      return 0;
    }

    this._sizes.set(index, normalized);

    if (this.getOffset(index + 1) <= this._scrollTop) {
      return normalized - (previous ?? this._estimateSize);
    }

    return 0;
  }

  getOffset(index: number): number {
    if (index <= 0) {
      return 0;
    }

    const boundedIndex = Math.min(index, this._count);

    if (this._fixedSize !== null) {
      return boundedIndex * this._fixedSize;
    }

    let offset = 0;
    for (let i = 0; i < boundedIndex; i += 1) {
      offset += this._sizes.get(i) ?? this._estimateSize;
    }
    return offset;
  }

  getTotalHeight(): number {
    return this.getOffset(this._count);
  }

  getRange(): VirtualRange {
    if (this._count === 0) {
      return { start: 0, end: 0, paddingTop: 0, paddingBottom: 0, totalHeight: 0 };
    }

    if (this._fixedSize !== null) {
      const visibleCount = Math.max(1, Math.ceil(this._viewportHeight / this._fixedSize));
      const start = Math.max(0, Math.floor(this._scrollTop / this._fixedSize) - this._overscan);
      const end = Math.min(this._count, start + visibleCount + this._overscan * 2);
      const paddingTop = start * this._fixedSize;
      const totalHeight = this._count * this._fixedSize;
      const paddingBottom = Math.max(0, totalHeight - paddingTop - (end - start) * this._fixedSize);
      return { start, end, paddingTop, paddingBottom, totalHeight };
    }

    let start = 0;
    let offset = 0;
    while (start < this._count) {
      const size = this._sizes.get(start) ?? this._estimateSize;
      if (offset + size > this._scrollTop) {
        break;
      }
      offset += size;
      start += 1;
    }

    start = Math.max(0, start - this._overscan);
    const paddingTop = this.getOffset(start);

    let end = start;
    let renderedHeight = 0;
    while (end < this._count && renderedHeight < this._viewportHeight) {
      renderedHeight += this._sizes.get(end) ?? this._estimateSize;
      end += 1;
    }
    end = Math.min(this._count, end + this._overscan);

    const totalHeight = this.getTotalHeight();
    const paddingBottom = Math.max(0, totalHeight - this.getOffset(end));

    return { start, end, paddingTop, paddingBottom, totalHeight };
  }
}
