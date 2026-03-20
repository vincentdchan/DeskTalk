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

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'dt-tooltip': DtTooltipJSXProps;
    }
  }
}
