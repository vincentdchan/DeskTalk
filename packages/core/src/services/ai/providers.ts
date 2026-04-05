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
const LEGACY_AI_PROVIDER_IDS: Record<string, string> = {
  copilot: 'github-copilot',
};

function normalizeAiProviderId(provider: string): string {
  return LEGACY_AI_PROVIDER_IDS[provider] ?? provider;
}

function getLegacyAiProviderIds(provider: string): string[] {
  return Object.entries(LEGACY_AI_PROVIDER_IDS)
    .filter(([, canonical]) => canonical === provider)
    .map(([legacy]) => legacy);
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
  return `ai.providers.${normalizeAiProviderId(provider)}.${field}`;
}

export function isKnownAiProvider(provider: string): boolean {
  const normalizedProvider = normalizeAiProviderId(provider);
  return AI_PROVIDER_DEFINITIONS.some((entry) => entry.id === normalizedProvider);
}

export function getAiProviderDefinition(provider: string): AiProviderDefinition | undefined {
  const normalizedProvider = normalizeAiProviderId(provider);
  return AI_PROVIDER_DEFINITIONS.find((entry) => entry.id === normalizedProvider);
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

  const normalizedProvider = normalizeAiProviderId(configured);
  return isKnownAiProvider(normalizedProvider) ? normalizedProvider : AI_DEFAULT_PROVIDER;
}

export async function getAiProviderPreferences(
  getPreference: PreferenceReader,
  provider: string,
): Promise<AiProviderPreferences> {
  const normalizedProvider = normalizeAiProviderId(provider);
  const legacyProvider = normalizeAiProviderId(
    ((await getPreference('ai.provider')) as string) ?? AI_DEFAULT_PROVIDER,
  );
  const legacyMatches = legacyProvider === normalizedProvider;
  const providerIds = [normalizedProvider, ...getLegacyAiProviderIds(normalizedProvider)];

  const readProviderField = async (field: 'model' | 'apiKey' | 'baseUrl'): Promise<string> => {
    for (const providerId of providerIds) {
      const value = (await getPreference(`ai.providers.${providerId}.${field}`)) as string | undefined;
      if (value !== undefined) {
        return value;
      }
    }

    if (!legacyMatches) {
      return '';
    }

    const legacyKey = field === 'model' ? 'ai.model' : field === 'apiKey' ? 'ai.apiKey' : 'ai.baseUrl';
    return ((await getPreference(legacyKey)) as string) ?? '';
  };

  const model = await readProviderField('model');
  const apiKey = await readProviderField('apiKey');
  const baseUrl = await readProviderField('baseUrl');

  return {
    provider: normalizedProvider,
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
