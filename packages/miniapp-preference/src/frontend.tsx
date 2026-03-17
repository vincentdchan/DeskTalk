import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  MiniAppFrontendContext,
  SettingsSchemaDocument,
  SettingDefinition,
} from '@desktalk/sdk';
import { useCommand, useEvent, MiniAppIdProvider, WindowIdProvider } from '@desktalk/sdk';
import { CATEGORIES, getSchemasByCategory, getDefaultConfig, maskSensitive } from './schema';
import type { PreferenceSchema, Config } from './schema';
import { PreferenceCategoryList } from './components/PreferenceCategoryList';
import { PreferenceSection } from './components/PreferenceSection';
import { PreferenceRow } from './components/PreferenceRow';
import { PreferenceActions } from './components/PreferenceActions';
import styles from './styles/PreferenceApp.module.css';

// ─── MiniApp settings schema types ──────────────────────────────────────────

interface MiniAppSchemaEntry {
  miniAppId: string;
  miniAppName: string;
  schema: SettingsSchemaDocument;
}

/** Convert a SettingDefinition from a MiniApp schema to a PreferenceSchema. */
function settingToPreferenceSchema(
  miniAppId: string,
  key: string,
  def: SettingDefinition,
): PreferenceSchema {
  const base: PreferenceSchema = {
    key: `miniapps.${miniAppId}.${key}`,
    label: def.title,
    description: def.description,
    type: def.type,
    default: def.default,
    category: 'Mini-Apps',
    sensitive: def.sensitive,
    requiresRestart: def.requiresRestart,
  };

  if (def.type === 'string' && def.enum) {
    base.options = def.enum;
  }
  if (def.type === 'number') {
    if (def.minimum !== undefined) base.min = def.minimum;
    if (def.maximum !== undefined) base.max = def.maximum;
  }

  return base;
}

function PreferenceApp() {
  // ─── State ───────────────────────────────────────────────────────────────
  const [config, setConfig] = useState<Config>(getDefaultConfig());
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORIES[0]);
  const [notification, setNotification] = useState<string | null>(null);
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // MiniApp settings state
  const [miniAppSchemas, setMiniAppSchemas] = useState<MiniAppSchemaEntry[]>([]);
  const [miniAppValues, setMiniAppValues] = useState<
    Record<string, Record<string, string | number | boolean>>
  >({});

  // ─── Backend commands ────────────────────────────────────────────────────
  const getAllSettings = useCommand<void, Config>('preferences.getAll');
  const setSetting = useCommand<{ key: string; value: string | number | boolean }, void>(
    'preferences.set',
  );

  // MiniApp settings commands (intercepted by server)
  const listMiniAppSchemas = useCommand<void, MiniAppSchemaEntry[]>(
    'preferences.miniapp.listSchemas',
  );
  const getMiniAppSettings = useCommand<
    { miniAppId: string },
    Record<string, string | number | boolean>
  >('preferences.miniapp.getAll');
  const setMiniAppSetting = useCommand<
    { miniAppId: string; key: string; value: string | number | boolean },
    void
  >('preferences.miniapp.set');

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

  // ─── Fetch MiniApp schemas on mount ──────────────────────────────────────
  const fetchMiniAppSchemas = useCallback(async () => {
    try {
      const schemas = await listMiniAppSchemas();
      setMiniAppSchemas(schemas);

      // Fetch current values for each MiniApp
      const valuesMap: Record<string, Record<string, string | number | boolean>> = {};
      for (const entry of schemas) {
        try {
          valuesMap[entry.miniAppId] = await getMiniAppSettings({ miniAppId: entry.miniAppId });
        } catch {
          valuesMap[entry.miniAppId] = {};
        }
      }
      setMiniAppValues(valuesMap);
    } catch (err) {
      console.error('Failed to load MiniApp schemas:', err);
    }
  }, [listMiniAppSchemas, getMiniAppSettings]);

  useEffect(() => {
    fetchMiniAppSchemas();
  }, [fetchMiniAppSchemas]);

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
      // Check if this is a MiniApp setting (prefixed with miniapps.<id>.)
      const miniAppMatch = key.match(/^miniapps\.([^.]+)\.(.+)$/);
      if (miniAppMatch) {
        const [, targetId, settingKey] = miniAppMatch;
        // Optimistic update
        setMiniAppValues((prev) => ({
          ...prev,
          [targetId]: { ...prev[targetId], [settingKey]: value },
        }));
        try {
          await setMiniAppSetting({ miniAppId: targetId, key: settingKey, value });
        } catch (err) {
          console.error(`Failed to update miniapp setting ${key}:`, err);
          // Revert on error
          fetchMiniAppSchemas();
        }
        return;
      }

      // Standard preference setting
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
    [setSetting, setMiniAppSetting, fetchConfig, fetchMiniAppSchemas],
  );

  // ─── Build all categories including dynamic Mini-Apps ────────────────────
  const allCategories: string[] = [
    ...CATEGORIES,
    ...(miniAppSchemas.length > 0 ? ['Mini-Apps'] : []),
  ];

  // ─── Render ──────────────────────────────────────────────────────────────
  const categoriesToShow = allCategories.filter((c) => c === activeCategory);

  const getVisibleSchemas = useCallback(
    (category: string) => {
      const schemas = getSchemasByCategory(category);
      if (category !== 'AI') {
        return schemas;
      }

      const selectedProvider = String(config['ai.defaultProvider'] ?? 'openai');
      return schemas.filter((schema) => {
        if (!schema.key.startsWith('ai.providers.')) {
          return true;
        }

        return schema.key.startsWith(`ai.providers.${selectedProvider}.`);
      });
    },
    [config],
  );

  /** Get the current value for a MiniApp setting, falling back to schema default. */
  const getMiniAppSettingValue = useCallback(
    (miniAppId: string, key: string, def: SettingDefinition): string | number | boolean => {
      const values = miniAppValues[miniAppId] ?? {};
      const raw = values[key];
      if (raw !== undefined) {
        // Mask sensitive values
        if (def.sensitive && typeof raw === 'string' && raw) {
          return maskSensitive(raw);
        }
        return raw;
      }
      return def.default;
    },
    [miniAppValues],
  );

  return (
    <PreferenceActions onConfigChanged={fetchConfig}>
      <div className={styles.root}>
        {/* Sidebar */}
        <PreferenceCategoryList
          activeCategory={activeCategory}
          onSelect={setActiveCategory}
          extraCategories={miniAppSchemas.length > 0 ? ['Mini-Apps'] : []}
        />

        {/* Settings panel */}
        <div className={styles.settingsPanel}>
          {categoriesToShow.map((category) => {
            if (category === 'Mini-Apps') {
              // Render MiniApp settings grouped by MiniApp name
              return miniAppSchemas.map((entry) => {
                const settingEntries = Object.entries(entry.schema.settings) as Array<
                  [string, SettingDefinition]
                >;
                if (settingEntries.length === 0) return null;

                const schemas = settingEntries.map(([key, def]) =>
                  settingToPreferenceSchema(entry.miniAppId, key, def),
                );

                return (
                  <PreferenceSection key={entry.miniAppId} title={entry.miniAppName}>
                    {schemas.map((schema) => {
                      // Extract the original key (without prefix) to look up the value
                      const originalKey = schema.key.replace(`miniapps.${entry.miniAppId}.`, '');
                      const def = entry.schema.settings[originalKey];
                      const value = getMiniAppSettingValue(entry.miniAppId, originalKey, def);

                      return (
                        <PreferenceRow
                          key={schema.key}
                          schema={schema}
                          value={value}
                          onChange={handleChange}
                        />
                      );
                    })}
                  </PreferenceSection>
                );
              });
            }

            const schemas = getVisibleSchemas(category);
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
