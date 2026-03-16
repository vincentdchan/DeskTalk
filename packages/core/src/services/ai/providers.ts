export interface AiProviderDefinition {
  id: string;
  label: string;
  supportsApiKey: boolean;
  supportsBaseUrl: boolean;
}

export interface AiProviderPreferences {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
}

export const AI_DEFAULT_PROVIDER = 'openai';

export const AI_PROVIDER_DEFINITIONS: AiProviderDefinition[] = [
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

export type PreferenceReader = (key: string) => Promise<string | number | boolean | undefined>;

export function getAiProviderPreferenceKey(
  provider: string,
  field: 'model' | 'apiKey' | 'baseUrl',
): string {
  return `ai.providers.${provider}.${field}`;
}

export function isKnownAiProvider(provider: string): boolean {
  return AI_PROVIDER_DEFINITIONS.some((entry) => entry.id === provider);
}

export async function getDefaultAiProvider(getPreference: PreferenceReader): Promise<string> {
  const configured =
    ((await getPreference('ai.defaultProvider')) as string) ??
    ((await getPreference('ai.provider')) as string) ??
    AI_DEFAULT_PROVIDER;

  return isKnownAiProvider(configured) ? configured : AI_DEFAULT_PROVIDER;
}

export async function getAiProviderPreferences(
  getPreference: PreferenceReader,
  provider: string,
): Promise<AiProviderPreferences> {
  const legacyProvider = ((await getPreference('ai.provider')) as string) ?? AI_DEFAULT_PROVIDER;
  const legacyMatches = legacyProvider === provider;

  const model =
    ((await getPreference(getAiProviderPreferenceKey(provider, 'model'))) as string) ??
    (legacyMatches ? (((await getPreference('ai.model')) as string) ?? '') : '');
  const apiKey =
    ((await getPreference(getAiProviderPreferenceKey(provider, 'apiKey'))) as string) ??
    (legacyMatches ? (((await getPreference('ai.apiKey')) as string) ?? '') : '');
  const baseUrl =
    ((await getPreference(getAiProviderPreferenceKey(provider, 'baseUrl'))) as string) ??
    (legacyMatches ? (((await getPreference('ai.baseUrl')) as string) ?? '') : '');

  return {
    provider,
    model,
    apiKey,
    baseUrl,
  };
}

export async function getAllAiProviderPreferences(
  getPreference: PreferenceReader,
): Promise<AiProviderPreferences[]> {
  return Promise.all(
    AI_PROVIDER_DEFINITIONS.map((provider) => getAiProviderPreferences(getPreference, provider.id)),
  );
}
