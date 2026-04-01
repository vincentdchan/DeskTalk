export interface DtMilkdownCssEntry {
  name: string;
  css: string;
}

export interface DtMilkdownRuntime {
  Crepe: typeof import('@milkdown/crepe').Crepe;
  replaceAll: typeof import('@milkdown/kit/utils').replaceAll;
  cssText: string;
  cssEntries: DtMilkdownCssEntry[];
}

declare global {
  interface Window {
    __DtMilkdown?: DtMilkdownRuntime;
  }
}

let loadPromise: Promise<DtMilkdownRuntime> | null = null;

export function loadMilkdown(): Promise<DtMilkdownRuntime> {
  if (window.__DtMilkdown) {
    return Promise.resolve(window.__DtMilkdown);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/api/ui/milkdown.umd.js';
    script.async = true;
    script.dataset.dtMilkdown = 'true';
    script.onload = () => {
      if (window.__DtMilkdown) {
        resolve(window.__DtMilkdown);
        return;
      }

      reject(new Error('Milkdown runtime loaded without a __DtMilkdown export.'));
    };
    script.onerror = () => reject(new Error('Failed to load the Milkdown runtime bundle.'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
