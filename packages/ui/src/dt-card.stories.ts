import type { Meta, StoryObj } from '@storybook/web-components-vite';

import './index';

type CardStoryArgs = {
  variant: 'default' | 'outlined' | 'filled';
  heading: string;
  body: string;
  eyebrow: string;
};

function createCard(args: CardStoryArgs): HTMLElement {
  const frame = document.createElement('div');
  frame.style.maxWidth = '560px';

  const card = document.createElement('dt-card');
  if (args.variant !== 'default') {
    card.setAttribute('variant', args.variant);
  }

  const eyebrow = document.createElement('p');
  eyebrow.textContent = args.eyebrow;
  eyebrow.style.marginBottom = '10px';
  eyebrow.style.fontFamily = 'var(--font-mono)';
  eyebrow.style.fontSize = '11px';
  eyebrow.style.fontWeight = '700';
  eyebrow.style.letterSpacing = '0.14em';
  eyebrow.style.textTransform = 'uppercase';
  eyebrow.style.color = 'var(--dt-accent)';

  const heading = document.createElement('h3');
  heading.textContent = args.heading;

  const body = document.createElement('p');
  body.textContent = args.body;

  card.append(eyebrow, heading, body);
  frame.appendChild(card);

  return frame;
}

const meta = {
  title: 'Components/Card',
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['default', 'outlined', 'filled'],
    },
  },
  args: {
    variant: 'default',
    eyebrow: 'Context panel',
    heading: 'Card title',
    body: 'Use the variant control to compare neutral, outlined, and accent-tinted surfaces against the live DeskTalk theme.',
  },
  render: createCard,
} satisfies Meta<CardStoryArgs>;

export default meta;

type Story = StoryObj<CardStoryArgs>;

export const Playground: Story = {};

export const VariantGrid: Story = {
  render: () => {
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(240px, 1fr))';
    grid.style.gap = '18px';

    const variants: CardStoryArgs['variant'][] = ['default', 'outlined', 'filled'];

    for (const variant of variants) {
      grid.appendChild(
        createCard({
          variant,
          eyebrow: variant,
          heading: `${variant[0].toUpperCase()}${variant.slice(1)} card`,
          body: 'Check border emphasis, surface contrast, and text balance while you adjust theme globals.',
        }),
      );
    }

    return grid;
  },
};
