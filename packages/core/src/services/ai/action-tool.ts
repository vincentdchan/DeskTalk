import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import type { WindowManagerService } from '../window-manager';

const actionSchema = Type.Object({
  name: Type.String({ description: 'The action name to invoke (from the Desktop Context block)' }),
  params: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description: 'JSON parameters to pass to the action handler',
    }),
  ),
  windowId: Type.Optional(
    Type.String({ description: 'Target window ID. Defaults to the focused window.' }),
  ),
});

type ActionParams = {
  name: string;
  params?: Record<string, unknown>;
  windowId?: string;
};

interface ActionToolOptions {
  windowManager: WindowManagerService;
  invokeAction: (
    windowId: string,
    actionName: string,
    actionParams?: Record<string, unknown>,
  ) => Promise<unknown>;
}

export function createActionTool(options: ActionToolOptions): ToolDefinition {
  const { windowManager, invokeAction } = options;

  return {
    name: 'action',
    label: 'Invoke Action',
    description:
      'Invoke a MiniApp action by name with JSON parameters. Available actions and their parameter schemas are listed in the [Desktop Context] block of each user message.',
    promptSnippet:
      'Invoke a MiniApp action on a DeskTalk window. See [Desktop Context] for available actions.',
    promptGuidelines: [
      'Read the [Desktop Context] block in the user message to see available actions and their params.',
      'Provide all required params as a JSON object.',
      'If windowId is omitted, the action runs on the focused window.',
      'Call `read_manual` with `page: "desktop/actions"` when you need the full action-invocation workflow.',
    ],
    parameters: actionSchema,
    async execute(_toolCallId, params) {
      const input = params as ActionParams;

      // Resolve target window — default to focused
      const targetWindowId = input.windowId ?? windowManager.getFocusedWindow()?.id;
      if (!targetWindowId) {
        throw new Error('No target window: provide windowId or ensure a window is focused.');
      }

      // Validate that the action exists on the target window
      const actions = windowManager.getWindowActions(targetWindowId);
      const actionDef = actions.find((a) => a.name === input.name);
      if (!actionDef) {
        const available = actions.map((a) => a.name).join(', ') || 'none';
        throw new Error(
          `Action "${input.name}" not found on window ${targetWindowId}. Available: ${available}`,
        );
      }

      const result = await invokeAction(targetWindowId, input.name, input.params);
      const payload = {
        ok: true,
        windowId: targetWindowId,
        action: input.name,
        result,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        details: payload,
      };
    },
  };
}
