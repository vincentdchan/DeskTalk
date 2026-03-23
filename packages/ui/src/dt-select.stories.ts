import type { Meta, StoryObj } from '@storybook/web-components-vite';

import './index';
import type { DtSelectOption } from './dt-select';

type SelectStoryArgs = {
  align: 'left' | 'right';
  disabled: boolean;
  placeholder: string;
  value: string;
  options: DtSelectOption[];
  onChange: (value: string) => void;
};

function createSelect(args: SelectStoryArgs): HTMLElement {
  const stack = document.createElement('div');
  stack.style.display = 'grid';
  stack.style.gap = '14px';
  stack.style.maxWidth = '360px';

  const label = document.createElement('label');
  label.textContent = 'Workspace';
  label.style.color = 'var(--dt-text-secondary)';
  label.style.fontFamily = 'var(--font-mono)';
  label.style.fontSize = '11px';
  label.style.fontWeight = '700';
  label.style.letterSpacing = '0.12em';
  label.style.textTransform = 'uppercase';

  const select = document.createElement('dt-select') as HTMLElement & {
    options: DtSelectOption[];
  };
  select.setAttribute('align', args.align);
  select.setAttribute('placeholder', args.placeholder);
  if (args.value) {
    select.setAttribute('value', args.value);
  }
  if (args.disabled) {
    select.setAttribute('disabled', '');
  }
  select.options = args.options;
  select.addEventListener('dt-change', (event) => {
    args.onChange((event as CustomEvent<{ value: string }>).detail.value);
  });

  const helper = document.createElement('p');
  helper.textContent =
    'Open the menu to check popup placement, glass treatment, and selected-state contrast.';
  helper.style.margin = '0';
  helper.style.color = 'var(--dt-text-secondary)';
  helper.style.fontSize = '0.95rem';

  stack.append(label, select, helper);
  return stack;
}

const meta = {
  title: 'Components/Select',
  tags: ['autodocs'],
  argTypes: {
    align: {
      control: 'inline-radio',
      options: ['left', 'right'],
    },
    onChange: {
      action: 'dt-change',
    },
  },
  args: {
    align: 'left',
    disabled: false,
    placeholder: 'Choose a workspace',
    value: 'notes',
    options: [
      { value: 'notes', label: 'Notes' },
      { value: 'terminal', label: 'Terminal' },
      { value: 'tasks', label: 'Tasks' },
      { value: 'preview', label: 'Preview' },
    ],
  },
  render: createSelect,
} satisfies Meta<SelectStoryArgs>;

export default meta;

type Story = StoryObj<SelectStoryArgs>;

export const Playground: Story = {};

export const RightAligned: Story = {
  args: {
    align: 'right',
    value: 'terminal',
  },
  render: (args: SelectStoryArgs) => {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.justifyContent = 'flex-end';
    wrap.style.paddingTop = '36px';
    wrap.appendChild(createSelect(args));
    return wrap;
  },
};
