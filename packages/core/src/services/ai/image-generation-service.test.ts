import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { buildIconPrompt, ImageGenerationService } from './image-generation-service';

describe('image generation service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the icon prompt prefix', () => {
    expect(buildIconPrompt('a blue kanban board')).toContain('A minimal flat-design app icon:');
    expect(buildIconPrompt('a blue kanban board')).toContain('a blue kanban board');
  });

  it('generates and resizes an openai icon', async () => {
    const sourceImage = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ b64_json: sourceImage.toString('base64') }] }),
      }),
    );

    const service = new ImageGenerationService({
      modelRegistry: {
        getApiKeyForProvider: async () => 'test-key',
      } as never,
      getPreference: async (key) => {
        if (key === 'ai.defaultProvider') return 'openai';
        return '';
      },
      logger: { debug: vi.fn() } as never,
    });

    const result = await service.generateIcon('a red circle');
    const metadata = await sharp(result.image).metadata();

    expect(result.provider).toBe('openai');
    expect(result.model).toBe('dall-e-3');
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);
  });

  it('rejects unsupported current providers', async () => {
    const service = new ImageGenerationService({
      modelRegistry: {
        getApiKeyForProvider: async () => 'test-key',
      } as never,
      getPreference: async (key) => {
        if (key === 'ai.defaultProvider') return 'anthropic';
        return '';
      },
      logger: { debug: vi.fn() } as never,
    });

    await expect(service.generateIcon('a robot')).rejects.toThrow(
      'Current AI provider does not support icon generation yet: anthropic',
    );
  });
});
