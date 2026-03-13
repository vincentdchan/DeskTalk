import React, { useCallback } from 'react';
import { ActionsProvider, Action, useCommand } from '@desktalk/sdk';
import { getSchema } from '../schema';

interface PreferenceActionsProps {
  children: React.ReactNode;
  onConfigChanged: () => void;
}

export function PreferenceActions({ children, onConfigChanged }: PreferenceActionsProps) {
  const getSetting = useCommand<{ key: string }, { value: string | number | boolean }>(
    'preferences.get',
  );
  const setSetting = useCommand<{ key: string; value: string | number | boolean }, void>(
    'preferences.set',
  );
  const resetSetting = useCommand<{ key: string }, void>('preferences.reset');
  const resetAllSettings = useCommand<void, void>('preferences.resetAll');

  const handleGetSetting = useCallback(
    async (params?: Record<string, unknown>) => {
      const key = params?.key as string;
      if (!key) throw new Error('Missing required parameter: key');
      const result = await getSetting({ key });
      return result;
    },
    [getSetting],
  );

  const handleSetSetting = useCallback(
    async (params?: Record<string, unknown>) => {
      const key = params?.key as string;
      if (!key) throw new Error('Missing required parameter: key');

      let value = params?.value;
      if (value === undefined) throw new Error('Missing required parameter: value');

      // Coerce the value to the expected type
      const schema = getSchema(key);
      if (schema) {
        if (schema.type === 'number' && typeof value === 'string') {
          value = Number(value);
        } else if (schema.type === 'boolean' && typeof value === 'string') {
          value = value === 'true';
        }
      }

      await setSetting({ key, value: value as string | number | boolean });
      onConfigChanged();
      return { success: true };
    },
    [setSetting, onConfigChanged],
  );

  const handleResetSetting = useCallback(
    async (params?: Record<string, unknown>) => {
      const key = params?.key as string;
      if (!key) throw new Error('Missing required parameter: key');
      await resetSetting({ key });
      onConfigChanged();
      return { success: true };
    },
    [resetSetting, onConfigChanged],
  );

  const handleResetAll = useCallback(async () => {
    await resetAllSettings();
    onConfigChanged();
    return { success: true };
  }, [resetAllSettings, onConfigChanged]);

  return (
    <ActionsProvider>
      <Action
        name="Get Setting"
        description="Read the current value of a setting"
        params={{
          key: {
            type: 'string' as const,
            description: 'Setting key (e.g. general.theme)',
            required: true,
          },
        }}
        handler={handleGetSetting}
      />
      <Action
        name="Set Setting"
        description="Update a setting value"
        params={{
          key: {
            type: 'string' as const,
            description: 'Setting key (e.g. general.theme)',
            required: true,
          },
          value: {
            type: 'string' as const,
            description: 'New value for the setting',
            required: true,
          },
        }}
        handler={handleSetSetting}
      />
      <Action
        name="Reset Setting"
        description="Reset a setting to its default value"
        params={{
          key: {
            type: 'string' as const,
            description: 'Setting key to reset',
            required: true,
          },
        }}
        handler={handleResetSetting}
      />
      <Action
        name="Reset All"
        description="Reset all settings to their default values"
        handler={handleResetAll}
      />
      {children}
    </ActionsProvider>
  );
}
