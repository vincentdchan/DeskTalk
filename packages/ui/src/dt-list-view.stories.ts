import type { Meta, StoryObj } from '@storybook/web-components-vite';

import './index';

type ListViewStoryArgs = {
  itemHeight: number | null;
  dividers: boolean;
  selectable: 'none' | 'single' | 'multi';
  count: number;
};

function createListItems(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    title: `Agent task ${index + 1}`,
    status: index % 3 === 0 ? 'running' : index % 3 === 1 ? 'queued' : 'done',
    statusVariant: index % 3 === 0 ? 'info' : index % 3 === 1 ? 'warning' : 'success',
    owner: ['Mila', 'Jun', 'Ari', 'Noah'][index % 4],
    notes:
      index % 2 === 0
        ? 'Short note for a compact fixed-height row.'
        : 'Longer note content to demonstrate variable-height rows when item-height is omitted from the component.',
  }));
}

function createListView(args: ListViewStoryArgs): HTMLElement {
  const container = document.createElement('div');
  container.style.padding = '20px';
  container.style.height = '480px';

  const list = document.createElement('dt-list-view') as HTMLElement & { items: unknown[] };
  list.style.height = '100%';
  list.setAttribute('selectable', args.selectable);
  if (args.dividers) {
    list.setAttribute('dividers', '');
  }
  if (args.itemHeight !== null) {
    list.setAttribute('item-height', String(args.itemHeight));
  }

  const template = document.createElement('template');
  template.innerHTML = `
    <dt-stack gap="8">
      <dt-stack direction="row" align="center" gap="8">
        <strong data-field="title"></strong>
        <dt-badge data-field="status" data-field-variant="statusVariant"></dt-badge>
      </dt-stack>
      <dt-stack direction="row" align="center" gap="8">
        <span class="text-secondary">Owner</span>
        <span data-field="owner"></span>
      </dt-stack>
      <span class="text-muted" data-field="notes"></span>
    </dt-stack>
  `;

  list.appendChild(template);
  list.items = createListItems(args.count);
  container.appendChild(list);
  return container;
}

const meta = {
  title: 'Components/List View',
  tags: ['autodocs'],
  argTypes: {
    itemHeight: {
      control: { type: 'number', min: 32, max: 120, step: 4 },
      description: 'Set to null to enable variable-height measurement mode.',
    },
    selectable: {
      control: 'inline-radio',
      options: ['none', 'single', 'multi'],
    },
    count: {
      control: { type: 'number', min: 0, max: 500, step: 10 },
    },
  },
  args: {
    itemHeight: 72,
    dividers: true,
    selectable: 'single',
    count: 120,
  },
  render: createListView,
} satisfies Meta<ListViewStoryArgs>;

export default meta;

type Story = StoryObj<ListViewStoryArgs>;

export const Playground: Story = {};

export const VariableHeight: Story = {
  args: {
    itemHeight: null,
    selectable: 'none',
    count: 40,
  },
};

export const LargeDataset: Story = {
  args: {
    itemHeight: 64,
    count: 1000,
    selectable: 'multi',
  },
};
