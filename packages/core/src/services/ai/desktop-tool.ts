import { StringEnum } from '@mariozechner/pi-ai';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import type { MiniAppManifest } from '@desktalk/sdk';
import type { WindowManagerService } from '../window-manager';

export type SendAiCommand = (command: {
  action: string;
  windowId?: string;
  miniAppId?: string;
  title?: string;
  args?: Record<string, unknown>;
}) => Promise<{ ok: boolean; windowId?: string; error?: string }>;

const desktopSchema = Type.Object({
  action: StringEnum(['list', 'focus', 'maximize', 'close', 'open']),
  windowId: Type.Optional(Type.String({ description: 'Target window ID' })),
  miniAppId: Type.Optional(Type.String({ description: 'MiniApp ID to open' })),
  args: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description: 'Optional launch arguments forwarded to the MiniApp frontend on open',
    }),
  ),
});

type DesktopParams = {
  action: 'list' | 'focus' | 'maximize' | 'close' | 'open';
  windowId?: string;
  miniAppId?: string;
  args?: Record<string, unknown>;
};

interface DesktopToolOptions {
  windowManager: WindowManagerService;
  getMiniApps: () => MiniAppManifest[];
  getLiveApps: () => Array<{ id: string; name: string }>;
  activateMiniApp: (miniAppId: string) => void;
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

export function createDesktopTool(options: DesktopToolOptions): ToolDefinition {
  const { windowManager, getMiniApps, getLiveApps, activateMiniApp, sendAiCommand } = options;

  return {
    name: 'desktop',
    label: 'Desktop',
    description:
      'Manage DeskTalk windows: list open windows, open MiniApps, focus, maximize, or close windows.',
    promptSnippet: 'Manage DeskTalk desktop windows (list, open, focus, maximize, close).',
    promptGuidelines: [
      'Use action="list" to get the latest window IDs and desktop state.',
      'Use action="open" with miniAppId to launch a MiniApp. Pass args to provide initial context (e.g. { path: "photos/cat.png" } for Preview). If a window with the same miniAppId and shallow-equal args already exists, it will be focused instead of opening a duplicate.',
      'Call `read_manual` with `page: "desktop/windows"` when you need the full DeskTalk window-management reference.',
    ],
    parameters: desktopSchema,
    async execute(_toolCallId, params) {
      const input = params as DesktopParams;

      switch (input.action) {
        case 'list': {
          const windows = windowManager.getWindows();
          const focusedWindow = windowManager.getFocusedWindow();
          const focusedWindowActions = focusedWindow
            ? windowManager.getWindowActions(focusedWindow.id)
            : [];
          const payload = {
            windows,
            focusedWindowActions,
            availableMiniApps: getMiniApps().map((m) => ({ id: m.id, name: m.name })),
            availableLiveApps: getLiveApps(),
          };
          return {
            content: [{ type: 'text', text: stringify(payload) }],
            details: payload,
          };
        }
        case 'open': {
          const miniAppId = requireValue(
            input.miniAppId,
            'miniAppId is required for action="open"',
          );
          const manifest = getMiniApps().find((m) => m.id === miniAppId);
          if (!manifest) throw new Error(`Unknown MiniApp: ${miniAppId}`);
          activateMiniApp(miniAppId);
          const commandResult = await sendAiCommand({
            action: 'open',
            miniAppId,
            title: manifest.name,
            args: input.args,
          });
          if (!commandResult.ok) throw new Error(commandResult.error ?? 'Failed to open window');
          const result = {
            ok: true,
            action: input.action,
            windowId: commandResult.windowId,
            miniAppId,
            title: manifest.name,
          };
          return { content: [{ type: 'text', text: stringify(result) }], details: result };
        }
        case 'focus': {
          const windowId = requireValue(input.windowId, 'windowId is required for action="focus"');
          const commandResult = await sendAiCommand({ action: 'focus', windowId });
          if (!commandResult.ok) throw new Error(commandResult.error ?? 'Failed to focus window');
          const result = { ok: true, action: input.action, windowId };
          return { content: [{ type: 'text', text: stringify(result) }], details: result };
        }
        case 'maximize': {
          const windowId = requireValue(
            input.windowId,
            'windowId is required for action="maximize"',
          );
          const commandResult = await sendAiCommand({ action: 'maximize', windowId });
          if (!commandResult.ok)
            throw new Error(commandResult.error ?? 'Failed to maximize window');
          const result = { ok: true, action: input.action, windowId };
          return { content: [{ type: 'text', text: stringify(result) }], details: result };
        }
        case 'close': {
          const windowId = requireValue(input.windowId, 'windowId is required for action="close"');
          const commandResult = await sendAiCommand({ action: 'close', windowId });
          if (!commandResult.ok) throw new Error(commandResult.error ?? 'Failed to close window');
          const result = { ok: true, action: input.action, windowId };
          return { content: [{ type: 'text', text: stringify(result) }], details: result };
        }
        default:
          throw new Error(`Unsupported desktop action: ${String(input.action)}`);
      }
    },
  };
}
