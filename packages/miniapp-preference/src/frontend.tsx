import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { MiniAppFrontendContext } from '@desktalk/sdk';
import { useCommand, useEvent, MiniAppIdProvider, WindowIdProvider } from '@desktalk/sdk';
import { CATEGORIES, getSchemasByCategory, getDefaultConfig } from './schema';
import type { Config } from './schema';
import { PreferenceCategoryList } from './components/PreferenceCategoryList';
import { PreferenceSection } from './components/PreferenceSection';
import { PreferenceRow } from './components/PreferenceRow';
import { PreferenceActions } from './components/PreferenceActions';
import styles from './styles/PreferenceApp.module.css';

function PreferenceApp() {
  // ─── State ───────────────────────────────────────────────────────────────
  const [config, setConfig] = useState<Config>(getDefaultConfig());
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORIES[0]);
  const [notification, setNotification] = useState<string | null>(null);
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ─── Listen for change events ────────────────────────────────────────────
  useEvent<{ key: string; value: string | number | boolean; requiresRestart: boolean }>(
    'preferences:changed',
    (change) => {
      setConfig((prev) => ({ ...prev, [change.key]: change.value }));

      if (change.requiresRestart) {
        showNotification('This change requires a restart to take effect.');
      }
    },
  );

  useEvent<Record<string, never>>('preferences:resetAll', () => {
    fetchConfig();
    showNotification('All settings have been reset to defaults.');
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

  return (
    <PreferenceActions onConfigChanged={fetchConfig}>
      <div className={styles.root}>
        {/* Sidebar */}
        <PreferenceCategoryList activeCategory={activeCategory} onSelect={setActiveCategory} />

        {/* Settings panel */}
        <div className={styles.settingsPanel}>
          {categoriesToShow.map((category) => {
            const schemas = getSchemasByCategory(category);
            return (
              <PreferenceSection key={category} title={category}>
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

let root: ReturnType<typeof createRoot> | null = null;

export function activate(ctx: MiniAppFrontendContext): void {
  root = createRoot(ctx.root);
  root.render(
    <WindowIdProvider windowId={ctx.windowId}>
      <MiniAppIdProvider miniAppId={ctx.miniAppId}>
        <PreferenceApp />
      </MiniAppIdProvider>
    </WindowIdProvider>,
  );
}

export function deactivate(): void {
  root?.unmount();
  root = null;
}
