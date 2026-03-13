// ─── Preference Schema ───────────────────────────────────────────────────────
// Shared between backend and frontend. Defines every configurable setting,
// its type, default value, category, and UI constraints.

export interface PreferenceSchema {
  key: string;
  label: string;
  description: string;
  type: 'string' | 'number' | 'boolean';
  default: string | number | boolean;
  options?: string[]; // For enum-like string settings (renders a dropdown)
  min?: number; // For number settings
  max?: number; // For number settings
  category: string;
  requiresRestart?: boolean;
  sensitive?: boolean; // e.g. API keys — masked in UI
}

export type Config = Record<string, string | number | boolean>;

export const CATEGORIES = ['General', 'Server', 'Window', 'AI', 'Dock', 'Voice'] as const;
export type Category = (typeof CATEGORIES)[number];

export const PREFERENCE_SCHEMAS: PreferenceSchema[] = [
  // ─── General ─────────────────────────────────────────────────────────────
  {
    key: 'general.theme',
    label: 'Theme',
    description: 'UI theme: light or dark.',
    type: 'string',
    default: 'light',
    options: ['light', 'dark'],
    category: 'General',
  },
  {
    key: 'general.language',
    label: 'Language',
    description: 'UI language/locale.',
    type: 'string',
    default: 'en',
    options: ['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de'],
    category: 'General',
  },
  {
    key: 'general.dataDirectory',
    label: 'Data Directory',
    description:
      'Override the base data directory. Leave empty for platform default (resolved via env-paths).',
    type: 'string',
    default: '',
    category: 'General',
    requiresRestart: true,
  },

  // ─── Server ──────────────────────────────────────────────────────────────
  {
    key: 'server.host',
    label: 'Host',
    description: 'Server bind address.',
    type: 'string',
    default: 'localhost',
    category: 'Server',
    requiresRestart: true,
  },
  {
    key: 'server.port',
    label: 'Port',
    description: 'Server listen port.',
    type: 'number',
    default: 3000,
    min: 1,
    max: 65535,
    category: 'Server',
    requiresRestart: true,
  },

  // ─── Window ──────────────────────────────────────────────────────────────
  {
    key: 'window.defaultWidth',
    label: 'Default Width',
    description: 'Default width for new windows (px).',
    type: 'number',
    default: 800,
    min: 200,
    max: 3840,
    category: 'Window',
  },
  {
    key: 'window.defaultHeight',
    label: 'Default Height',
    description: 'Default height for new windows (px).',
    type: 'number',
    default: 600,
    min: 150,
    max: 2160,
    category: 'Window',
  },
  {
    key: 'window.snapToEdges',
    label: 'Snap to Edges',
    description: 'Snap windows to screen edges when dragging.',
    type: 'boolean',
    default: true,
    category: 'Window',
  },

  // ─── AI ──────────────────────────────────────────────────────────────────
  {
    key: 'ai.model',
    label: 'Model',
    description: 'AI model identifier (e.g. claude-sonnet-4-20250514, gpt-4o).',
    type: 'string',
    default: '',
    category: 'AI',
  },
  {
    key: 'ai.apiKey',
    label: 'API Key',
    description: 'API key for the AI provider.',
    type: 'string',
    default: '',
    category: 'AI',
    sensitive: true,
  },
  {
    key: 'ai.maxTokens',
    label: 'Max Tokens',
    description: 'Maximum tokens per AI response.',
    type: 'number',
    default: 4096,
    min: 256,
    max: 128000,
    category: 'AI',
  },

  // ─── Dock ────────────────────────────────────────────────────────────────
  {
    key: 'dock.position',
    label: 'Position',
    description: 'Dock position on screen.',
    type: 'string',
    default: 'bottom',
    options: ['bottom', 'left', 'right'],
    category: 'Dock',
  },
  {
    key: 'dock.autoHide',
    label: 'Auto-hide',
    description: 'Hide the dock when not hovered.',
    type: 'boolean',
    default: false,
    category: 'Dock',
  },
  {
    key: 'dock.iconSize',
    label: 'Icon Size',
    description: 'Dock icon size (px).',
    type: 'number',
    default: 48,
    min: 24,
    max: 128,
    category: 'Dock',
  },

  // ─── Voice ────────────────────────────────────────────────────────────
  {
    key: 'voice.provider',
    label: 'STT Provider',
    description: 'Speech-to-text provider to use for voice transcription.',
    type: 'string',
    default: 'openai-whisper',
    options: ['openai-whisper'],
    category: 'Voice',
  },
  {
    key: 'voice.apiKey',
    label: 'API Key',
    description: 'API key for the STT provider.',
    type: 'string',
    default: '',
    category: 'Voice',
    sensitive: true,
  },
  {
    key: 'voice.model',
    label: 'Model',
    description: 'STT model identifier (e.g. whisper-1).',
    type: 'string',
    default: 'whisper-1',
    category: 'Voice',
  },
  {
    key: 'voice.baseUrl',
    label: 'API Base URL',
    description: 'Base URL for the STT provider API.',
    type: 'string',
    default: 'https://api.openai.com/v1',
    category: 'Voice',
  },
  {
    key: 'voice.silenceTimeoutMs',
    label: 'Silence Timeout',
    description: 'Silence duration (ms) before finalizing an utterance.',
    type: 'number',
    default: 800,
    min: 200,
    max: 5000,
    category: 'Voice',
  },
  {
    key: 'voice.energyThreshold',
    label: 'Energy Threshold',
    description: 'RMS energy threshold for voice activity detection (0–32767).',
    type: 'number',
    default: 500,
    min: 50,
    max: 10000,
    category: 'Voice',
  },
];

/** Build the default config from schemas */
export function getDefaultConfig(): Config {
  const config: Config = {};
  for (const schema of PREFERENCE_SCHEMAS) {
    config[schema.key] = schema.default;
  }
  return config;
}

/** Find schema by key */
export function getSchema(key: string): PreferenceSchema | undefined {
  return PREFERENCE_SCHEMAS.find((s) => s.key === key);
}

/** Get all schemas for a category */
export function getSchemasByCategory(category: string): PreferenceSchema[] {
  return PREFERENCE_SCHEMAS.filter((s) => s.category === category);
}

/** Mask a sensitive value — show only last 4 characters */
export function maskSensitive(value: string): string {
  if (value.length <= 4) return '****';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}
