import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { MiniAppFrontendActivation, MiniAppFrontendContext } from '@desktalk/sdk';
import { useCommand, useEvent, MiniAppIdProvider, WindowIdProvider } from '@desktalk/sdk';
import { CATEGORIES, getSchemasByCategory, getDefaultConfig } from './schema';
import type { Config } from './schema';
import { PreferenceCategoryList } from './components/PreferenceCategoryList';
import { AiProviderList } from './components/AiProviderList';
import { VoiceProviderList } from './components/VoiceProviderList';
import { PreferenceSection } from './components/PreferenceSection';
import { PreferenceRow } from './components/PreferenceRow';
import { PreferenceActions } from './components/PreferenceActions';
import styles from './styles/PreferenceApp.module.css';

const COMPACT_NAV_WIDTH = 720;

function PreferenceApp() {
  // ─── State ───────────────────────────────────────────────────────────────
  const [config, setConfig] = useState<Config>(getDefaultConfig());
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORIES[0]);
  const [notification, setNotification] = useState<string | null>(null);
  const [compactNav, setCompactNav] = useState(false);
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // ─── Backend commands ────────────────────────────────────────────────────
  const getAllSettings = useCommand<void, Config>('preferences.getAll');
  const setSetting = useCommand<{ key: string; value: string | number | boolean }, void>(
    'preferences.set',
  );

  // ─── Fetch config on mount ───────────────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    try {
      const result = await getAllSettings();
      setConfig(result);
    } catch (err) {
      console.error('Failed to load preferences:', err);
    }
  }, [getAllSettings]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (!rootRef.current) return;

    const updateLayout = (width: number) => {
      setCompactNav(width <= COMPACT_NAV_WIDTH);
    };

    updateLayout(rootRef.current.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateLayout(entry.contentRect.width);
    });

    observer.observe(rootRef.current);

    return () => observer.disconnect();
  }, []);

  // ─── Listen for change events ────────────────────────────────────────────
  useEvent<{ key: string; value: string | number | boolean; requiresRestart: boolean }>(
    'preferences:changed',
    (change) => {
      setConfig((prev) => ({ ...prev, [change.key]: change.value }));

      if (change.requiresRestart) {
        showNotification(
          $localize`notifications.restartRequired:This change requires a restart to take effect.`,
        );
      }
    },
  );

  useEvent<Record<string, never>>('preferences:resetAll', () => {
    fetchConfig();
    showNotification($localize`notifications.resetAll:All settings have been reset to defaults.`);
  });

  // ─── Notification helper ─────────────────────────────────────────────────
  const showNotification = useCallback((message: string) => {
    setNotification(message);
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    notificationTimer.current = setTimeout(() => setNotification(null), 4000);
  }, []);

  // ─── Setting change handler ──────────────────────────────────────────────
  const handleChange = useCallback(
    async (key: string, value: string | number | boolean) => {
      // Optimistic update
      setConfig((prev) => ({ ...prev, [key]: value }));
      try {
        await setSetting({ key, value });
      } catch (err) {
        console.error(`Failed to update ${key}:`, err);
        // Revert on error
        fetchConfig();
      }
    },
    [setSetting, fetchConfig],
  );

  // ─── Render ──────────────────────────────────────────────────────────────
  const categoriesToShow = CATEGORIES.filter((c) => c === activeCategory);

  const getVisibleSchemas = useCallback((category: string) => {
    const schemas = getSchemasByCategory(category);
    if (category !== 'AI' && category !== 'Voice') {
      return schemas;
    }

    return schemas.filter((schema) => {
      if (category === 'AI') {
        return (
          !schema.key.startsWith('ai.providers.') &&
          schema.key !== 'ai.defaultProvider' &&
          schema.key !== 'ai.enabledProviders'
        );
      }

      return (
        !schema.key.startsWith('voice.providers.') &&
        schema.key !== 'voice.defaultProvider' &&
        schema.key !== 'voice.enabledProviders'
      );
    });
  }, []);

  return (
    <PreferenceActions onConfigChanged={fetchConfig}>
      <div ref={rootRef} className={`${styles.root}${compactNav ? ` ${styles.rootCompact}` : ''}`}>
        {/* Sidebar */}
        <PreferenceCategoryList
          activeCategory={activeCategory}
          onSelect={setActiveCategory}
          compact={compactNav}
        />

        {/* Settings panel */}
        <div className={styles.settingsPanel}>
          {categoriesToShow.map((category) => {
            const schemas = getVisibleSchemas(category);
            return (
              <PreferenceSection key={category} title={category}>
                {category === 'AI' && <AiProviderList config={config} onChange={handleChange} />}
                {category === 'Voice' && (
                  <VoiceProviderList config={config} onChange={handleChange} />
                )}
                {schemas.map((schema) => (
                  <PreferenceRow
                    key={schema.key}
                    schema={schema}
                    value={config[schema.key] ?? schema.default}
                    onChange={handleChange}
                  />
                ))}
              </PreferenceSection>
            );
          })}
        </div>

        {/* Notification toast */}
        {notification && <div className={styles.notification}>{notification}</div>}
      </div>
    </PreferenceActions>
  );
}

export function activate(ctx: MiniAppFrontendContext): MiniAppFrontendActivation {
  const root = createRoot(ctx.root);
  root.render(
    <WindowIdProvider windowId={ctx.windowId}>
      <MiniAppIdProvider miniAppId={ctx.miniAppId}>
        <PreferenceApp />
      </MiniAppIdProvider>
    </WindowIdProvider>,
  );

  return {
    deactivate() {
      root.unmount();
    },
  };
}
