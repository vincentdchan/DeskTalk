# `<dt-chart>`

Interactive chart component powered by Chart.js. Data is provided exclusively via the `.data` JS property.

## Attributes

- `type` — `bar` (default), `line`, `area`, `pie`, `doughnut`, `radar`, `scatter`, `bubble`
- `labels` — comma-separated category labels such as `labels="Jan,Feb,Mar"` (convenience; can also set labels inside `.data`)
- `legend` — `top`, `bottom`, `left`, `right`, `none` (default)
- `stacked` — stacks bar and line datasets
- `dt-chart-click` event — emitted with `{ label, datasetIndex, index, value }`

## `.data` Property (required)

All chart data **must** be set through the `.data` JS property. There is no HTML-only way to fill data.

```ts
interface DtChartData {
  labels?: string[]; // category labels for the x-axis
  datasets: DtChartDataset[];
}

interface DtChartDataset {
  label?: string; // legend label for this series
  data:
    | number[] // values for bar, line, area, pie, doughnut, radar
    | { x: number; y: number }[] // for scatter
    | { x: number; y: number; r: number }[]; // for bubble
  color?: string; // optional CSS color override; auto-assigned from theme palette if omitted
}
```

## `.options` Property (advanced, rarely needed)

Raw Chart.js options object merged under the auto-themed defaults. Only use this when you need fine-grained control over axes, tooltips, etc.

## How to Use

1. Create a `<dt-chart>` element in HTML with the desired `type`, `labels`, `legend`, and an **explicit height**.
2. In a `<script>` block, select the element and assign its `.data` property.

**Important:** The `<dt-chart>` element **requires an explicit height** via inline `style` or a CSS class. Without it the chart will not be visible.

**When to use:** Use for charts, graphs, trends, comparisons, and composition breakdowns. Prefer `<dt-stat>` for single KPIs.

## Examples

### Bar chart with two datasets

```html
<dt-chart
  id="revenue"
  type="bar"
  legend="top"
  labels="Jan,Feb,Mar,Apr"
  style="height: 300px"
></dt-chart>

<script>
  document.getElementById('revenue').data = {
    datasets: [
      { label: 'Revenue', data: [12, 19, 3, 5] },
      { label: 'Costs', data: [7, 11, 5, 8] },
    ],
  };
</script>
```

### Doughnut chart

```html
<dt-chart
  id="categories"
  type="doughnut"
  legend="right"
  labels="Electronics,Clothing,Food"
  style="height: 250px"
></dt-chart>

<script>
  document.getElementById('categories').data = {
    datasets: [{ label: 'Sales', data: [35, 25, 22] }],
  };
</script>
```

### Line chart (area fill)

```html
<dt-chart
  id="growth"
  type="area"
  legend="none"
  labels="Jan,Feb,Mar,Apr,May,Jun"
  style="height: 300px"
></dt-chart>

<script>
  document.getElementById('growth').data = {
    datasets: [{ label: 'Users', data: [150, 230, 224, 318, 435, 547] }],
  };
</script>
```

### Scatter chart

```html
<dt-chart id="scatter" type="scatter" legend="top" style="height: 300px"></dt-chart>

<script>
  document.getElementById('scatter').data = {
    datasets: [
      {
        label: 'Samples',
        data: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
          { x: 5, y: 1 },
        ],
      },
    ],
  };
</script>
```

### Radar chart

```html
<dt-chart
  id="radar"
  type="radar"
  legend="bottom"
  labels="Speed,Reliability,Comfort,Safety,Efficiency"
  style="height: 250px"
></dt-chart>

<script>
  document.getElementById('radar').data = {
    datasets: [
      { label: 'Model A', data: [65, 59, 90, 81, 56] },
      { label: 'Model B', data: [28, 48, 40, 19, 96] },
    ],
  };
</script>
```

### Stacked bar chart

```html
<dt-chart
  id="stacked"
  type="bar"
  legend="top"
  stacked
  labels="Jan,Feb,Mar,Apr,May,Jun"
  style="height: 300px"
></dt-chart>

<script>
  document.getElementById('stacked').data = {
    datasets: [
      { label: 'Online', data: [12, 19, 3, 5, 2, 3] },
      { label: 'Retail', data: [7, 11, 5, 8, 3, 7] },
    ],
  };
</script>
```

## Full-Page Example — Sales Dashboard Charts

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
          id="revenue-chart"
          type="bar"
          legend="top"
          stacked
          labels="Jan,Feb,Mar,Apr,May,Jun"
          class="chart-box"
        ></dt-chart>
      </dt-card>

      <dt-card>
        <h2>User Growth</h2>
        <dt-chart
          id="growth-chart"
          type="area"
          legend="none"
          labels="Jan,Feb,Mar,Apr,May,Jun"
          class="chart-box"
        ></dt-chart>
      </dt-card>
    </dt-grid>

    <dt-card style="margin-top: 16px">
      <h2>Category Breakdown</h2>
      <dt-grid cols="2" gap="16">
        <dt-chart
          id="category-chart"
          type="doughnut"
          legend="right"
          labels="Electronics,Clothing,Food,Books"
          style="height: 250px"
        ></dt-chart>

        <dt-chart
          id="comparison-chart"
          type="radar"
          legend="bottom"
          labels="Speed,Reliability,Comfort,Safety,Efficiency"
          style="height: 250px"
        ></dt-chart>
      </dt-grid>
    </dt-card>

    <script>
      document.getElementById('revenue-chart').data = {
        datasets: [
          { label: 'Online', data: [12, 19, 3, 5, 2, 3] },
          { label: 'Retail', data: [7, 11, 5, 8, 3, 7] },
        ],
      };

      document.getElementById('growth-chart').data = {
        datasets: [{ label: 'Users', data: [150, 230, 224, 318, 435, 547] }],
      };

      document.getElementById('category-chart').data = {
        datasets: [{ label: 'Sales', data: [35, 25, 22, 18] }],
      };

      document.getElementById('comparison-chart').data = {
        datasets: [
          { label: 'Model A', data: [65, 59, 90, 81, 56] },
          { label: 'Model B', data: [28, 48, 40, 19, 96] },
        ],
      };
    </script>
  </body>
</html>
```
