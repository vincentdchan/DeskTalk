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

interface AiProviderDefinition {
  id: string;
  label: string;
  supportsApiKey: boolean;
  supportsBaseUrl: boolean;
}

const AI_PROVIDER_DEFINITIONS: AiProviderDefinition[] = [
  { id: 'anthropic', label: 'Anthropic', supportsApiKey: true, supportsBaseUrl: false },
  {
    id: 'azure-openai-responses',
    label: 'Azure OpenAI',
    supportsApiKey: true,
    supportsBaseUrl: true,
  },
  { id: 'openai', label: 'OpenAI', supportsApiKey: true, supportsBaseUrl: true },
  { id: 'google', label: 'Google Gemini', supportsApiKey: true, supportsBaseUrl: false },
  {
    id: 'mistral',
    label: 'Mistral',
    supportsApiKey: true,
    supportsBaseUrl: true,
  },
  { id: 'groq', label: 'Groq', supportsApiKey: true, supportsBaseUrl: true },
  {
    id: 'cerebras',
    label: 'Cerebras',
    supportsApiKey: true,
    supportsBaseUrl: true,
  },
  { id: 'xai', label: 'xAI', supportsApiKey: true, supportsBaseUrl: true },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    supportsApiKey: true,
    supportsBaseUrl: true,
  },
  {
    id: 'vercel-ai-gateway',
    label: 'Vercel AI Gateway',
    supportsApiKey: true,
    supportsBaseUrl: true,
  },
  { id: 'zai', label: 'ZAI', supportsApiKey: true, supportsBaseUrl: false },
  { id: 'opencode', label: 'OpenCode Zen', supportsApiKey: true, supportsBaseUrl: false },
  { id: 'opencode-go', label: 'OpenCode Go', supportsApiKey: true, supportsBaseUrl: false },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    supportsApiKey: true,
    supportsBaseUrl: true,
  },
  {
    id: 'kimi-coding',
    label: 'Kimi For Coding',
    supportsApiKey: true,
    supportsBaseUrl: false,
  },
  { id: 'minimax', label: 'MiniMax', supportsApiKey: true, supportsBaseUrl: false },
  {
    id: 'minimax-cn',
    label: 'MiniMax China',
    supportsApiKey: true,
    supportsBaseUrl: false,
  },
  { id: 'ollama', label: 'Ollama', supportsApiKey: false, supportsBaseUrl: true },
];

function getAiProviderPreferenceSchemas(): PreferenceSchema[] {
  const schemas: PreferenceSchema[] = [
    {
      key: 'ai.defaultProvider',
      label: 'Default Provider',
      description: 'Provider selected by default for chat and tool execution.',
      type: 'string',
      default: 'openai',
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

  // ─── AI ──────────────────────────────────────────────────────────────────
  ...AI_PREFERENCE_SCHEMAS,

  // ─── Voice ────────────────────────────────────────────────────────────
  {
    key: 'voice.provider',
    label: 'STT Provider',
    description: 'Speech-to-text provider to use for voice transcription.',
    type: 'string',
    default: 'openai-whisper',
    options: ['openai-whisper', 'azure-openai-whisper'],
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
    description: 'STT model identifier for OpenAI-compatible providers (e.g. whisper-1).',
    type: 'string',
    default: 'whisper-1',
    category: 'Voice',
  },
  {
    key: 'voice.baseUrl',
    label: 'API Base URL',
    description:
      'Base URL for the STT provider API. For Azure use your resource URL (e.g. https://YOUR-RESOURCE.openai.azure.com).',
    type: 'string',
    default: 'https://api.openai.com/v1',
    category: 'Voice',
  },
  {
    key: 'voice.azureDeployment',
    label: 'Azure Deployment',
    description: 'Azure OpenAI deployment name for Whisper transcription.',
    type: 'string',
    default: '',
    category: 'Voice',
  },
  {
    key: 'voice.azureApiVersion',
    label: 'Azure API Version',
    description: 'Azure OpenAI API version used for transcription requests.',
    type: 'string',
    default: '2024-06-01',
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
