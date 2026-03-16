import React, { useCallback, useEffect, useState } from 'react';
import * as ReactDOM_NS from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import { I18nProvider, type LocaleMessages } from '@desktalk/sdk';
import { Shell } from './components/Shell';
import { LoginPage } from './components/LoginPage';
import { OnboardPage } from './components/OnboardPage';
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

interface AuthMeAuthenticated {
  authenticated: true;
  username: string;
  displayName: string;
  role: string;
  onboarded: boolean;
}

interface AuthMeUnauthenticated {
  authenticated: false;
  needsOnboarding: boolean;
}

type AuthMeResponse = AuthMeAuthenticated | AuthMeUnauthenticated;

type Page = 'loading' | 'login' | 'onboard' | 'desktop';

applyTheme(DEFAULT_THEME_PREFERENCES);

function App() {
  const [locale, setLocale] = useState('en');
  const [messages, setMessages] = useState<LocaleMessages>({});
  const [themePreferences, setThemePreferences] =
    useState<ThemePreferences>(DEFAULT_THEME_PREFERENCES);
  const [page, setPage] = useState<Page>('loading');
  const [authUser, setAuthUser] = useState<AuthMeAuthenticated | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) {
        setPage('login');
        return;
      }

      const data = (await res.json()) as AuthMeResponse;

      if (!data.authenticated) {
        // Not logged in — check if the system needs initial onboarding
        if (data.needsOnboarding) {
          setPage('onboard');
          setAuthUser(null);
        } else {
          setPage('login');
        }
        return;
      }

      // Authenticated
      setAuthUser(data);

      if (!data.onboarded) {
        setPage('onboard');
      } else {
        setPage('desktop');
      }
    } catch {
      setPage('login');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog(nextLocale?: string): Promise<void> {
      const query = nextLocale ? `?locale=${encodeURIComponent(nextLocale)}` : '';
      const response = await fetch(`/api/i18n/catalog${query}`);
      if (!response.ok) {
        // i18n catalog requires auth — if not authenticated, just use defaults
        if (response.status === 401) return;
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

    // Load theme preferences (public, no auth needed) immediately
    void loadThemePreferences().catch((error) => {
      console.error('[theme] Could not load preferences:', error);
    });

    // Check session to determine which page to show
    void checkSession();

    // Load i18n catalog (may fail if not authenticated — that's okay)
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
  }, [checkSession]);

  useEffect(() => {
    applyTheme(themePreferences);
  }, [themePreferences]);

  if (page === 'loading') {
    // Render nothing while checking session — theme is already applied
    return null;
  }

  if (page === 'login') {
    return <LoginPage onLoginSuccess={checkSession} />;
  }

  if (page === 'onboard') {
    return (
      <OnboardPage
        username={authUser?.username ?? 'admin'}
        displayName={authUser?.displayName ?? 'Administrator'}
        authenticated={authUser !== null}
        onComplete={checkSession}
      />
    );
  }

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
