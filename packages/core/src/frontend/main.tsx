import React, { useEffect, useState } from 'react';
import * as ReactDOM_NS from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import { I18nProvider, type LocaleMessages } from '@desktalk/sdk';
import { Shell } from './components/Shell.js';
import './styles/global.css';

interface I18nCatalogResponse {
  locale: string;
  messages: LocaleMessages;
}

function App() {
  const [locale, setLocale] = useState('en');
  const [messages, setMessages] = useState<LocaleMessages>({});

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog(nextLocale?: string): Promise<void> {
      const query = nextLocale ? `?locale=${encodeURIComponent(nextLocale)}` : '';
      const response = await fetch(`/api/i18n/catalog${query}`);
      if (!response.ok) {
        throw new Error(`Failed to load i18n catalog (${response.status})`);
      }

      const payload = (await response.json()) as I18nCatalogResponse;
      if (!cancelled) {
        setLocale(payload.locale);
        setMessages(payload.messages);
      }
    }

    void loadCatalog().catch((error) => {
      console.error('[i18n] Could not load catalog:', error);
    });

    const handleEvent = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          event?: string;
          data?: { key?: string; value?: unknown };
        }>
      ).detail;

      if (detail?.event === 'preferences:changed' && detail.data?.key === 'general.language') {
        void loadCatalog(String(detail.data.value ?? 'en')).catch((error) => {
          console.error('[i18n] Could not refresh catalog:', error);
        });
      }
    };

    window.addEventListener('desktalk:event', handleEvent);
    return () => {
      cancelled = true;
      window.removeEventListener('desktalk:event', handleEvent);
    };
  }, []);

  return (
    <I18nProvider locale={locale} messages={messages}>
      <Shell />
    </I18nProvider>
  );
}

// Expose React libraries on window so MiniApps can read them at runtime
// instead of bundling their own copies.
// Merge react-dom and react-dom/client so miniapps can import from either.
(window as unknown as Record<string, unknown>).React = React;
(window as unknown as Record<string, unknown>).ReactDOM = {
  ...ReactDOM_NS,
  createRoot,
  hydrateRoot,
};
(window as unknown as Record<string, unknown>).__desktalk_jsx_runtime = jsxRuntime;

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

const root = createRoot(rootEl);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
