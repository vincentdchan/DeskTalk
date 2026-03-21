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
  value: string;
  placeholder: string;
  disabled: boolean;
  align: 'left' | 'right';
  class: string;
  style: string | Record<string, string>;
}>;

type DtSelectJSXProps = DtSelectAttributes & {
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
    }
  }
}
