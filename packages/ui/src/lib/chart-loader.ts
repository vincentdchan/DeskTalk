export interface DtChartRuntime {
  Chart: typeof import('chart.js').Chart;
}

declare global {
  interface Window {
    __DtChart?: DtChartRuntime;
  }
}

let loadPromise: Promise<DtChartRuntime> | null = null;

export function loadChartJs(): Promise<DtChartRuntime> {
  if (window.__DtChart) {
    return Promise.resolve(window.__DtChart);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/api/ui/chart.js';
    script.async = true;
    script.dataset.dtChart = 'true';
    script.onload = () => {
      if (window.__DtChart) {
        resolve(window.__DtChart);
        return;
      }

      reject(new Error('Chart runtime loaded without a __DtChart export.'));
    };
    script.onerror = () => reject(new Error('Failed to load the Chart.js runtime bundle.'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
