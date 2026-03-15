import type { MiniAppManifest, MiniAppContext, MiniAppBackendActivation } from '@desktalk/sdk';
import type { Config } from './schema';
import { PREFERENCE_SCHEMAS, getDefaultConfig, getSchema, maskSensitive } from './schema';

// ─── Manifest ────────────────────────────────────────────────────────────────

export const manifest: MiniAppManifest = {
  id: 'preference',
  name: 'Preferences',
  icon: '\u2699\uFE0F',
  version: '0.1.0',
  description: 'Application settings and configuration',
};

// ─── Activate ────────────────────────────────────────────────────────────────

/**
 * The Preference MiniApp uses ctx.storage as the persistence layer for settings.
 * In production, the core would provide a privileged ctx.config hook that writes
 * to <config>/config.toml. For now, ctx.storage serves as the backing store.
 *
 * All settings are stored under the key "config" as a flat Config object.
 */
export function activate(ctx: MiniAppContext): MiniAppBackendActivation {
  ctx.logger.info('Preference MiniApp activated');

  const defaults = getDefaultConfig();

  /** Load the persisted config, merging with defaults for any missing keys. */
  async function loadConfig(): Promise<Config> {
    const stored = await ctx.storage.get<Config>('config');
    return { ...defaults, ...(stored ?? {}) };
  }

  /** Persist the config to storage. */
  async function saveConfig(config: Config): Promise<void> {
    await ctx.storage.set('config', config);
  }

  /**
   * Mask sensitive values in the config for API responses.
   * The raw value is stored internally; only the masked version is returned.
   */
  function maskConfig(config: Config): Config {
    const masked = { ...config };
    for (const schema of PREFERENCE_SCHEMAS) {
      if (schema.sensitive && typeof masked[schema.key] === 'string') {
        const raw = masked[schema.key] as string;
        masked[schema.key] = raw ? maskSensitive(raw) : '';
      }
    }
    return masked;
  }

  // ─── preferences.getAll ──────────────────────────────────────────────────

  ctx.messaging.onCommand<void, Config>('preferences.getAll', async () => {
    const config = await loadConfig();
    return maskConfig(config);
  });

  // ─── preferences.get ─────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ key: string }, { value: string | number | boolean }>(
    'preferences.get',
    async (req) => {
      const config = await loadConfig();
      const schema = getSchema(req.key);
      let value = config[req.key] ?? defaults[req.key];

      if (value === undefined) {
        throw new Error(`Unknown preference key: ${req.key}`);
      }

      // Mask sensitive values
      if (schema?.sensitive && typeof value === 'string' && value) {
        value = maskSensitive(value);
      }

      return { value };
    },
  );

  // ─── preferences.getRaw (internal — returns unmasked values for backend use)

  ctx.messaging.onCommand<{ key: string }, { value: string | number | boolean }>(
    'preferences.getRaw',
    async (req) => {
      const config = await loadConfig();
      const value = config[req.key] ?? defaults[req.key];

      if (value === undefined) {
        throw new Error(`Unknown preference key: ${req.key}`);
      }

      return { value };
    },
  );

  // ─── preferences.set ─────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ key: string; value: string | number | boolean }, void>(
    'preferences.set',
    async (req) => {
      const schema = getSchema(req.key);
      if (!schema) {
        throw new Error(`Unknown preference key: ${req.key}`);
      }

      // Type validation
      if (typeof req.value !== schema.type) {
        throw new Error(`Expected ${schema.type} for ${req.key}, got ${typeof req.value}`);
      }

      // Range validation for numbers
      if (schema.type === 'number' && typeof req.value === 'number') {
        if (schema.min !== undefined && req.value < schema.min) {
          throw new Error(`${req.key} must be >= ${schema.min}`);
        }
        if (schema.max !== undefined && req.value > schema.max) {
          throw new Error(`${req.key} must be <= ${schema.max}`);
        }
      }

      // Enum validation for string options
      if (schema.options && typeof req.value === 'string') {
        if (!schema.options.includes(req.value)) {
          throw new Error(`${req.key} must be one of: ${schema.options.join(', ')}`);
        }
      }

      const config = await loadConfig();
      config[req.key] = req.value;
      await saveConfig(config);

      ctx.logger.info(`Setting updated: ${req.key}`);

      // Emit change event so frontend can react
      ctx.messaging.emit('preferences:changed', {
        key: req.key,
        value: schema.sensitive ? maskSensitive(String(req.value)) : req.value,
        requiresRestart: schema.requiresRestart ?? false,
      });
    },
  );

  // ─── preferences.reset ───────────────────────────────────────────────────

  ctx.messaging.onCommand<{ key: string }, void>('preferences.reset', async (req) => {
    const schema = getSchema(req.key);
    if (!schema) {
      throw new Error(`Unknown preference key: ${req.key}`);
    }

    const config = await loadConfig();
    config[req.key] = schema.default;
    await saveConfig(config);

    ctx.logger.info(`Setting reset: ${req.key}`);

    ctx.messaging.emit('preferences:changed', {
      key: req.key,
      value: schema.default,
      requiresRestart: schema.requiresRestart ?? false,
    });
  });

  // ─── preferences.resetAll ────────────────────────────────────────────────

  ctx.messaging.onCommand<void, void>('preferences.resetAll', async () => {
    await saveConfig({ ...defaults });
    ctx.logger.info('All settings reset to defaults');

    ctx.messaging.emit('preferences:resetAll', {});
  });

  return {};
}

// ─── Deactivate ──────────────────────────────────────────────────────────────

export function deactivate(): void {
  // cleanup
}
