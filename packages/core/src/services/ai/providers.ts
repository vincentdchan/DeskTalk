export type AiProviderAuthType = 'api-key' | 'subscription';

export interface AiProviderDefinition {
  id: string;
  label: string;
  authType: AiProviderAuthType;
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
  // ─── Subscription (OAuth) providers ────────────────────────────────────
  {
    id: 'copilot',
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
    id: 'openai',
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

export function getAiProviderDefinition(provider: string): AiProviderDefinition | undefined {
  return AI_PROVIDER_DEFINITIONS.find((entry) => entry.id === provider);
}

export function isSubscriptionProvider(provider: string): boolean {
  const definition = getAiProviderDefinition(provider);
  return definition?.authType === 'subscription';
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
