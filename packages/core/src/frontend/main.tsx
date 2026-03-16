import React, { useEffect, useState } from 'react';
import * as ReactDOM_NS from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import { I18nProvider, type LocaleMessages } from '@desktalk/sdk';
import { Shell } from './components/Shell';
import { LoginPage } from './components/LoginPage';
import { OnboardPage } from './components/OnboardPage';
import { useAuthStore } from './stores/auth';
import { applyTheme, DEFAULT_THEME_PREFERENCES, type ThemePreferences } from './theme';
import './styles/global.scss';

interface I18nCatalogResponse {
  locale: string;
  messages: LocaleMessages;
}

interface PublicPreferencesResponse {
  theme: ThemePreferences['theme'];
  accentColor: string;
}

applyTheme(DEFAULT_THEME_PREFERENCES);

/**
 * AuthGate checks the user's authentication state and renders:
 * - A loading indicator while checking auth
 * - LoginPage if not authenticated (or setup mode)
 * - OnboardPage if authenticated but not onboarded
 * - The full App (Shell) if authenticated and onboarded
 */
function AuthGate() {
  const { user, loading, checkAuth } = useAuthStore();

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        background: 'var(--dt-bg-base)',
        color: 'var(--dt-text-muted)',
        fontSize: 16,
      }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (!user.onboarded) {
    return <OnboardPage />;
  }

  return <App />;
}

function App() {
  const [locale, setLocale] = useState('en');
  const [messages, setMessages] = useState<LocaleMessages>({});
  const [themePreferences, setThemePreferences] =
    useState<ThemePreferences>(DEFAULT_THEME_PREFERENCES);

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

    async function loadThemePreferences(): Promise<void> {
      const response = await fetch('/api/preferences/public');
      if (!response.ok) {
        throw new Error(`Failed to load public preferences (${response.status})`);
      }

      const payload = (await response.json()) as PublicPreferencesResponse;
      if (!cancelled) {
        setThemePreferences({
          theme: payload.theme,
          accentColor: payload.accentColor,
        });
      }
    }

    void loadCatalog().catch((error) => {
      console.error('[i18n] Could not load catalog:', error);
    });

    void loadThemePreferences().catch((error) => {
      console.error('[theme] Could not load preferences:', error);
    });

    const handleEvent = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          event?: string;
          data?: { key?: string; value?: unknown };
        }>
      ).detail;

      if (detail?.event === 'preferences:resetAll') {
        setThemePreferences(DEFAULT_THEME_PREFERENCES);
        void loadCatalog('en').catch((error) => {
          console.error('[i18n] Could not refresh catalog:', error);
        });
        return;
      }

      if (detail?.event !== 'preferences:changed') {
        return;
      }

      if (detail.data?.key === 'general.language') {
        void loadCatalog(String(detail.data.value ?? 'en')).catch((error) => {
          console.error('[i18n] Could not refresh catalog:', error);
        });
      }

      if (detail.data?.key === 'general.theme') {
        setThemePreferences((current) => ({
          ...current,
          theme: detail.data?.value === 'dark' ? 'dark' : 'light',
        }));
      }

      if (detail.data?.key === 'general.accentColor') {
        setThemePreferences((current) => ({
          ...current,
          accentColor: String(detail.data?.value ?? DEFAULT_THEME_PREFERENCES.accentColor),
        }));
      }
    };

    window.addEventListener('desktalk:event', handleEvent);
    return () => {
      cancelled = true;
      window.removeEventListener('desktalk:event', handleEvent);
    };
  }, []);

  useEffect(() => {
    applyTheme(themePreferences);
  }, [themePreferences]);

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
    <AuthGate />
  </React.StrictMode>,
);
