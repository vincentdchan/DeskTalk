import type { Meta, StoryObj } from '@storybook/web-components-vite';

import './index';

type ButtonStoryArgs = {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size: 'sm' | 'md' | 'lg';
  disabled: boolean;
  fullwidth: boolean;
  text: string;
};

function createButton(args: ButtonStoryArgs): HTMLElement {
  const container = document.createElement('div');
  container.style.padding = '20px';

  const button = document.createElement('dt-button');
  button.setAttribute('variant', args.variant);
  button.setAttribute('size', args.size);
  if (args.disabled) {
    button.setAttribute('disabled', '');
  }
  if (args.fullwidth) {
    button.setAttribute('fullwidth', '');
  }
  button.textContent = args.text;

  container.appendChild(button);
  return container;
}

const meta = {
  title: 'Components/Button',
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['primary', 'secondary', 'ghost', 'danger'],
    },
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg'],
    },
  },
  args: {
    variant: 'primary',
    size: 'md',
    disabled: false,
    fullwidth: false,
    text: 'Button',
  },
  render: createButton,
} satisfies Meta<ButtonStoryArgs>;

export default meta;

type Story = StoryObj<ButtonStoryArgs>;

export const Playground: Story = {};

export const VariantShowcase: Story = {
  render: () => {
    const stack = document.createElement('div');
    stack.style.display = 'flex';
    stack.style.flexWrap = 'wrap';
    stack.style.gap = '12px';
    stack.style.padding = '20px';

    const variants: ButtonStoryArgs['variant'][] = ['primary', 'secondary', 'ghost', 'danger'];
    variants.forEach((variant) => {
      const button = document.createElement('dt-button');
      button.setAttribute('variant', variant);
      button.textContent = variant;
      stack.appendChild(button);
    });

    return stack;
  },
};

export const SizeComparison: Story = {
  render: () => {
    const stack = document.createElement('div');
    stack.style.display = 'flex';
    stack.style.flexWrap = 'wrap';
    stack.style.gap = '12px';
    stack.style.padding = '20px';

    const sizes: ButtonStoryArgs['size'][] = ['sm', 'md', 'lg'];
    sizes.forEach((size) => {
      const button = document.createElement('dt-button');
      button.setAttribute('size', size);
      button.textContent = `${size.toUpperCase()} Button`;
      stack.appendChild(button);
    });

    return stack;
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    text: 'Disabled',
  },
};

export const FullWidth: Story = {
  args: {
    fullwidth: true,
    text: 'Full Width Button',
  },
  render: (args) => {
    const container = document.createElement('div');
    container.style.padding = '20px';
    container.style.maxWidth = '400px';

    const button = document.createElement('dt-button');
    button.setAttribute('variant', args.variant);
    button.setAttribute('size', args.size);
    if (args.disabled) {
      button.setAttribute('disabled', '');
    }
    if (args.fullwidth) {
      button.setAttribute('fullwidth', '');
    }
    button.textContent = args.text;

    container.appendChild(button);
    return container;
  },
};
