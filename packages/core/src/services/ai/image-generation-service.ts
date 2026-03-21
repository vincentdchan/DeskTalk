import sharp from 'sharp';
import type pino from 'pino';
import { getAiProviderPreferences, getDefaultAiProvider, type PreferenceReader } from './providers';
import type { ModelRegistry } from '@mariozechner/pi-coding-agent';

const ICON_PROMPT_PREFIX =
  'A minimal flat-design app icon: ${description}. Single centered symbol, solid color background, rounded square, clean and modern, no text, 256x256 pixels.';

const OPENAI_ICON_MODEL = 'dall-e-3';
const OPENROUTER_ICON_MODEL = 'google/gemini-3.1-flash-image-preview';
const GOOGLE_ICON_MODEL = 'gemini-2.0-flash-preview-image-generation';

export interface GeneratedIconResult {
  image: Buffer;
  provider: string;
  model: string;
}

interface ImageGenerationServiceOptions {
  modelRegistry: ModelRegistry;
  getPreference: PreferenceReader;
  logger: pino.Logger;
}

function getPrompt(description: string): string {
  return ICON_PROMPT_PREFIX.replace('${description}', description.trim());
}

function resolveBaseUrl(provider: string, baseUrl?: string): string {
  if (baseUrl) return baseUrl.replace(/\/+$/, '');

  switch (provider) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'google':
      return 'https://generativelanguage.googleapis.com/v1beta';
    default:
      return '';
  }
}

async function resizeToIconPng(input: Buffer): Promise<Buffer> {
  return sharp(input).resize({ width: 256, height: 256, fit: 'cover' }).png().toBuffer();
}

function decodeBase64Image(data: string): Buffer {
  return Buffer.from(data, 'base64');
}

function decodeDataUrlImage(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) {
    throw new Error('Provider returned an unsupported image URL format.');
  }

  return decodeBase64Image(match[1]);
}

function summarizeErrorBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= 1000) {
    return trimmed;
  }
  return `${trimmed.slice(0, 1000)}...`;
}

export class ImageGenerationService {
  private readonly modelRegistry;
  private readonly getPreference;
  private readonly log;

  constructor(options: ImageGenerationServiceOptions) {
    this.modelRegistry = options.modelRegistry;
    this.getPreference = options.getPreference;
    this.log = options.logger;
  }

  async generateIcon(description: string): Promise<GeneratedIconResult> {
    const prompt = getPrompt(description);
    const provider = await getDefaultAiProvider(this.getPreference);
    const providerPreferences = await getAiProviderPreferences(this.getPreference, provider);
    const apiKey = await this.modelRegistry.getApiKeyForProvider(provider);
    const baseUrl = resolveBaseUrl(provider, providerPreferences.baseUrl);

    if (provider !== 'openai' && provider !== 'openrouter' && provider !== 'google') {
      throw new Error(`Current AI provider does not support icon generation yet: ${provider}`);
    }

    if (!apiKey) {
      throw new Error(`No API key configured for ${provider}.`);
    }

    if (!baseUrl) {
      throw new Error(`No base URL available for ${provider}.`);
    }

    this.log.debug(
      {
        provider,
        baseUrl,
        promptLength: prompt.length,
      },
      'generating liveapp icon',
    );

    switch (provider) {
      case 'openai':
        return {
          image: await this.generateOpenAiCompatibleIcon(
            baseUrl,
            apiKey,
            OPENAI_ICON_MODEL,
            prompt,
          ),
          provider,
          model: OPENAI_ICON_MODEL,
        };
      case 'openrouter':
        return {
          image: await this.generateOpenRouterIcon(baseUrl, apiKey, prompt),
          provider,
          model: OPENROUTER_ICON_MODEL,
        };
      case 'google':
        return {
          image: await this.generateGoogleIcon(baseUrl, apiKey, prompt),
          provider,
          model: GOOGLE_ICON_MODEL,
        };
      default:
        throw new Error(`Unsupported icon provider: ${provider}`);
    }
  }

  private async generateOpenAiCompatibleIcon(
    baseUrl: string,
    apiKey: string,
    model: string,
    prompt: string,
    isOpenRouter = false,
  ): Promise<Buffer> {
    const endpoint = `${baseUrl}/images/generations`;
    this.log.debug(
      { provider: isOpenRouter ? 'openrouter' : 'openai', endpoint, model },
      'requesting icon image',
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    if (isOpenRouter) {
      headers['HTTP-Referer'] = 'https://desktalk.local';
      headers['X-Title'] = 'DeskTalk';
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        prompt,
        size: '1024x1024',
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      const errorText = summarizeErrorBody(await response.text());
      this.log.error(
        {
          provider: isOpenRouter ? 'openrouter' : 'openai',
          endpoint,
          model,
          status: response.status,
          errorText,
        },
        'icon image request failed',
      );
      throw new Error(`Image request failed (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as {
      data?: Array<{ b64_json?: string }>;
    };
    const base64Image = result.data?.[0]?.b64_json;
    if (!base64Image) {
      throw new Error('No image data returned by the provider.');
    }

    return resizeToIconPng(decodeBase64Image(base64Image));
  }

  private async generateGoogleIcon(
    baseUrl: string,
    apiKey: string,
    prompt: string,
  ): Promise<Buffer> {
    const endpoint = `${baseUrl}/models/${encodeURIComponent(GOOGLE_ICON_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    this.log.debug(
      { provider: 'google', endpoint, model: GOOGLE_ICON_MODEL },
      'requesting icon image',
    );

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    });

    if (!response.ok) {
      const errorText = summarizeErrorBody(await response.text());
      this.log.error(
        {
          provider: 'google',
          endpoint,
          model: GOOGLE_ICON_MODEL,
          status: response.status,
          errorText,
        },
        'icon image request failed',
      );
      throw new Error(`Image request failed (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
    };
    const base64Image = result.candidates?.[0]?.content?.parts?.find(
      (part) => part.inlineData?.data,
    )?.inlineData?.data;
    if (!base64Image) {
      throw new Error('No image data returned by Google.');
    }

    return resizeToIconPng(decodeBase64Image(base64Image));
  }

  private async generateOpenRouterIcon(
    baseUrl: string,
    apiKey: string,
    prompt: string,
  ): Promise<Buffer> {
    const endpoint = `${baseUrl}/chat/completions`;
    this.log.debug(
      { provider: 'openrouter', endpoint, model: OPENROUTER_ICON_MODEL },
      'requesting icon image',
    );

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://desktalk.local',
        'X-Title': 'DeskTalk',
      },
      body: JSON.stringify({
        model: OPENROUTER_ICON_MODEL,
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text'],
      }),
    });

    if (!response.ok) {
      const errorText = summarizeErrorBody(await response.text());
      this.log.error(
        {
          provider: 'openrouter',
          endpoint,
          model: OPENROUTER_ICON_MODEL,
          status: response.status,
          errorText,
        },
        'icon image request failed',
      );
      throw new Error(`Image request failed (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as {
      choices?: Array<{
        message?: {
          images?: Array<{
            image_url?: { url?: string };
          }>;
        };
      }>;
    };
    const imageUrl = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
      throw new Error('No image data returned by OpenRouter.');
    }

    return resizeToIconPng(decodeDataUrlImage(imageUrl));
  }
}

export { getPrompt as buildIconPrompt };
