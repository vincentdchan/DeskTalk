import { StringEnum } from '@mariozechner/pi-ai';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import type { SendAiCommand } from './desktop-tool';

const layoutSchema = Type.Object({
  action: StringEnum(['focus_direction', 'swap', 'resize', 'rotate', 'equalize', 'split_mode']),
  direction: Type.Optional(
    StringEnum(['left', 'right', 'up', 'down'], {
      description: 'Direction for focus_direction or swap.',
    }),
  ),
  delta: Type.Optional(
    Type.Number({
      description: 'Resize amount for the focused split. Positive grows the focused window.',
    }),
  ),
  mode: Type.Optional(
    StringEnum(['horizontal', 'vertical', 'auto'], {
      description: 'Split direction mode to use for the next opened window.',
    }),
  ),
});

type LayoutParams = {
  action: 'focus_direction' | 'swap' | 'resize' | 'rotate' | 'equalize' | 'split_mode';
  direction?: 'left' | 'right' | 'up' | 'down';
  delta?: number;
  mode?: 'horizontal' | 'vertical' | 'auto';
};

interface LayoutToolOptions {
  sendAiCommand: SendAiCommand;
}

function stringify(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(message);
  }
  return value;
}

export function createLayoutTool(options: LayoutToolOptions): ToolDefinition {
  const { sendAiCommand } = options;

  return {
    name: 'layout',
    label: 'Layout',
    description:
      'Adjust the DeskTalk tiling layout: move focus, swap windows, resize the focused split, rotate, equalize, or change the next split mode.',
    promptSnippet: 'Adjust the DeskTalk tiling layout for the focused window.',
    promptGuidelines: [
      'Read the current [Desktop Context] layout before changing the window arrangement.',
      'Use `desktop` with action="list" when you need fresh window IDs or available MiniApps.',
      'Use small resize deltas such as 0.05 to 0.15 for incremental adjustments.',
      'Call `read_manual` with `page: "desktop/layout"` when you need the full tiling layout reference.',
    ],
    parameters: layoutSchema,
    async execute(_toolCallId, params) {
      const input = params as LayoutParams;

      switch (input.action) {
        case 'focus_direction': {
          const direction = requireValue(
            input.direction,
            'direction is required for action="focus_direction"',
          );
          const commandResult = await sendAiCommand({
            action: input.action,
            args: { direction },
          });
          if (!commandResult.ok)
            throw new Error(commandResult.error ?? 'Failed to change focused window');
          const result = { ok: true, action: input.action, direction };
          return { content: [{ type: 'text', text: stringify(result) }], details: result };
        }
        case 'swap': {
          const direction = requireValue(
            input.direction,
            'direction is required for action="swap"',
          );
          const commandResult = await sendAiCommand({
            action: input.action,
            args: { direction },
          });
          if (!commandResult.ok) throw new Error(commandResult.error ?? 'Failed to swap windows');
          const result = { ok: true, action: input.action, direction };
          return { content: [{ type: 'text', text: stringify(result) }], details: result };
        }
        case 'resize': {
          const delta = requireValue(input.delta, 'delta is required for action="resize"');
          const commandResult = await sendAiCommand({
            action: input.action,
            args: { delta },
          });
          if (!commandResult.ok)
            throw new Error(commandResult.error ?? 'Failed to resize focused split');
          const result = { ok: true, action: input.action, delta };
          return { content: [{ type: 'text', text: stringify(result) }], details: result };
        }
        case 'rotate': {
          const commandResult = await sendAiCommand({ action: input.action });
          if (!commandResult.ok)
            throw new Error(commandResult.error ?? 'Failed to rotate focused split');
          const result = { ok: true, action: input.action };
          return { content: [{ type: 'text', text: stringify(result) }], details: result };
        }
        case 'equalize': {
          const commandResult = await sendAiCommand({ action: input.action });
          if (!commandResult.ok)
            throw new Error(commandResult.error ?? 'Failed to equalize focused split');
          const result = { ok: true, action: input.action };
          return { content: [{ type: 'text', text: stringify(result) }], details: result };
        }
        case 'split_mode': {
          const mode = requireValue(input.mode, 'mode is required for action="split_mode"');
          const commandResult = await sendAiCommand({
            action: input.action,
            args: { mode },
          });
          if (!commandResult.ok)
            throw new Error(commandResult.error ?? 'Failed to update split mode');
          const result = { ok: true, action: input.action, mode };
          return { content: [{ type: 'text', text: stringify(result) }], details: result };
        }
        default:
          throw new Error(`Unsupported layout action: ${String(input.action)}`);
      }
    },
  };
}
