import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { ActionDefinition, ActionHandler } from '../types/actions';

/**
 * Context used by ActionsProvider to collect actions from child <Action> components.
 */
interface ActionsContextValue {
  register(action: ActionDefinition): void;
  unregister(name: string): void;
}

const ActionsContext = createContext<ActionsContextValue | null>(null);
const WindowIdContext = createContext<string | null>(null);

export function WindowIdProvider({
  windowId,
  children,
}: {
  windowId: string;
  children: ReactNode;
}) {
  return <WindowIdContext.Provider value={windowId}>{children}</WindowIdContext.Provider>;
}

/**
 * Hook to read the current window ID from context.
 */
export function useWindowId(): string {
  const id = useContext(WindowIdContext);
  if (!id) {
    throw new Error('useWindowId must be used inside a <WindowIdProvider>');
  }
  return id;
}

function emitActionsChanged(windowId: string, actions: ActionDefinition[]): void {
  window.dispatchEvent(
    new CustomEvent('desktalk:actions-changed', {
      detail: { windowId, actions },
    }),
  );
}

/**
 * Wraps MiniApp content and collects <Action> declarations from children.
 * When the window is focused, registered actions appear in the global Actions Bar.
 */
export function ActionsProvider({ children }: { children: ReactNode }) {
  const actionsRef = useRef<Map<string, ActionDefinition>>(new Map());
  const windowId = useContext(WindowIdContext);

  const contextValue = useMemo<ActionsContextValue>(() => {
    return {
      register(action: ActionDefinition) {
        actionsRef.current.set(action.name, action);
        if (windowId) {
          emitActionsChanged(windowId, Array.from(actionsRef.current.values()));
        }
      },
      unregister(name: string) {
        actionsRef.current.delete(name);
        if (windowId) {
          emitActionsChanged(windowId, Array.from(actionsRef.current.values()));
        }
      },
    };
  }, [windowId]);

  useEffect(() => {
    if (!windowId) return;
    emitActionsChanged(windowId, Array.from(actionsRef.current.values()));
    return () => {
      emitActionsChanged(windowId, []);
    };
  }, [windowId]);

  return <ActionsContext.Provider value={contextValue}>{children}</ActionsContext.Provider>;
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
