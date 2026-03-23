import type { Meta, StoryObj } from '@storybook/web-components-vite';

import './index';

type StatStoryArgs = {
  label: string;
  value: string;
  description: string;
  size: 'sm' | 'md' | 'lg';
  variant: 'default' | 'outlined' | 'filled';
  trend: 'up' | 'down' | 'neutral' | null;
  trendValue: string;
};

function createStat(args: StatStoryArgs): HTMLElement {
  const container = document.createElement('div');
  container.style.padding = '20px';
  container.style.maxWidth = '400px';

  const stat = document.createElement('dt-stat');
  stat.setAttribute('label', args.label);
  stat.setAttribute('value', args.value);
  if (args.description) {
    stat.setAttribute('description', args.description);
  }
  stat.setAttribute('size', args.size);
  stat.setAttribute('variant', args.variant);
  if (args.trend && args.trendValue) {
    stat.setAttribute('trend', args.trend);
    stat.setAttribute('trend-value', args.trendValue);
  }

  container.appendChild(stat);
  return container;
}

const meta = {
  title: 'Components/Stat',
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg'],
    },
    variant: {
      control: 'inline-radio',
      options: ['default', 'outlined', 'filled'],
    },
    trend: {
      control: 'select',
      options: ['up', 'down', 'neutral', null],
    },
  },
  args: {
    label: 'CPU Usage',
    value: '42%',
    description: 'Normal load',
    size: 'md',
    variant: 'default',
    trend: null,
    trendValue: '+5%',
  },
  render: createStat,
} satisfies Meta<StatStoryArgs>;

export default meta;

type Story = StoryObj<StatStoryArgs>;

export const Playground: Story = {};

export const WithTrend: Story = {
  args: {
    label: 'Traffic',
    value: '12.5k',
    description: 'visitors today',
    trend: 'up',
    trendValue: '+18%',
  },
};

export const LargeVariant: Story = {
  args: {
    label: 'Uptime',
    value: '99.9%',
    size: 'lg',
    variant: 'filled',
  },
};

export const SizeComparison: Story = {
  render: () => {
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gap = '16px';

    const sizes: StatStoryArgs['size'][] = ['sm', 'md', 'lg'];
    sizes.forEach((size) => {
      const stat = document.createElement('dt-stat');
      stat.setAttribute('label', 'Memory');
      stat.setAttribute('value', '8.2 GB');
      stat.setAttribute('description', 'of 16 GB used');
      stat.setAttribute('size', size);
      grid.appendChild(stat);
    });

    return grid;
  },
};
