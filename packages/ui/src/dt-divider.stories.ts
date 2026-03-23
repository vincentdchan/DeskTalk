import type { Meta, StoryObj } from '@storybook/web-components-vite';

import './index';

type DividerStoryArgs = {
  direction: 'horizontal' | 'vertical';
  styleVariant: 'default' | 'subtle' | 'strong';
  spacing: 'sm' | 'md' | 'lg';
};

function createDivider(args: DividerStoryArgs): HTMLElement {
  const container = document.createElement('div');
  container.style.padding = '20px';

  const divider = document.createElement('dt-divider');
  divider.setAttribute('direction', args.direction);
  divider.setAttribute('style-variant', args.styleVariant);
  divider.setAttribute('spacing', args.spacing);

  container.appendChild(divider);
  return container;
}

const meta = {
  title: 'Components/Divider',
  tags: ['autodocs'],
  argTypes: {
    direction: {
      control: 'inline-radio',
      options: ['horizontal', 'vertical'],
    },
    styleVariant: {
      control: 'inline-radio',
      options: ['default', 'subtle', 'strong'],
    },
    spacing: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg'],
    },
  },
  args: {
    direction: 'horizontal',
    styleVariant: 'default',
    spacing: 'md',
  },
  render: createDivider,
} satisfies Meta<DividerStoryArgs>;

export default meta;

type Story = StoryObj<DividerStoryArgs>;

export const Playground: Story = {};

export const StyleVariants: Story = {
  render: () => {
    const stack = document.createElement('div');
    stack.style.display = 'flex';
    stack.style.flexDirection = 'column';
    stack.style.gap = '16px';
    stack.style.padding = '20px';
    stack.style.maxWidth = '400px';

    const variants: DividerStoryArgs['styleVariant'][] = ['default', 'subtle', 'strong'];
    variants.forEach((variant) => {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '12px';

      const label = document.createElement('span');
      label.textContent = variant;
      label.style.fontFamily = 'var(--font-mono)';
      label.style.fontSize = '11px';
      label.style.fontWeight = '700';
      label.style.textTransform = 'uppercase';
      label.style.minWidth = '80px';
      label.style.color = 'var(--dt-text-secondary)';

      const divider = document.createElement('dt-divider');
      divider.setAttribute('style-variant', variant);
      divider.setAttribute('spacing', 'sm');
      divider.style.flex = '1';

      wrapper.append(label, divider);
      stack.appendChild(wrapper);
    });

    return stack;
  },
};

export const Vertical: Story = {
  args: {
    direction: 'vertical',
  },
  render: (args) => {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '12px';
    container.style.padding = '20px';
    container.style.height = '100px';

    const left = document.createElement('span');
    left.textContent = 'Left';

    const divider = document.createElement('dt-divider');
    divider.setAttribute('direction', args.direction);
    divider.setAttribute('style-variant', args.styleVariant);
    divider.setAttribute('spacing', args.spacing);
    divider.style.height = '100%';

    const right = document.createElement('span');
    right.textContent = 'Right';

    container.append(left, divider, right);
    return container;
  },
};
