import type { Meta, StoryObj } from '@storybook/web-components-vite';

import './index';
import './chart-entry';

type ChartStoryArgs = {
  type: 'bar' | 'line' | 'area' | 'doughnut' | 'radar';
  legend: 'top' | 'bottom' | 'left' | 'right' | 'none';
  stacked: boolean;
};

function createChart(args: ChartStoryArgs): HTMLElement {
  const container = document.createElement('div');
  container.style.padding = '20px';
  container.style.height = '440px';

  const chart = document.createElement('dt-chart') as HTMLElement & { data: unknown };
  chart.style.height = '100%';
  chart.setAttribute('type', args.type);
  chart.setAttribute('legend', args.legend);
  chart.setAttribute('labels', 'Jan,Feb,Mar,Apr,May,Jun');
  if (args.stacked) {
    chart.setAttribute('stacked', '');
  }

  chart.data = {
    datasets: [
      { label: 'Online', data: [12, 19, 3, 5, 2, 3] },
      { label: 'Retail', data: [7, 11, 5, 8, 3, 7] },
    ],
  };

  container.appendChild(chart);
  return container;
}

function createScatterChart(): HTMLElement {
  const container = document.createElement('div');
  container.style.padding = '20px';
  container.style.height = '420px';

  const chart = document.createElement('dt-chart') as HTMLElement & { data: unknown };
  chart.style.height = '100%';
  chart.setAttribute('type', 'scatter');
  chart.setAttribute('legend', 'top');
  chart.data = {
    datasets: [
      {
        label: 'Samples',
        data: [
          { x: 1, y: 2 },
          { x: 2, y: 3.5 },
          { x: 3.2, y: 2.4 },
          { x: 4.1, y: 4.3 },
          { x: 5, y: 3.7 },
        ],
      },
    ],
  };

  container.appendChild(chart);
  return container;
}

const meta = {
  title: 'Components/Chart',
  tags: ['autodocs'],
  args: {
    type: 'bar',
    legend: 'top',
    stacked: false,
  },
  render: createChart,
} satisfies Meta<ChartStoryArgs>;

export default meta;

type Story = StoryObj<ChartStoryArgs>;

export const Playground: Story = {};

export const StackedArea: Story = {
  args: {
    type: 'area',
    legend: 'top',
    stacked: true,
  },
};

export const Doughnut: Story = {
  args: {
    type: 'doughnut',
    legend: 'right',
    stacked: false,
  },
};

export const Scatter: StoryObj = {
  render: createScatterChart,
};
