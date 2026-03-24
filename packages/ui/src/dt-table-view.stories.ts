import type { Meta, StoryObj } from '@storybook/web-components-vite';

import './index';

type TableViewStoryArgs = {
  rowHeight: number;
  sortable: boolean;
  striped: boolean;
  bordered: boolean;
  count: number;
};

function createRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `worker-${index + 1}`,
    cpu: (Math.random() * 40).toFixed(1),
    memory: `${128 + (index % 16) * 64} MB`,
    status: index % 4 === 0 ? 'degraded' : index % 3 === 0 ? 'idle' : 'running',
    statusVariant: index % 4 === 0 ? 'warning' : index % 3 === 0 ? 'neutral' : 'success',
  }));
}

function createTableView(args: TableViewStoryArgs): HTMLElement {
  const container = document.createElement('div');
  container.style.padding = '20px';
  container.style.height = '480px';

  const table = document.createElement('dt-table-view') as HTMLElement & { rows: unknown[] };
  table.style.height = '100%';
  table.setAttribute('row-height', String(args.rowHeight));
  if (args.sortable) table.setAttribute('sortable', '');
  if (args.striped) table.setAttribute('striped', '');
  if (args.bordered) table.setAttribute('bordered', '');

  const columns = [
    ['name', 'Process', '220', '160', 'left'],
    ['cpu', 'CPU %', '100', '80', 'right'],
    ['memory', 'Memory', '120', '100', 'right'],
  ] as const;

  for (const [field, header, width, minWidth, align] of columns) {
    const column = document.createElement('dt-column');
    column.setAttribute('field', field);
    column.setAttribute('header', header);
    column.setAttribute('width', width);
    column.setAttribute('min-width', minWidth);
    column.setAttribute('align', align);
    table.appendChild(column);
  }

  const statusColumn = document.createElement('dt-column');
  statusColumn.setAttribute('field', 'status');
  statusColumn.setAttribute('header', 'Status');
  statusColumn.setAttribute('width', '140');
  const template = document.createElement('template');
  template.innerHTML = `<dt-badge data-field="status" data-field-variant="statusVariant"></dt-badge>`;
  statusColumn.appendChild(template);
  table.appendChild(statusColumn);

  const rows = createRows(args.count);
  table.rows = rows;
  table.addEventListener('dt-sort', (event) => {
    const customEvent = event as CustomEvent<{
      field: keyof (typeof rows)[number];
      direction: 'asc' | 'desc';
    }>;
    const { field, direction } = customEvent.detail;
    table.rows = [...rows].sort((a, b) => {
      const left = String(a[field]);
      const right = String(b[field]);
      return direction === 'asc'
        ? left.localeCompare(right, undefined, { numeric: true })
        : right.localeCompare(left, undefined, { numeric: true });
    });
  });

  container.appendChild(table);
  return container;
}

const meta = {
  title: 'Components/Table View',
  tags: ['autodocs'],
  argTypes: {
    rowHeight: {
      control: { type: 'number', min: 28, max: 64, step: 2 },
    },
    count: {
      control: { type: 'number', min: 0, max: 1000, step: 25 },
    },
  },
  args: {
    rowHeight: 40,
    sortable: true,
    striped: true,
    bordered: false,
    count: 250,
  },
  render: createTableView,
} satisfies Meta<TableViewStoryArgs>;

export default meta;

type Story = StoryObj<TableViewStoryArgs>;

export const Playground: Story = {};

export const Bordered: Story = {
  args: {
    bordered: true,
    count: 80,
  },
};

export const DenseRows: Story = {
  args: {
    rowHeight: 32,
    striped: false,
    count: 500,
  },
};
