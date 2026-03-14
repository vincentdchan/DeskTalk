import { StringEnum } from '@mariozechner/pi-ai';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import type { MiniAppManifest } from '@desktalk/sdk';
import type { WindowManagerService } from '../window-manager.js';
import type { SendAiCommand } from './window-tools.js';

const appControlSchema = Type.Object({
  action: StringEnum(['list', 'launch', 'quit']),
  miniAppId: Type.Optional(Type.String({ description: 'MiniApp ID to launch or quit' })),
});

type AppControlParams = {
  action: 'list' | 'launch' | 'quit';
  miniAppId?: string;
};

interface AppToolOptions {
  windowManager: WindowManagerService;
  getMiniApps: () => MiniAppManifest[];
  activateMiniApp: (miniAppId: string) => void;
  deactivateMiniApp: (miniAppId: string) => void;
  isActivated: (miniAppId: string) => boolean;
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

export function createAppControlTool(options: AppToolOptions): ToolDefinition {
  const {
    windowManager,
    getMiniApps,
    activateMiniApp,
    deactivateMiniApp,
    isActivated,
    sendAiCommand,
  } = options;

  return {
    name: 'app_control',
    label: 'App Control',
    description:
      'Manage DeskTalk MiniApp lifecycle: list all available apps with their status, launch an app, or quit an app (closes all its windows and deactivates it).',
    promptSnippet:
      'Manage MiniApp lifecycle — list installed apps, launch them, or quit running apps.',
    promptGuidelines: [
      'Use action="list" to see all available apps and whether they are running.',
      'Use action="launch" to start a MiniApp — this activates it and opens a window.',
      'Use action="quit" to stop a MiniApp — this closes all its windows and deactivates it.',
      'Prefer app_control for app lifecycle; use window_control for spatial window operations (focus, minimize, maximize, move).',
    ],
    parameters: appControlSchema,
    async execute(_toolCallId, params) {
      const input = params as AppControlParams;

      switch (input.action) {
        case 'list': {
          const manifests = getMiniApps();
          const windows = windowManager.getWindows();

          const apps = manifests.map((manifest) => {
            const appWindows = windows.filter((w) => w.miniAppId === manifest.id);
            return {
              id: manifest.id,
              name: manifest.name,
              activated: isActivated(manifest.id),
              windowCount: appWindows.length,
              windowIds: appWindows.map((w) => w.id),
            };
          });

          const payload = { apps };
          return {
            content: [{ type: 'text', text: stringify(payload) }],
            details: payload,
          };
        }

        case 'launch': {
          const miniAppId = requireValue(
            input.miniAppId,
            'miniAppId is required for action="launch"',
          );
          const manifest = getMiniApps().find((m) => m.id === miniAppId);
          if (!manifest) {
            throw new Error(`Unknown MiniApp: ${miniAppId}`);
          }

          activateMiniApp(miniAppId);

          const commandResult = await sendAiCommand({
            action: 'open',
            miniAppId,
            title: manifest.name,
          });
          if (!commandResult.ok) {
            throw new Error(commandResult.error ?? 'Failed to launch app');
          }

          const result = {
            ok: true,
            action: input.action,
            miniAppId,
            name: manifest.name,
            windowId: commandResult.windowId,
          };
          return {
            content: [{ type: 'text', text: stringify(result) }],
            details: result,
          };
        }

        case 'quit': {
          const miniAppId = requireValue(
            input.miniAppId,
            'miniAppId is required for action="quit"',
          );
          const manifest = getMiniApps().find((m) => m.id === miniAppId);
          if (!manifest) {
            throw new Error(`Unknown MiniApp: ${miniAppId}`);
          }

          // Close all windows belonging to this miniapp
          const windows = windowManager.getWindows();
          const appWindows = windows.filter((w) => w.miniAppId === miniAppId);
          const closeResults: Array<{ windowId: string; ok: boolean; error?: string }> = [];

          for (const win of appWindows) {
            const commandResult = await sendAiCommand({ action: 'close', windowId: win.id });
            closeResults.push({
              windowId: win.id,
              ok: commandResult.ok,
              error: commandResult.error,
            });
          }

          // Deactivate the miniapp backend
          deactivateMiniApp(miniAppId);

          const failedCloses = closeResults.filter((r) => !r.ok);
          const result = {
            ok: failedCloses.length === 0,
            action: input.action,
            miniAppId,
            name: manifest.name,
            windowsClosed: closeResults.length,
            ...(failedCloses.length > 0 ? { failedCloses } : {}),
          };
          return {
            content: [{ type: 'text', text: stringify(result) }],
            details: result,
          };
        }

        default:
          throw new Error(`Unsupported app action: ${String(input.action)}`);
      }
    },
  };
}
