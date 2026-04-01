import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import * as ReactDOM_NS from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import { I18nProvider, type LocaleMessages } from '@desktalk/sdk';
import { Shell } from './components/Shell';
import { LoginPage } from './components/LoginPage';
import { OnboardPage } from './components/OnboardPage';
import { httpClient } from './http-client';
import { applyTheme, DEFAULT_THEME_PREFERENCES, type ThemePreferences } from './theme';
import '@desktalk/ui'; // registers <dt-tooltip> and future web components globally
import './styles/global.scss';

interface I18nCatalogResponse {
  locale: string;
  messages: LocaleMessages;
}

interface PublicPreferencesResponse {
  theme: ThemePreferences['theme'];
  accentColor: string;
}

interface AuthMeResponse {
  authenticated: boolean;
  needsSetup?: boolean;
}

type Page = 'loading' | 'login' | 'onboard' | 'desktop';

applyTheme(DEFAULT_THEME_PREFERENCES);

function App() {
  const [locale, setLocale] = useState('en');
  const [messages, setMessages] = useState<LocaleMessages>({});
  const [themePreferences, setThemePreferences] =
    useState<ThemePreferences>(DEFAULT_THEME_PREFERENCES);
  const [page, setPage] = useState<Page>('loading');
  const latestCatalogRequestRef = useRef(0);
  const onboardingAccentOverrideRef = useRef(false);

  const checkSession = useCallback(async () => {
    try {
      const { data } = await httpClient.get<AuthMeResponse>('/api/auth/me');

      if (!data.authenticated) {
        // Not logged in — check if the system needs initial setup
        if (data.needsSetup) {
          setPage('onboard');
        } else {
          setPage('login');
        }
        return;
      }

      // Authenticated — go to desktop
      setPage('desktop');
    } catch {
      setPage('login');
    }
  }, []);

  const loadCatalog = useCallback(async (nextLocale?: string): Promise<void> => {
    const query = nextLocale ? `?locale=${encodeURIComponent(nextLocale)}` : '';
    const requestId = latestCatalogRequestRef.current + 1;
    latestCatalogRequestRef.current = requestId;

    const { data: payload } = await httpClient.get<I18nCatalogResponse>(
      `/api/i18n/catalog${query}`,
    );

    if (requestId !== latestCatalogRequestRef.current) {
      return;
    }

    setLocale(payload.locale);
    setMessages(payload.messages);
  }, []);

  useEffect(() => {
    async function loadThemePreferences(): Promise<void> {
      const { data: payload } =
        await httpClient.get<PublicPreferencesResponse>('/api/preferences/public');
      if (!onboardingAccentOverrideRef.current) {
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

    // Load i18n catalog used by onboarding and the desktop shell.
    void loadCatalog().catch((error) => {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        console.error(`[i18n] Could not load catalog (${status ?? 'unknown'}):`, error);
        return;
      }
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
      window.removeEventListener('desktalk:event', handleEvent);
    };
  }, [checkSession, loadCatalog]);

  useEffect(() => {
    applyTheme(themePreferences);
  }, [themePreferences]);

  if (page === 'loading') {
    // Render nothing while checking session — theme is already applied
    return null;
  }

  let content: React.ReactNode;
  if (page === 'login') {
    content = <LoginPage onLoginSuccess={checkSession} />;
  } else if (page === 'onboard') {
    content = (
      <OnboardPage
        onComplete={checkSession}
        locale={locale}
        accentColor={themePreferences.accentColor}
        onLanguageChange={(nextLocale) =>
          loadCatalog(nextLocale).catch((error) => {
            console.error('[i18n] Could not refresh onboarding catalog:', error);
          })
        }
        onAccentColorChange={(nextAccentColor) => {
          onboardingAccentOverrideRef.current = true;
          setThemePreferences((current) => ({
            ...current,
            accentColor: nextAccentColor,
          }));
        }}
      />
    );
  } else {
    content = <Shell themePreferences={themePreferences} />;
  }

  return (
    <I18nProvider locale={locale} messages={messages}>
      {content}
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
