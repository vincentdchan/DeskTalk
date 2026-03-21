import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { broadcastEvent } from '../messaging';
import { ImageGenerationService } from './image-generation-service';

const generateIconSchema = Type.Object({
  liveAppId: Type.String({ description: 'Directory name of the LiveApp to generate an icon for.' }),
  description: Type.String({ description: 'Short visual description of the desired app icon.' }),
});

type GenerateIconParams = {
  liveAppId: string;
  description: string;
};

interface GenerateIconToolOptions {
  imageGenerationService: ImageGenerationService;
  getCurrentUsername: () => string;
  workspaceDataDir: string;
}

export function createGenerateIconTool(options: GenerateIconToolOptions): ToolDefinition {
  const { imageGenerationService, getCurrentUsername, workspaceDataDir } = options;

  return {
    name: 'generate_icon',
    label: 'Generate Icon',
    description:
      'Generate a 256x256 PNG icon for an existing LiveApp and save it as icon.png in the LiveApp directory.',
    promptSnippet: 'Generate or regenerate an icon for any LiveApp.',
    promptGuidelines: [
      'Use this after `create_liveapp`, or later for an existing LiveApp that has no icon yet or needs a refreshed icon.',
      'Pass the LiveApp directory name as `liveAppId` and a short visual description as `description`.',
      'If you need to identify an existing LiveApp, use the Desktop Context, `desktop` action="list", or a focused Preview window state to find its LiveApp ID.',
      'If this tool reports `{ ok: false }`, continue normally without retrying. The app can keep the default icon.',
    ],
    parameters: generateIconSchema,
    async execute(_toolCallId, params) {
      const input = params as GenerateIconParams;
      const liveAppDir = join(
        workspaceDataDir,
        'home',
        getCurrentUsername(),
        '.data',
        'liveapps',
        input.liveAppId,
      );
      const iconPath = join(liveAppDir, 'icon.png');

      try {
        const result = await imageGenerationService.generateIcon(input.description);
        writeFileSync(iconPath, result.image);
        broadcastEvent('preview', 'liveapps.changed', {
          path: iconPath,
          reason: 'icon-generated',
        });
        const payload = {
          ok: true,
          path: iconPath,
          provider: result.provider,
          model: result.model,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          details: payload,
        };
      } catch (error) {
        const payload = {
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          details: payload,
        };
      }
    },
  };
}
