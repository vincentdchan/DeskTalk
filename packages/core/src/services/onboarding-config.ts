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
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export interface VoiceOnboardingConfig {
  provider: string;
  apiKey: string;
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
): void {
  if (!aiConfig && !voiceConfig) return;

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

  if (aiConfig) {
    config['ai.defaultProvider'] = aiConfig.provider;
    config[`ai.providers.${aiConfig.provider}.apiKey`] = aiConfig.apiKey;
    if (aiConfig.model) {
      config[`ai.providers.${aiConfig.provider}.model`] = aiConfig.model;
    }
    if (aiConfig.baseUrl) {
      config[`ai.providers.${aiConfig.provider}.baseUrl`] = aiConfig.baseUrl;
    }
  }

  if (voiceConfig) {
    config['voice.provider'] = voiceConfig.provider;
    config['voice.apiKey'] = voiceConfig.apiKey;
  }

  store.config = config;
  writeFileSync(storagePath, JSON.stringify(store, null, 2), 'utf-8');
}
