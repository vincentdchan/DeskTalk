import type * as React from 'react';

export {};

type DtTooltipAttributes = Partial<{
  content: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  delay: number | string;
  disabled: boolean;
  class: string;
  style: string | Record<string, string>;
}>;

type DtTooltipJSXProps = DtTooltipAttributes & {
  children?: unknown;
  ref?: unknown;
  key?: string | number | null;
};

type DtCardAttributes = Partial<{
  variant: 'default' | 'outlined' | 'filled';
  class: string;
  style: string | Record<string, string>;
}>;

type DtCardJSXProps = DtCardAttributes & {
  children?: unknown;
  ref?: unknown;
  key?: string | number | null;
};

type DtSelectAttributes = Partial<{
  id: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  disabled: boolean;
  align: 'left' | 'right';
  'ondt-change': (event: CustomEvent<{ value: string }>) => void;
  class: string;
  style: string | Record<string, string>;
}>;

type DtSelectJSXProps = DtSelectAttributes & {
  children?: unknown;
  ref?: unknown;
  key?: string | number | null;
};

type DtGridAttributes = Partial<{
  cols: '1' | '2' | '3' | '4' | '5' | '6';
  gap: '0' | '4' | '8' | '12' | '16' | '20' | '24' | '32';
  'min-width': '150' | '180' | '200' | '220' | '260' | '300';
  class: string;
  style: string | Record<string, string>;
}>;

type DtGridJSXProps = DtGridAttributes & {
  children?: unknown;
  ref?: unknown;
  key?: string | number | null;
};

type DtStackAttributes = Partial<{
  direction: 'column' | 'row';
  gap: '0' | '4' | '8' | '12' | '16' | '20' | '24' | '32';
  align: 'start' | 'center' | 'end' | 'stretch';
  class: string;
  style: string | Record<string, string>;
}>;

type DtStackJSXProps = DtStackAttributes & {
  children?: unknown;
  ref?: unknown;
  key?: string | number | null;
};

type DtStatAttributes = Partial<{
  label: string;
  value: string;
  description: string;
  size: 'sm' | 'md' | 'lg';
  variant: 'default' | 'outlined' | 'filled';
  trend: 'up' | 'down' | 'neutral';
  'trend-value': string;
  class: string;
  style: string | Record<string, string>;
}>;

type DtStatJSXProps = DtStatAttributes & {
  children?: unknown;
  ref?: unknown;
  key?: string | number | null;
};

type DtBadgeAttributes = Partial<{
  variant: 'accent' | 'success' | 'danger' | 'warning' | 'info' | 'default' | 'neutral';
  size: 'sm' | 'md' | 'lg';
  text: string;
  class: string;
  style: string | Record<string, string>;
}>;

type DtBadgeJSXProps = DtBadgeAttributes & {
  children?: unknown;
  ref?: unknown;
  key?: string | number | null;
};

type DtButtonAttributes = Partial<{
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size: 'sm' | 'md' | 'lg';
  disabled: boolean;
  fullwidth: boolean;
  type: 'button' | 'submit' | 'reset';
  class: string;
  style: string | Record<string, string>;
}>;

type DtButtonJSXProps = DtButtonAttributes & {
  children?: unknown;
  onClick?: React.MouseEventHandler<HTMLElement>;
  ref?: unknown;
  key?: string | number | null;
};

type DtDividerAttributes = Partial<{
  direction: 'horizontal' | 'vertical';
  'style-variant': 'default' | 'subtle' | 'strong';
  spacing: 'sm' | 'md' | 'lg';
  class: string;
  style: string | Record<string, string>;
}>;

type DtDividerJSXProps = DtDividerAttributes & {
  children?: unknown;
  ref?: unknown;
  key?: string | number | null;
};

type DtListViewAttributes = Partial<{
  'item-height': number | string;
  dividers: boolean;
  selectable: 'none' | 'single' | 'multi';
  'empty-text': string;
  class: string;
  style: string | Record<string, string>;
}>;

type DtListViewJSXProps = DtListViewAttributes & {
  children?: unknown;
  ref?: unknown;
  key?: string | number | null;
};

type DtTableViewAttributes = Partial<{
  'row-height': number | string;
  sortable: boolean;
  striped: boolean;
  bordered: boolean;
  'empty-text': string;
  class: string;
  style: string | Record<string, string>;
}>;

type DtTableViewJSXProps = DtTableViewAttributes & {
  children?: unknown;
  ref?: unknown;
  key?: string | number | null;
};

type DtColumnAttributes = Partial<{
  field: string;
  header: string;
  width: string;
  'min-width': string;
  align: 'left' | 'center' | 'right';
  class: string;
  style: string | Record<string, string>;
}>;

type DtColumnJSXProps = DtColumnAttributes & {
  children?: unknown;
  ref?: unknown;
  key?: string | number | null;
};

type DtChartAttributes = Partial<{
  type: 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'radar' | 'scatter' | 'bubble';
  legend: 'top' | 'bottom' | 'left' | 'right' | 'none';
  stacked: boolean;
  labels: string;
  class: string;
  style: string | Record<string, string>;
}>;

type DtChartJSXProps = DtChartAttributes & {
  children?: unknown;
  ref?: unknown;
  key?: string | number | null;
};

type DtMarkdownAttributes = Partial<{
  streaming: boolean;
  'unsafe-html': boolean;
  class: string;
  style: string | Record<string, string>;
}>;

type DtMarkdownJSXProps = DtMarkdownAttributes & {
  children?: unknown;
  ref?: unknown;
  key?: string | number | null;
};

type DtMarkdownEditorAttributes = Partial<{
  placeholder: string;
  readonly: boolean;
  class: string;
  style: string | Record<string, string>;
}>;

type DtMarkdownEditorJSXProps = DtMarkdownEditorAttributes & {
  children?: unknown;
  ref?: unknown;
  key?: string | number | null;
};

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'dt-tooltip': DtTooltipJSXProps;
      'dt-card': DtCardJSXProps;
      'dt-select': DtSelectJSXProps;
      'dt-grid': DtGridJSXProps;
      'dt-stack': DtStackJSXProps;
      'dt-stat': DtStatJSXProps;
      'dt-badge': DtBadgeJSXProps;
      'dt-button': DtButtonJSXProps;
      'dt-divider': DtDividerJSXProps;
      'dt-list-view': DtListViewJSXProps;
      'dt-table-view': DtTableViewJSXProps;
      'dt-column': DtColumnJSXProps;
      'dt-chart': DtChartJSXProps;
      'dt-markdown': DtMarkdownJSXProps;
      'dt-markdown-editor': DtMarkdownEditorJSXProps;
    }
  }
}
