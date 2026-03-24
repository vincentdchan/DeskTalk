# HTML Examples

Use these examples as structure references, not as fixed templates.

## Dashboard Grid

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dashboard</title>
    <style>
      body {
        background: var(--dt-bg);
      }
    </style>
  </head>
  <body>
    <h1>Dashboard</h1>
    <dt-grid>
      <dt-card>
        <h3>Status</h3>
        <p>All systems operational.</p>
        <dt-badge variant="success">Online</dt-badge>
      </dt-card>
      <dt-card variant="outlined">
        <h3>Activity</h3>
        <p>12 events in the last hour.</p>
        <dt-button>View All</dt-button>
      </dt-card>
    </dt-grid>
  </body>
</html>
```

## Stat Cards

```html
<dt-grid cols="3" min-width="150">
  <dt-stat label="CPU Usage" value="42%"></dt-stat>
  <dt-stat label="Memory" value="8.2 GB" description="of 16 GB used"></dt-stat>
  <dt-stat label="Disk" value="256 GB" description="free space" variant="filled"></dt-stat>
</dt-grid>
```

## Action Buttons

```html
<dt-stack direction="row" gap="12" align="center">
  <dt-button>Primary</dt-button>
  <dt-button variant="secondary">Secondary</dt-button>
  <dt-button variant="ghost">Ghost</dt-button>
  <dt-button variant="danger">Danger</dt-button>
</dt-stack>
```

## Status Badges

```html
<dt-stack direction="row" gap="8">
  <dt-badge>Default</dt-badge>
  <dt-badge variant="success">Success</dt-badge>
  <dt-badge variant="warning">Warning</dt-badge>
  <dt-badge variant="danger">Error</dt-badge>
  <dt-badge variant="info">Info</dt-badge>
  <dt-badge variant="neutral">Neutral</dt-badge>
</dt-stack>
```

## System Monitor

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>System Monitor</title>
    <style>
      body {
        background: var(--dt-bg);
      }
    </style>
  </head>
  <body>
    <h1>System Monitor</h1>
    <dt-grid min-width="180">
      <dt-stat label="CPU" value="42%" trend="up" trend-value="+5%"></dt-stat>
      <dt-stat
        label="Memory"
        value="8.2 GB"
        description="of 16 GB"
        trend="neutral"
        trend-value="0%"
      ></dt-stat>
      <dt-stat label="Disk" value="256 GB" description="free" variant="filled"></dt-stat>
      <dt-stat label="Network" value="1.2 GB/s" description="inbound"></dt-stat>
    </dt-grid>
    <dt-divider spacing="md"></dt-divider>
    <dt-card>
      <h3>Services</h3>
      <dt-stack>
        <dt-stack direction="row" align="center">
          <span>Web Server</span>
          <dt-badge variant="success">Running</dt-badge>
        </dt-stack>
        <dt-stack direction="row" align="center">
          <span>Database</span>
          <dt-badge variant="success">Running</dt-badge>
        </dt-stack>
        <dt-stack direction="row" align="center">
          <span>Cache</span>
          <dt-badge variant="warning">Warning</dt-badge>
        </dt-stack>
      </dt-stack>
    </dt-card>
  </body>
</html>
```

## Settings Panel

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Settings</title>
    <style>
      body {
        background: var(--dt-bg);
      }
    </style>
  </head>
  <body>
    <h1>Settings</h1>
    <dt-stack>
      <dt-card>
        <h3>General</h3>
        <dt-stack gap="12">
          <label>Language</label>
          <dt-select>
            <option>English</option>
            <option>Spanish</option>
            <option>French</option>
          </dt-select>
          <dt-divider></dt-divider>
          <dt-stack direction="row" gap="12">
            <dt-button>Save</dt-button>
            <dt-button variant="ghost">Reset</dt-button>
          </dt-stack>
        </dt-stack>
      </dt-card>

      <dt-card variant="outlined">
        <h3>Danger Zone</h3>
        <p class="text-secondary">These actions cannot be undone.</p>
        <dt-button variant="danger">Delete Account</dt-button>
      </dt-card>
    </dt-stack>
  </body>
</html>
```

## Collection Storage Example

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Task Tracker</title>
  </head>
  <body>
    <h1>Task Tracker</h1>
    <button class="btn" id="add-task">Add Task</button>
    <div id="task-list" style="display: grid; gap: 12px; margin-top: 16px;"></div>

    <script>
      const tasks = window.DeskTalk.storage.collection('tasks');
      const taskList = document.getElementById('task-list');

      async function render() {
        const records = await tasks.find({}, { sort: 'createdAt', order: 'desc' });
        taskList.innerHTML = records
          .map(
            (task) => `
              <dt-card>
                <h3>${task.title}</h3>
                <p>Status: ${task.status}</p>
              </dt-card>
            `,
          )
          .join('');
      }

      document.getElementById('add-task').addEventListener('click', async () => {
        const title = window.prompt('Task title');
        if (!title) return;

        await tasks.insert({
          id: crypto.randomUUID(),
          title,
          status: 'todo',
          createdAt: Date.now(),
        });

        await render();
      });

      render();
    </script>
  </body>
</html>
```

## Virtualized Log List

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Deployment Logs</title>
    <style>
      body {
        background: var(--dt-bg);
      }

      #log-list {
        height: 360px;
      }
    </style>
  </head>
  <body>
    <h1>Deployment Logs</h1>
    <dt-card>
      <dt-list-view id="log-list" item-height="68" dividers>
        <template>
          <dt-stack gap="8">
            <dt-stack direction="row" align="center" gap="8">
              <strong data-field="service"></strong>
              <dt-badge data-field="level" data-field-variant="variant"></dt-badge>
            </dt-stack>
            <span class="text-muted" data-field="message"></span>
          </dt-stack>
        </template>
      </dt-list-view>
    </dt-card>

    <script>
      const list = document.getElementById('log-list');
      list.items = Array.from({ length: 250 }, (_, index) => ({
        service: `agent-${(index % 8) + 1}`,
        level: index % 5 === 0 ? 'warn' : 'info',
        variant: index % 5 === 0 ? 'warning' : 'info',
        message: `Processed batch ${index + 1} successfully.`,
      }));
    </script>
  </body>
</html>
```

## Sortable Process Table

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Processes</title>
    <style>
      body {
        background: var(--dt-bg);
      }

      #process-table {
        height: 360px;
      }
    </style>
  </head>
  <body>
    <h1>Processes</h1>
    <dt-card>
      <dt-table-view id="process-table" row-height="40" sortable striped>
        <dt-column field="name" header="Process" width="220"></dt-column>
        <dt-column field="cpu" header="CPU %" width="100" align="right"></dt-column>
        <dt-column field="memory" header="Memory" width="120" align="right"></dt-column>
        <dt-column field="status" header="Status" width="120">
          <template>
            <dt-badge data-field="status" data-field-variant="statusVariant"></dt-badge>
          </template>
        </dt-column>
      </dt-table-view>
    </dt-card>

    <script>
      const table = document.getElementById('process-table');
      const rows = [
        {
          name: 'node',
          cpu: '12.5',
          memory: '256 MB',
          status: 'running',
          statusVariant: 'success',
        },
        { name: 'redis', cpu: '4.1', memory: '128 MB', status: 'idle', statusVariant: 'neutral' },
        { name: 'cron', cpu: '0.7', memory: '32 MB', status: 'degraded', statusVariant: 'warning' },
      ];

      table.rows = rows;
      table.addEventListener('dt-sort', (event) => {
        const { field, direction } = event.detail;
        table.rows = [...rows].sort((a, b) =>
          direction === 'asc'
            ? String(a[field]).localeCompare(String(b[field]), undefined, { numeric: true })
            : String(b[field]).localeCompare(String(a[field]), undefined, { numeric: true }),
        );
      });
    </script>
  </body>
</html>
```

## Sales Dashboard Charts

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sales Dashboard</title>
    <style>
      body {
        background: var(--dt-bg);
      }

      .chart-box {
        height: 300px;
      }
    </style>
  </head>
  <body>
    <h1>Sales Dashboard</h1>
    <dt-grid cols="2" gap="16">
      <dt-card>
        <h2>Revenue by Month</h2>
        <dt-chart
          type="bar"
          legend="top"
          stacked
          labels="Jan,Feb,Mar,Apr,May,Jun"
          class="chart-box"
        >
          <dt-dataset label="Online" values="12,19,3,5,2,3"></dt-dataset>
          <dt-dataset label="Retail" values="7,11,5,8,3,7"></dt-dataset>
        </dt-chart>
      </dt-card>

      <dt-card>
        <h2>User Growth</h2>
        <dt-chart type="area" legend="none" labels="Jan,Feb,Mar,Apr,May,Jun" class="chart-box">
          <dt-dataset label="Users" values="150,230,224,318,435,547"></dt-dataset>
        </dt-chart>
      </dt-card>
    </dt-grid>

    <dt-card style="margin-top: 16px">
      <h2>Category Breakdown</h2>
      <dt-grid cols="2" gap="16">
        <dt-chart
          type="doughnut"
          legend="right"
          labels="Electronics,Clothing,Food,Books"
          style="height: 250px"
        >
          <dt-dataset label="Sales" values="35,25,22,18"></dt-dataset>
        </dt-chart>

        <dt-chart
          type="radar"
          legend="bottom"
          labels="Speed,Reliability,Comfort,Safety,Efficiency"
          style="height: 250px"
        >
          <dt-dataset label="Model A" values="65,59,90,81,56"></dt-dataset>
          <dt-dataset label="Model B" values="28,48,40,19,96"></dt-dataset>
        </dt-chart>
      </dt-grid>
    </dt-card>
  </body>
</html>
```

## Markdown Viewer

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Release Notes</title>
    <style>
      body {
        background: var(--dt-bg);
      }

      #notes {
        max-height: 420px;
        overflow: auto;
      }
    </style>
  </head>
  <body>
    <h1>Release Notes</h1>
    <dt-card>
      <dt-markdown id="notes"></dt-markdown>
    </dt-card>

    <script>
      document.getElementById('notes').content = `# DeskTalk 0.8.0

## Highlights

- Added virtualized list and table components
- Improved miniapp activation performance
- Refined storage docs for LiveApps

## Verification

| Package | Status |
| ------- | ------ |
| Core    | Passed |
| UI      | Passed |
| Miniapp | Passed |

> Use \`dt-link-click\` if you want to intercept links inside rendered markdown.`;
    </script>
  </body>
</html>
```

## Markdown Note Editor

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Notes</title>
    <style>
      body {
        background: var(--dt-bg);
      }

      #editor {
        height: 420px;
      }
    </style>
  </head>
  <body>
    <h1>Operations Notes</h1>
    <dt-stack gap="12">
      <dt-stack direction="row" align="center" gap="8">
        <dt-button id="save">Save</dt-button>
        <dt-badge id="status" variant="neutral">Saved</dt-badge>
      </dt-stack>
      <dt-card>
        <dt-markdown-editor id="editor" placeholder="Capture findings..."></dt-markdown-editor>
      </dt-card>
    </dt-stack>

    <script>
      const editor = document.getElementById('editor');
      const status = document.getElementById('status');
      const save = document.getElementById('save');
      const saved =
        window.DeskTalk.storage.get('ops.note') ||
        '# Incident Review\n\n## Timeline\n\n- 09:00 Started investigation';

      editor.value = saved;

      editor.addEventListener('dt-change', () => {
        status.textContent = 'Unsaved';
        status.setAttribute('variant', 'warning');
      });

      save.addEventListener('click', () => {
        window.DeskTalk.storage.set('ops.note', editor.value);
        status.textContent = 'Saved';
        status.setAttribute('variant', 'success');
      });
    </script>
  </body>
</html>
```
