# `<dt-chart>` and `<dt-dataset>`

Interactive chart component powered by Chart.js. Prefer declarative `<dt-dataset>` children so streamed LiveApp HTML can reveal datasets incrementally.

## `<dt-chart>` Attributes

- `type` — `bar` (default), `line`, `area`, `pie`, `doughnut`, `radar`, `scatter`, `bubble`
- `labels` — comma-separated category labels such as `labels="Jan,Feb,Mar"`
- `legend` — `top`, `bottom`, `left`, `right`, `none` (default)
- `stacked` — stacks bar and line datasets
- `.data` JS property — escape hatch for scatter, bubble, or computed data; overrides child datasets
- `.options` JS property — advanced Chart.js options override; rarely needed
- `dt-chart-click` event — emitted with `{ label, datasetIndex, index, value }`

## `<dt-dataset>` Attributes

- `label` — legend label for the series
- `values` — comma-separated numbers such as `values="12,19,3,5"`
- `color` — optional CSS color override for the series

**When to use:** Use for charts, graphs, trends, comparisons, and composition breakdowns. Prefer `<dt-stat>` for single KPIs.

## Examples

```html
<dt-chart type="bar" legend="top" labels="Jan,Feb,Mar,Apr" style="height: 300px">
  <dt-dataset label="Revenue" values="12,19,3,5"></dt-dataset>
  <dt-dataset label="Costs" values="7,11,5,8"></dt-dataset>
</dt-chart>

<dt-chart type="doughnut" legend="right" labels="Electronics,Clothing,Food" style="height: 250px">
  <dt-dataset label="Sales" values="35,25,22"></dt-dataset>
</dt-chart>

<dt-chart id="scatter" type="scatter" style="height: 300px"></dt-chart>

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
