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

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
      }
    </style>
  </head>
  <body>
    <h1>Dashboard</h1>
    <div class="grid">
      <dt-card>
        <h3>Status</h3>
        <p>All systems operational.</p>
        <span class="badge badge-success">Online</span>
      </dt-card>
      <dt-card variant="outlined">
        <h3>Activity</h3>
        <p>12 events in the last hour.</p>
        <button class="btn">View All</button>
      </dt-card>
    </div>
  </body>
</html>
```

## Stat Cards

```html
<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
  <dt-card>
    <h6>CPU Usage</h6>
    <h2>42%</h2>
    <p>Normal load</p>
  </dt-card>
  <dt-card>
    <h6>Memory</h6>
    <h2>8.2 GB</h2>
    <p>of 16 GB used</p>
  </dt-card>
  <dt-card variant="filled">
    <h6>Disk</h6>
    <h2>256 GB</h2>
    <p>free space</p>
  </dt-card>
</div>
```
