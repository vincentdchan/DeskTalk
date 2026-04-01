/**
 * Writes AI and Voice provider settings chosen during onboarding into the
 * preference storage file so they are immediately available to the core's
 * preference reader and the Preference MiniApp.
 *
 * The file format matches what `ctx.storage.set('config', ...)` produces in
 * the Preference MiniApp backend — a JSON object with a top-level `config`
 * key containing the flat key-value map.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getUserHomeDir } from './workspace';

type PreferenceValue = string | number | boolean;

interface PreferenceStoreFile {
  config?: Record<string, PreferenceValue>;
}

export interface AiOnboardingConfig {
  defaultProvider: string;
  providers: Array<{
    provider: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  }>;
}

export interface VoiceOnboardingConfig {
  defaultProvider: string;
  providers: Array<{
    provider: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    azureDeployment?: string;
    azureApiVersion?: string;
  }>;
}

/**
 * Persist provider settings from onboarding into the user's preference.json.
 *
 * This is called immediately after `ensureUserHome()` so the `.storage`
 * directory already exists.
 */
export function saveOnboardingConfig(
  username: string,
  aiConfig?: AiOnboardingConfig,
  voiceConfig?: VoiceOnboardingConfig,
  language?: string,
  accentColor?: string,
): void {
  if (!aiConfig && !voiceConfig && !language && !accentColor) return;

  const storagePath = join(getUserHomeDir(username), '.storage', 'preference.json');

  // Read existing store (may already contain defaults from a migration)
  let store: PreferenceStoreFile = {};
  if (existsSync(storagePath)) {
    try {
      store = JSON.parse(readFileSync(storagePath, 'utf-8')) as PreferenceStoreFile;
    } catch {
      // Corrupt or empty file — start fresh
    }
  }

  const config: Record<string, PreferenceValue> = store.config ?? {};

  const normalizedLanguage = language?.trim();
  if (normalizedLanguage) {
    config['general.language'] = normalizedLanguage;
  }

  const normalizedAccentColor = accentColor?.trim();
  if (normalizedAccentColor) {
    config['general.accentColor'] = normalizedAccentColor;
  }

  if (aiConfig) {
    const enabledProviders = aiConfig.providers.map((provider) => provider.provider).join(',');
    config['ai.enabledProviders'] = enabledProviders;
    config['ai.defaultProvider'] = aiConfig.defaultProvider;

    for (const provider of aiConfig.providers) {
      if (provider.apiKey) {
        config[`ai.providers.${provider.provider}.apiKey`] = provider.apiKey;
      }
      if (provider.model) {
        config[`ai.providers.${provider.provider}.model`] = provider.model;
      }
      if (provider.baseUrl) {
        config[`ai.providers.${provider.provider}.baseUrl`] = provider.baseUrl;
      }
    }
  }

  if (voiceConfig) {
    config['voice.enabledProviders'] = voiceConfig.providers
      .map((provider) => provider.provider)
      .join(',');
    config['voice.defaultProvider'] = voiceConfig.defaultProvider;

    for (const provider of voiceConfig.providers) {
      if (provider.apiKey) {
        config[`voice.providers.${provider.provider}.apiKey`] = provider.apiKey;
      }
      if (provider.model) {
        config[`voice.providers.${provider.provider}.model`] = provider.model;
      }
      if (provider.baseUrl) {
        config[`voice.providers.${provider.provider}.baseUrl`] = provider.baseUrl;
      }
      if (provider.azureDeployment) {
        config[`voice.providers.${provider.provider}.azureDeployment`] = provider.azureDeployment;
      }
      if (provider.azureApiVersion) {
        config[`voice.providers.${provider.provider}.azureApiVersion`] = provider.azureApiVersion;
      }
    }
  }

  store.config = config;
  writeFileSync(storagePath, JSON.stringify(store, null, 2), 'utf-8');
}
