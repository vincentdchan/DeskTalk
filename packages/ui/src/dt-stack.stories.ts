import type { Meta, StoryObj } from '@storybook/web-components-vite';

import './index';

type StackStoryArgs = {
  direction: 'column' | 'row';
  gap: string;
  align: 'start' | 'center' | 'end' | 'stretch';
  itemCount: number;
};

function createStack(args: StackStoryArgs): HTMLElement {
  const container = document.createElement('div');
  container.style.padding = '20px';

  const stack = document.createElement('dt-stack');
  stack.setAttribute('direction', args.direction);
  stack.setAttribute('gap', args.gap);
  stack.setAttribute('align', args.align);

  const items = [
    { title: 'First Item', variant: 'default' },
    { title: 'Second Item', variant: 'outlined' },
    { title: 'Third Item', variant: 'filled' },
  ].slice(0, args.itemCount);

  items.forEach((item) => {
    const card = document.createElement('dt-card');
    card.setAttribute('variant', item.variant);

    const heading = document.createElement('h4');
    heading.textContent = item.title;

    const desc = document.createElement('p');
    desc.textContent = 'Stack item content';

    card.append(heading, desc);
    stack.appendChild(card);
  });

  container.appendChild(stack);
  return container;
}

const meta = {
  title: 'Components/Stack',
  tags: ['autodocs'],
  argTypes: {
    direction: {
      control: 'inline-radio',
      options: ['column', 'row'],
    },
    gap: {
      control: 'select',
      options: ['0', '4', '8', '12', '16', '20', '24', '32'],
    },
    align: {
      control: 'inline-radio',
      options: ['start', 'center', 'end', 'stretch'],
    },
    itemCount: {
      control: { type: 'number', min: 1, max: 5, step: 1 },
    },
  },
  args: {
    direction: 'column',
    gap: '16',
    align: 'stretch',
    itemCount: 3,
  },
  render: createStack,
} satisfies Meta<StackStoryArgs>;

export default meta;

type Story = StoryObj<StackStoryArgs>;

export const Playground: Story = {};

export const HorizontalRow: Story = {
  args: {
    direction: 'row',
    gap: '12',
    align: 'start',
    itemCount: 3,
  },
};

export const HorizontalCentered: Story = {
  args: {
    direction: 'row',
    gap: '24',
    align: 'center',
    itemCount: 3,
  },
};
