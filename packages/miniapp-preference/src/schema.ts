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

export const CATEGORIES = ['General', 'Server', 'AI', 'Voice'] as const;
export type Category = (typeof CATEGORIES)[number];

export type AiProviderAuthType = 'api-key' | 'subscription';

export interface AiProviderDefinition {
  id: string;
  label: string;
  authType: AiProviderAuthType;
  supportsApiKey: boolean;
  supportsBaseUrl: boolean;
}

export interface VoiceProviderDefinition {
  id: string;
  label: string;
  supportsApiKey: boolean;
  supportsBaseUrl: boolean;
  supportsModel: boolean;
  supportsAzureDeployment: boolean;
  supportsAzureApiVersion: boolean;
}

export const DEFAULT_AI_PROVIDER_ID = 'openai';
const LEGACY_AI_PROVIDER_IDS: Record<string, string> = {
  copilot: 'github-copilot',
};

function normalizeAiProviderId(providerId: string): string {
  return LEGACY_AI_PROVIDER_IDS[providerId] ?? providerId;
}

export const AI_PROVIDER_DEFINITIONS: AiProviderDefinition[] = [
  // ─── Subscription (OAuth) providers ────────────────────────────────────
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    authType: 'subscription',
    supportsApiKey: false,
    supportsBaseUrl: false,
  },
  {
    id: 'openai-codex',
    label: 'OpenAI Codex',
    authType: 'subscription',
    supportsApiKey: false,
    supportsBaseUrl: false,
  },
  {
    id: 'claude-pro',
    label: 'Claude Pro/Max',
    authType: 'subscription',
    supportsApiKey: false,
    supportsBaseUrl: false,
  },
  {
    id: 'gemini-cli',
    label: 'Google Gemini CLI',
    authType: 'subscription',
    supportsApiKey: false,
    supportsBaseUrl: false,
  },
  {
    id: 'google-antigravity',
    label: 'Google Antigravity',
    authType: 'subscription',
    supportsApiKey: false,
    supportsBaseUrl: false,
  },
  // ─── API-key providers ─────────────────────────────────────────────────
  {
    id: 'anthropic',
    label: 'Anthropic',
    authType: 'api-key',
    supportsApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'azure-openai-responses',
    label: 'Azure OpenAI',
    authType: 'api-key',
    supportsApiKey: true,
    supportsBaseUrl: true,
  },
  {
    id: DEFAULT_AI_PROVIDER_ID,
    label: 'OpenAI',
    authType: 'api-key',
    supportsApiKey: true,
    supportsBaseUrl: true,
  },
  {
    id: 'google',
    label: 'Google Gemini',
    authType: 'api-key',
    supportsApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'mistral',
    label: 'Mistral',
    authType: 'api-key',
    supportsApiKey: true,
    supportsBaseUrl: true,
  },
  { id: 'groq', label: 'Groq', authType: 'api-key', supportsApiKey: true, supportsBaseUrl: true },
  {
    id: 'cerebras',
    label: 'Cerebras',
    authType: 'api-key',
    supportsApiKey: true,
    supportsBaseUrl: true,
  },
  { id: 'xai', label: 'xAI', authType: 'api-key', supportsApiKey: true, supportsBaseUrl: true },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    authType: 'api-key',
    supportsApiKey: true,
    supportsBaseUrl: true,
  },
  {
    id: 'vercel-ai-gateway',
    label: 'Vercel AI Gateway',
    authType: 'api-key',
    supportsApiKey: true,
    supportsBaseUrl: true,
  },
  { id: 'zai', label: 'ZAI', authType: 'api-key', supportsApiKey: true, supportsBaseUrl: false },
  {
    id: 'opencode',
    label: 'OpenCode Zen',
    authType: 'api-key',
    supportsApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'opencode-go',
    label: 'OpenCode Go',
    authType: 'api-key',
    supportsApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    authType: 'api-key',
    supportsApiKey: true,
    supportsBaseUrl: true,
  },
  {
    id: 'kimi-coding',
    label: 'Kimi For Coding',
    authType: 'api-key',
    supportsApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    authType: 'api-key',
    supportsApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'minimax-cn',
    label: 'MiniMax China',
    authType: 'api-key',
    supportsApiKey: true,
    supportsBaseUrl: false,
  },
  {
    id: 'ollama',
    label: 'Ollama',
    authType: 'api-key',
    supportsApiKey: false,
    supportsBaseUrl: true,
  },
];

export const DEFAULT_VOICE_PROVIDER_ID = 'openai-whisper';

export const VOICE_PROVIDER_DEFINITIONS: VoiceProviderDefinition[] = [
  {
    id: DEFAULT_VOICE_PROVIDER_ID,
    label: 'OpenAI Whisper',
    supportsApiKey: true,
    supportsBaseUrl: true,
    supportsModel: true,
    supportsAzureDeployment: false,
    supportsAzureApiVersion: false,
  },
  {
    id: 'azure-openai-whisper',
    label: 'Azure OpenAI Whisper',
    supportsApiKey: true,
    supportsBaseUrl: true,
    supportsModel: false,
    supportsAzureDeployment: true,
    supportsAzureApiVersion: true,
  },
];

const AI_PROVIDER_IDS = new Set(AI_PROVIDER_DEFINITIONS.map((provider) => provider.id));
const VOICE_PROVIDER_IDS = new Set(VOICE_PROVIDER_DEFINITIONS.map((provider) => provider.id));

export function getAiProviderDefinition(providerId: string): AiProviderDefinition | undefined {
  const normalizedProviderId = normalizeAiProviderId(providerId);
  return AI_PROVIDER_DEFINITIONS.find((provider) => provider.id === normalizedProviderId);
}

export function getAiProviderConfigKeys(providerId: string): string[] {
  const definition = getAiProviderDefinition(providerId);
  if (!definition) {
    return [];
  }

  const keys = [`ai.providers.${providerId}.model`];
  if (definition.supportsApiKey) {
    keys.push(`ai.providers.${providerId}.apiKey`);
  }
  if (definition.supportsBaseUrl) {
    keys.push(`ai.providers.${providerId}.baseUrl`);
  }
  return keys;
}

export function parseAiEnabledProviders(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [DEFAULT_AI_PROVIDER_ID];
  }

  const providers = value
    .split(',')
    .map((item) => normalizeAiProviderId(item.trim()))
    .filter(
      (item, index, items) => item && items.indexOf(item) === index && AI_PROVIDER_IDS.has(item),
    );

  return providers.length > 0 ? providers : [DEFAULT_AI_PROVIDER_ID];
}

export function serializeAiEnabledProviders(providerIds: string[]): string {
  return parseAiEnabledProviders(providerIds.join(',')).join(',');
}

export function hasAiProviderConfig(config: Config, providerId: string): boolean {
  return getAiProviderConfigKeys(providerId).some((key) => {
    const value = config[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

export function getVoiceProviderDefinition(
  providerId: string,
): VoiceProviderDefinition | undefined {
  return VOICE_PROVIDER_DEFINITIONS.find((provider) => provider.id === providerId);
}

export function getVoiceProviderConfigKeys(providerId: string): string[] {
  const definition = getVoiceProviderDefinition(providerId);
  if (!definition) {
    return [];
  }

  const keys: string[] = [];
  if (definition.supportsApiKey) {
    keys.push(`voice.providers.${providerId}.apiKey`);
  }
  if (definition.supportsModel) {
    keys.push(`voice.providers.${providerId}.model`);
  }
  if (definition.supportsBaseUrl) {
    keys.push(`voice.providers.${providerId}.baseUrl`);
  }
  if (definition.supportsAzureDeployment) {
    keys.push(`voice.providers.${providerId}.azureDeployment`);
  }
  if (definition.supportsAzureApiVersion) {
    keys.push(`voice.providers.${providerId}.azureApiVersion`);
  }
  return keys;
}

export function parseVoiceEnabledProviders(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [DEFAULT_VOICE_PROVIDER_ID];
  }

  const providers = value
    .split(',')
    .map((item) => item.trim())
    .filter(
      (item, index, items) => item && items.indexOf(item) === index && VOICE_PROVIDER_IDS.has(item),
    );

  return providers.length > 0 ? providers : [DEFAULT_VOICE_PROVIDER_ID];
}

export function serializeVoiceEnabledProviders(providerIds: string[]): string {
  return parseVoiceEnabledProviders(providerIds.join(',')).join(',');
}

export function hasVoiceProviderConfig(config: Config, providerId: string): boolean {
  return getVoiceProviderConfigKeys(providerId).some((key) => {
    const value = config[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function getAiProviderPreferenceSchemas(): PreferenceSchema[] {
  const schemas: PreferenceSchema[] = [
    {
      key: 'ai.enabledProviders',
      label: 'Enabled Providers',
      description: 'Ordered list of configured AI providers.',
      type: 'string',
      default: DEFAULT_AI_PROVIDER_ID,
      category: 'AI',
    },
    {
      key: 'ai.defaultProvider',
      label: 'Default Provider',
      description: 'Provider selected by default for chat and tool execution.',
      type: 'string',
      default: DEFAULT_AI_PROVIDER_ID,
      options: AI_PROVIDER_DEFINITIONS.map((provider) => provider.id),
      category: 'AI',
    },
  ];

  for (const provider of AI_PROVIDER_DEFINITIONS) {
    schemas.push({
      key: `ai.providers.${provider.id}.model`,
      label: `${provider.label} Model`,
      description: `Model identifier to use when ${provider.label} is selected.`,
      type: 'string',
      default: '',
      category: 'AI',
    });

    if (provider.supportsApiKey) {
      schemas.push({
        key: `ai.providers.${provider.id}.apiKey`,
        label: `${provider.label} API Key`,
        description: `API key for ${provider.label}.`,
        type: 'string',
        default: '',
        category: 'AI',
        sensitive: true,
      });
    }

    if (provider.supportsBaseUrl) {
      schemas.push({
        key: `ai.providers.${provider.id}.baseUrl`,
        label: `${provider.label} Base URL`,
        description: `Optional custom API base URL for ${provider.label}.`,
        type: 'string',
        default: '',
        category: 'AI',
      });
    }
  }

  schemas.push({
    key: 'ai.maxTokens',
    label: 'Max Tokens',
    description: 'Maximum tokens per AI response.',
    type: 'number',
    default: 4096,
    min: 256,
    max: 128000,
    category: 'AI',
  });

  return schemas;
}

const AI_PREFERENCE_SCHEMAS = getAiProviderPreferenceSchemas();

function getVoiceProviderPreferenceSchemas(): PreferenceSchema[] {
  const schemas: PreferenceSchema[] = [
    {
      key: 'voice.enabledProviders',
      label: 'Enabled Providers',
      description: 'Ordered list of configured STT providers.',
      type: 'string',
      default: DEFAULT_VOICE_PROVIDER_ID,
      category: 'Voice',
    },
    {
      key: 'voice.defaultProvider',
      label: 'Default Provider',
      description: 'Provider selected by default for voice transcription.',
      type: 'string',
      default: DEFAULT_VOICE_PROVIDER_ID,
      options: VOICE_PROVIDER_DEFINITIONS.map((provider) => provider.id),
      category: 'Voice',
    },
  ];

  for (const provider of VOICE_PROVIDER_DEFINITIONS) {
    if (provider.supportsApiKey) {
      schemas.push({
        key: `voice.providers.${provider.id}.apiKey`,
        label: `${provider.label} API Key`,
        description: `API key for ${provider.label}.`,
        type: 'string',
        default: '',
        category: 'Voice',
        sensitive: true,
      });
    }

    if (provider.supportsModel) {
      schemas.push({
        key: `voice.providers.${provider.id}.model`,
        label: `${provider.label} Model`,
        description: `Model identifier to use when ${provider.label} is selected.`,
        type: 'string',
        default: 'whisper-1',
        category: 'Voice',
      });
    }

    if (provider.supportsBaseUrl) {
      schemas.push({
        key: `voice.providers.${provider.id}.baseUrl`,
        label: `${provider.label} Base URL`,
        description:
          provider.id === 'azure-openai-whisper'
            ? 'Base URL for Azure OpenAI Whisper requests.'
            : `Optional custom API base URL for ${provider.label}.`,
        type: 'string',
        default: provider.id === DEFAULT_VOICE_PROVIDER_ID ? 'https://api.openai.com/v1' : '',
        category: 'Voice',
      });
    }

    if (provider.supportsAzureDeployment) {
      schemas.push({
        key: `voice.providers.${provider.id}.azureDeployment`,
        label: `${provider.label} Deployment`,
        description: 'Azure OpenAI deployment name for Whisper transcription.',
        type: 'string',
        default: '',
        category: 'Voice',
      });
    }

    if (provider.supportsAzureApiVersion) {
      schemas.push({
        key: `voice.providers.${provider.id}.azureApiVersion`,
        label: `${provider.label} API Version`,
        description: 'Azure OpenAI API version used for transcription requests.',
        type: 'string',
        default: '2024-06-01',
        category: 'Voice',
      });
    }
  }

  return schemas;
}

const VOICE_PREFERENCE_SCHEMAS = getVoiceProviderPreferenceSchemas();

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
    key: 'general.accentColor',
    label: 'Accent Color',
    description: 'Primary theme color. Accepts hex values or any CSS color string.',
    type: 'string',
    default: '#7c6ff7',
    category: 'General',
  },
  {
    key: 'general.language',
    label: 'Language',
    description: 'UI language/locale.',
    type: 'string',
    default: 'en',
    options: ['en', 'zh'],
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

  // ─── AI ──────────────────────────────────────────────────────────────────
  ...AI_PREFERENCE_SCHEMAS,

  // ─── Voice ────────────────────────────────────────────────────────────
  ...VOICE_PREFERENCE_SCHEMAS,
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
