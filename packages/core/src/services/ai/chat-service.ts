export type AiRole = 'system' | 'user' | 'assistant';

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface AiConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens: number;
}

export interface AiUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AiResult {
  text: string;
  provider: string;
  model: string;
  usage?: AiUsage;
}

function resolveBaseUrl(provider: string, baseUrl?: string): string {
  if (baseUrl) return baseUrl.replace(/\/+$/, '');

  switch (provider) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'xai':
      return 'https://api.x.ai/v1';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'ollama':
      return 'http://localhost:11434/v1';
    case 'mistral':
      return 'https://api.mistral.ai/v1';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'google':
      return 'https://generativelanguage.googleapis.com/v1beta';
    default:
      return '';
  }
}

function requireModel(config: AiConfig): void {
  if (!config.model.trim()) {
    throw new Error('No AI model configured. Set Preferences -> AI -> Model.');
  }
}

function requireApiKey(config: AiConfig): void {
  if (config.provider !== 'ollama' && !config.apiKey?.trim()) {
    throw new Error('No AI API key configured. Set Preferences -> AI -> API Key.');
  }
}

function getTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('')
      .trim();
  }
  return '';
}

async function chatOpenAICompatible(config: AiConfig, messages: AiMessage[]): Promise<AiResult> {
  requireModel(config);
  requireApiKey(config);

  const baseUrl = resolveBaseUrl(config.provider, config.baseUrl);
  if (!baseUrl) {
    throw new Error(`Unsupported AI provider: ${config.provider}`);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey?.trim()) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`${config.provider} API error (${response.status}): ${await response.text()}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const text = getTextContent(result.choices?.[0]?.message?.content).trim();
  if (!text) {
    throw new Error(`${config.provider} returned an empty response.`);
  }

  return {
    text,
    provider: config.provider,
    model: config.model,
    usage: {
      inputTokens: result.usage?.prompt_tokens,
      outputTokens: result.usage?.completion_tokens,
      totalTokens: result.usage?.total_tokens,
    },
  };
}

async function chatAnthropic(config: AiConfig, messages: AiMessage[]): Promise<AiResult> {
  requireModel(config);
  requireApiKey(config);

  const baseUrl = resolveBaseUrl(config.provider, config.baseUrl);
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
    .trim();

  const anthropicMessages = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role, content: message.content }));

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      ...(system ? { system } : {}),
      messages: anthropicMessages,
    }),
  });

  if (!response.ok) {
    throw new Error(`anthropic API error (${response.status}): ${await response.text()}`);
  }

  const result = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const text = (result.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();

  if (!text) {
    throw new Error('anthropic returned an empty response.');
  }

  return {
    text,
    provider: config.provider,
    model: config.model,
    usage: {
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
      totalTokens:
        (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0) || undefined,
    },
  };
}

async function chatGoogle(config: AiConfig, messages: AiMessage[]): Promise<AiResult> {
  requireModel(config);
  requireApiKey(config);

  const baseUrl = resolveBaseUrl(config.provider, config.baseUrl);
  const systemInstruction = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
    .trim();

  const contents = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));

  const response = await fetch(
    `${baseUrl}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey!)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...(systemInstruction
          ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
          : {}),
        contents,
        generationConfig: {
          maxOutputTokens: config.maxTokens,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`google API error (${response.status}): ${await response.text()}`);
  }

  const result = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };

  const text = (result.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('google returned an empty response.');
  }

  return {
    text,
    provider: config.provider,
    model: config.model,
    usage: {
      inputTokens: result.usageMetadata?.promptTokenCount,
      outputTokens: result.usageMetadata?.candidatesTokenCount,
      totalTokens: result.usageMetadata?.totalTokenCount,
    },
  };
}

export class AiChatService {
  async chat(config: AiConfig, messages: AiMessage[]): Promise<AiResult> {
    switch (config.provider) {
      case 'openai':
      case 'xai':
      case 'openrouter':
      case 'ollama':
      case 'mistral':
        return chatOpenAICompatible(config, messages);
      case 'anthropic':
        return chatAnthropic(config, messages);
      case 'google':
        return chatGoogle(config, messages);
      case 'bedrock':
        throw new Error('Bedrock is not implemented yet in DeskTalk AI integration.');
      default:
        throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
  }
}
