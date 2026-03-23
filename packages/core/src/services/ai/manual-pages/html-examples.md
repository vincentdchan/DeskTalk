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
