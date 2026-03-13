/**
 * Definition for an action that the AI can invoke.
 */
export interface ActionDefinition {
  /** Unique name for the action */
  name: string;
  /** Human-readable description shown in the Actions Bar and to the AI */
  description: string;
  /** JSON Schema-like parameter description for the AI */
  params?: Record<string, ActionParam>;
  /** The handler function executed when the action is invoked */
  handler: ActionHandler;
}

export interface ActionParam {
  type: 'string' | 'number' | 'boolean';
  description?: string;
  required?: boolean;
}

export type ActionHandler = (params?: Record<string, unknown>) => Promise<unknown>;
