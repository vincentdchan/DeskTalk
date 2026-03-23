import type { Meta, StoryObj } from '@storybook/web-components-vite';

import './index';

type BadgeStoryArgs = {
  variant: 'accent' | 'success' | 'danger' | 'warning' | 'info' | 'default' | 'neutral';
  size: 'sm' | 'md' | 'lg';
  text: string;
};

function createBadge(args: BadgeStoryArgs): HTMLElement {
  const container = document.createElement('div');
  container.style.padding = '20px';

  const badge = document.createElement('dt-badge');
  badge.setAttribute('variant', args.variant);
  badge.setAttribute('size', args.size);
  badge.textContent = args.text;

  container.appendChild(badge);
  return container;
}

const meta = {
  title: 'Components/Badge',
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['accent', 'success', 'danger', 'warning', 'info', 'default', 'neutral'],
    },
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg'],
    },
  },
  args: {
    variant: 'accent',
    size: 'md',
    text: 'Badge',
  },
  render: createBadge,
} satisfies Meta<BadgeStoryArgs>;

export default meta;

type Story = StoryObj<BadgeStoryArgs>;

export const Playground: Story = {};

export const VariantShowcase: Story = {
  render: () => {
    const grid = document.createElement('div');
    grid.style.display = 'flex';
    grid.style.flexWrap = 'wrap';
    grid.style.gap = '12px';
    grid.style.padding = '20px';

    const variants: BadgeStoryArgs['variant'][] = [
      'accent',
      'success',
      'danger',
      'warning',
      'info',
      'default',
      'neutral',
    ];

    variants.forEach((variant) => {
      const badge = document.createElement('dt-badge');
      badge.setAttribute('variant', variant);
      badge.textContent = variant;
      grid.appendChild(badge);
    });

    return grid;
  },
};

export const SizeComparison: Story = {
  render: () => {
    const stack = document.createElement('div');
    stack.style.display = 'flex';
    stack.style.flexDirection = 'column';
    stack.style.gap = '12px';
    stack.style.padding = '20px';

    const sizes: BadgeStoryArgs['size'][] = ['sm', 'md', 'lg'];
    sizes.forEach((size) => {
      const badge = document.createElement('dt-badge');
      badge.setAttribute('size', size);
      badge.textContent = `${size.toUpperCase()} Badge`;
      stack.appendChild(badge);
    });

    return stack;
  },
};
