# `<dt-stat>`

Metric/KPI display component. Shows a label, value, and optional description.

## Attributes

- `label` — the metric label (e.g., "CPU Usage")
- `value` — the metric value (e.g., "42%")
- `description` — optional descriptive text
- `size` — size: `sm`, `md` (default), `lg`
- `variant` — visual style: `default`, `outlined`, `filled`
- `trend` — trend indicator: `up`, `down`, `neutral`
- `trend-value` — value to display with trend (e.g., "+5%")

**When to use:** Use for dashboard metrics, system monitoring, KPI displays.

## Examples

```html
<dt-stat label="CPU Usage" value="42%"></dt-stat>

<dt-stat label="Memory" value="8.2 GB" description="of 16 GB used"></dt-stat>

<dt-stat label="Uptime" value="99.9%" size="lg" variant="filled"></dt-stat>

<dt-stat
  label="Traffic"
  value="12.5k"
  description="visitors today"
  trend="up"
  trend-value="+18%"
></dt-stat>
```

## Full-Page Example — Stat Cards

```html
<dt-grid cols="3" min-width="150">
  <dt-stat label="CPU Usage" value="42%"></dt-stat>
  <dt-stat label="Memory" value="8.2 GB" description="of 16 GB used"></dt-stat>
  <dt-stat label="Disk" value="256 GB" description="free space" variant="filled"></dt-stat>
</dt-grid>
```
