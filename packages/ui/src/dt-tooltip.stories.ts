import type { Meta, StoryObj } from '@storybook/web-components-vite';

import './index';

type TooltipStoryArgs = {
  content: string;
  delay: number;
  disabled: boolean;
  placement: 'top' | 'bottom' | 'left' | 'right';
  triggerLabel: string;
};

function createTrigger(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.padding = '10px 14px';
  button.style.border = '1px solid var(--dt-border)';
  button.style.borderRadius = '999px';
  button.style.background = 'color-mix(in oklab, var(--dt-surface) 88%, transparent)';
  button.style.color = 'var(--dt-text)';
  button.style.cursor = 'pointer';
  button.style.fontFamily = 'var(--font-mono)';
  button.style.fontSize = '12px';
  button.style.fontWeight = '700';
  button.style.letterSpacing = '0.08em';
  button.style.textTransform = 'uppercase';
  return button;
}

function createTooltip(args: TooltipStoryArgs): HTMLElement {
  const stage = document.createElement('div');
  stage.style.display = 'grid';
  stage.style.minHeight = '320px';
  stage.style.placeItems = 'center';

  const tooltip = document.createElement('dt-tooltip');
  tooltip.setAttribute('content', args.content);
  tooltip.setAttribute('placement', args.placement);
  tooltip.setAttribute('delay', String(args.delay));
  if (args.disabled) {
    tooltip.setAttribute('disabled', '');
  }

  tooltip.appendChild(createTrigger(args.triggerLabel));
  stage.appendChild(tooltip);

  return stage;
}

const meta = {
  title: 'Components/Tooltip',
  tags: ['autodocs'],
  argTypes: {
    placement: {
      control: 'inline-radio',
      options: ['top', 'bottom', 'left', 'right'],
    },
    delay: {
      control: {
        type: 'range',
        min: 0,
        max: 1000,
        step: 50,
      },
    },
  },
  args: {
    content: 'Toggle your active workspace',
    delay: 150,
    disabled: false,
    placement: 'top',
    triggerLabel: 'Hover me',
  },
  render: createTooltip,
} satisfies Meta<TooltipStoryArgs>;

export default meta;

type Story = StoryObj<TooltipStoryArgs>;

export const Playground: Story = {};

export const PlacementMatrix: Story = {
  render: () => {
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(180px, 1fr))';
    grid.style.gap = '20px';
    grid.style.alignItems = 'center';

    const placements: TooltipStoryArgs['placement'][] = ['top', 'right', 'bottom', 'left'];

    for (const placement of placements) {
      const cell = document.createElement('div');
      cell.style.display = 'grid';
      cell.style.gap = '14px';
      cell.style.justifyItems = 'center';
      cell.style.padding = '20px';
      cell.style.border = '1px solid var(--dt-border-subtle)';
      cell.style.borderRadius = '16px';
      cell.style.background = 'color-mix(in oklab, var(--dt-surface) 92%, transparent)';

      const label = document.createElement('div');
      label.textContent = placement;
      label.style.color = 'var(--dt-text-secondary)';
      label.style.fontFamily = 'var(--font-mono)';
      label.style.fontSize = '11px';
      label.style.fontWeight = '700';
      label.style.letterSpacing = '0.12em';
      label.style.textTransform = 'uppercase';

      cell.append(
        label,
        createTooltip({
          content: `Placement: ${placement}`,
          delay: 0,
          disabled: false,
          placement,
          triggerLabel: placement,
        }),
      );
      grid.appendChild(cell);
    }

    return grid;
  },
};
