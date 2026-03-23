import type { Meta, StoryObj } from '@storybook/web-components-vite';

import './index';

type GridStoryArgs = {
  cols: string | null;
  gap: string;
  minWidth: string;
  itemCount: number;
};

function createGrid(args: GridStoryArgs): HTMLElement {
  const container = document.createElement('div');
  container.style.padding = '20px';

  const grid = document.createElement('dt-grid');
  if (args.cols) {
    grid.setAttribute('cols', args.cols);
  }
  grid.setAttribute('gap', args.gap);
  grid.setAttribute('min-width', args.minWidth);

  for (let i = 1; i <= args.itemCount; i++) {
    const card = document.createElement('dt-card');
    card.setAttribute('variant', i % 2 === 0 ? 'outlined' : 'default');

    const heading = document.createElement('h4');
    heading.textContent = `Item ${i}`;

    const desc = document.createElement('p');
    desc.textContent = 'Grid item content';

    card.append(heading, desc);
    grid.appendChild(card);
  }

  container.appendChild(grid);
  return container;
}

const meta = {
  title: 'Components/Grid',
  tags: ['autodocs'],
  argTypes: {
    cols: {
      control: 'select',
      options: ['1', '2', '3', '4', '5', '6', null],
      description: 'Fixed number of columns (auto-fit when null)',
    },
    gap: {
      control: 'select',
      options: ['0', '4', '8', '12', '16', '20', '24', '32'],
    },
    minWidth: {
      control: 'select',
      options: ['150', '180', '200', '220', '260', '300'],
    },
    itemCount: {
      control: { type: 'number', min: 1, max: 12, step: 1 },
    },
  },
  args: {
    cols: null,
    gap: '16',
    minWidth: '220',
    itemCount: 6,
  },
  render: createGrid,
} satisfies Meta<GridStoryArgs>;

export default meta;

type Story = StoryObj<GridStoryArgs>;

export const Playground: Story = {};

export const FixedColumns: Story = {
  args: {
    cols: '3',
    gap: '20',
    itemCount: 6,
  },
};

export const NarrowItems: Story = {
  args: {
    minWidth: '150',
    gap: '12',
    itemCount: 8,
  },
};
