import React, { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { ActionDefinition, ActionHandler } from '../types/actions.js';

/**
 * Context used by ActionsProvider to collect actions from child <Action> components.
 */
interface ActionsContextValue {
  register(action: ActionDefinition): void;
  unregister(name: string): void;
}

const ActionsContext = createContext<ActionsContextValue | null>(null);

/**
 * Wraps MiniApp content and collects <Action> declarations from children.
 * When the window is focused, registered actions appear in the global Actions Bar.
 */
export function ActionsProvider({ children }: { children: ReactNode }) {
  const actionsRef = useRef<Map<string, ActionDefinition>>(new Map());

  const contextValue: ActionsContextValue = {
    register(action: ActionDefinition) {
      actionsRef.current.set(action.name, action);
      // Notify the core shell that actions have changed
      window.dispatchEvent(
        new CustomEvent('desktalk:actions-changed', {
          detail: Array.from(actionsRef.current.values()),
        }),
      );
    },
    unregister(name: string) {
      actionsRef.current.delete(name);
      window.dispatchEvent(
        new CustomEvent('desktalk:actions-changed', {
          detail: Array.from(actionsRef.current.values()),
        }),
      );
    },
  };

  return React.createElement(ActionsContext.Provider, { value: contextValue }, children);
}

/**
 * Declares an action that appears in the Actions Bar and can be invoked by the AI.
 *
 * Usage:
 * ```tsx
 * <ActionsProvider>
 *   <Action
 *     name="Create Note"
 *     description="Create a new note"
 *     handler={async (params) => { ... }}
 *   />
 *   <NoteEditor />
 * </ActionsProvider>
 * ```
 */
export function Action({
  name,
  description,
  params,
  handler,
}: {
  name: string;
  description: string;
  params?: ActionDefinition['params'];
  handler: ActionHandler;
}) {
  const ctx = useContext(ActionsContext);

  useEffect(() => {
    if (!ctx) return;

    ctx.register({ name, description, params, handler });
    return () => {
      ctx.unregister(name);
    };
  }, [ctx, name, description, params, handler]);

  return null;
}
