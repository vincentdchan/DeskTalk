export interface DtMarkedRenderOptions {
  unsafeHtml?: boolean;
}

export interface DtMarkedRuntime {
  render(markdown: string, options?: DtMarkedRenderOptions): string;
}

declare global {
  interface Window {
    __DtMarked?: DtMarkedRuntime;
  }
}

let loadPromise: Promise<DtMarkedRuntime> | null = null;

export function loadMarked(): Promise<DtMarkedRuntime> {
  if (window.__DtMarked) {
    return Promise.resolve(window.__DtMarked);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/api/ui/marked.js';
    script.async = true;
    script.dataset.dtMarked = 'true';
    script.onload = () => {
      if (window.__DtMarked) {
        resolve(window.__DtMarked);
        return;
      }

      reject(new Error('Marked runtime loaded without a __DtMarked export.'));
    };
    script.onerror = () => reject(new Error('Failed to load the marked runtime bundle.'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
