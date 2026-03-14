import { StringEnum } from '@mariozechner/pi-ai';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import type { MiniAppManifest } from '@desktalk/sdk';
import type { WindowManagerService } from '../window-manager.js';

const windowControlSchema = Type.Object({
  action: StringEnum(['list', 'focus', 'minimize', 'maximize', 'close', 'open', 'invoke_action']),
  windowId: Type.Optional(Type.String({ description: 'Target window ID for window operations' })),
  miniAppId: Type.Optional(Type.String({ description: 'MiniApp ID to open in a new window' })),
  actionName: Type.Optional(Type.String({ description: 'Registered action name to invoke' })),
  actionParams: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description: 'Optional params passed to the MiniApp action handler',
    }),
  ),
});

type WindowControlParams = {
  action: 'list' | 'focus' | 'minimize' | 'maximize' | 'close' | 'open' | 'invoke_action';
  windowId?: string;
  miniAppId?: string;
  actionName?: string;
  actionParams?: Record<string, unknown>;
};

interface WindowToolOptions {
  windowManager: WindowManagerService;
  getMiniApps: () => MiniAppManifest[];
  activateMiniApp: (miniAppId: string) => void;
  invokeAction: (
    windowId: string,
    actionName: string,
    actionParams?: Record<string, unknown>,
  ) => Promise<unknown>;
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

function requireWindow(windowManager: WindowManagerService, windowId: string) {
  const targetWindow = windowManager.getSnapshot().windows.find((window) => window.id === windowId);
  if (!targetWindow) {
    throw new Error(`Unknown window: ${windowId}`);
  }
  return targetWindow;
}

export function createWindowControlTool(options: WindowToolOptions): ToolDefinition {
  const { windowManager, getMiniApps, activateMiniApp, invokeAction } = options;

  return {
    name: 'window_control',
    label: 'Window Control',
    description:
      'Manage DeskTalk desktop windows: list windows, open MiniApps, focus windows, minimize, maximize, close, and invoke registered MiniApp actions.',
    promptSnippet:
      'Manage DeskTalk windows and invoke actions on the focused or selected MiniApp window.',
    promptGuidelines: [
      'Use action="list" first when you need the latest window IDs or available MiniApp actions.',
      'Use action="invoke_action" only after you know the target windowId and actionName.',
    ],
    parameters: windowControlSchema,
    async execute(_toolCallId, params) {
      const input = params as WindowControlParams;

      switch (input.action) {
        case 'list': {
          const snapshot = windowManager.getSnapshot();
          const payload = {
            windows: snapshot.windows,
            focusedWindowActions: snapshot.focusedWindowActions,
            availableMiniApps: getMiniApps().map((miniApp) => ({
              id: miniApp.id,
              name: miniApp.name,
            })),
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
          const manifest = getMiniApps().find((miniApp) => miniApp.id === miniAppId);
          if (!manifest) {
            throw new Error(`Unknown MiniApp: ${miniAppId}`);
          }
          activateMiniApp(miniAppId);
          const windowId = windowManager.openWindow(miniAppId, manifest.name);
          const result = {
            ok: true,
            action: input.action,
            windowId,
            miniAppId,
            title: manifest.name,
          };
          return {
            content: [{ type: 'text', text: stringify(result) }],
            details: result,
          };
        }
        case 'focus': {
          const windowId = requireValue(input.windowId, 'windowId is required for action="focus"');
          requireWindow(windowManager, windowId);
          windowManager.focusWindow(windowId);
          const result = { ok: true, action: input.action, windowId };
          return {
            content: [{ type: 'text', text: stringify(result) }],
            details: result,
          };
        }
        case 'minimize': {
          const windowId = requireValue(
            input.windowId,
            'windowId is required for action="minimize"',
          );
          requireWindow(windowManager, windowId);
          windowManager.minimizeWindow(windowId);
          const result = { ok: true, action: input.action, windowId };
          return {
            content: [{ type: 'text', text: stringify(result) }],
            details: result,
          };
        }
        case 'maximize': {
          const windowId = requireValue(
            input.windowId,
            'windowId is required for action="maximize"',
          );
          requireWindow(windowManager, windowId);
          windowManager.maximizeWindow(windowId);
          const result = { ok: true, action: input.action, windowId };
          return {
            content: [{ type: 'text', text: stringify(result) }],
            details: result,
          };
        }
        case 'close': {
          const windowId = requireValue(input.windowId, 'windowId is required for action="close"');
          requireWindow(windowManager, windowId);
          windowManager.closeWindow(windowId);
          const result = { ok: true, action: input.action, windowId };
          return {
            content: [{ type: 'text', text: stringify(result) }],
            details: result,
          };
        }
        case 'invoke_action': {
          const windowId = requireValue(
            input.windowId,
            'windowId is required for action="invoke_action"',
          );
          const actionName = requireValue(
            input.actionName,
            'actionName is required for action="invoke_action"',
          );
          requireWindow(windowManager, windowId);
          const result = await invokeAction(windowId, actionName, input.actionParams);
          const payload = {
            ok: true,
            action: input.action,
            windowId,
            actionName,
            result,
          };
          return {
            content: [{ type: 'text', text: stringify(payload) }],
            details: payload,
          };
        }
        default:
          throw new Error(`Unsupported window action: ${String(input.action)}`);
      }
    },
  };
}
