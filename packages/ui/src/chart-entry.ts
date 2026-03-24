import { Chart, registerables } from 'chart.js';

import type { DtChartRuntime } from './lib/chart-loader';

declare global {
  interface Window {
    __DtChart?: DtChartRuntime;
  }
}

Chart.register(...registerables);

window.__DtChart = {
  Chart,
};
