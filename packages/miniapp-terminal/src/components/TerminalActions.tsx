import React, { useCallback } from 'react';
import { ActionsProvider, Action, useCommand } from '@desktalk/sdk';
import type { TerminalTab } from '../types';

interface TerminalActionsProps {
  children: React.ReactNode;
  tabs: TerminalTab[];
  activeTabId: string | null;
  onTabCreated: (tabId: string) => void;
  onTabClosed: (tabId: string) => void;
  onTabFocused: (tabId: string) => void;
}

export function TerminalActions({
  children,
  tabs,
  activeTabId,
  onTabCreated,
  onTabClosed,
  onTabFocused,
}: TerminalActionsProps) {
  const createTab = useCommand<{ label?: string; cwd?: string }, { tabId: string }>(
    'terminal.create',
  );
  const closeTab = useCommand<{ tabId: string }, void>('terminal.close');
  const listTabs = useCommand<void, TerminalTab[]>('terminal.list');
  const execute = useCommand<
    { tabId: string; command: string },
    { accepted: boolean; reason?: string }
  >('terminal.execute');
  const getOutput = useCommand<{ tabId: string; lines?: number }, { output: string }>(
    'terminal.getOutput',
  );

  // ─── List Tabs ──────────────────────────────────────────────────────────

  const handleListTabs = useCallback(async () => {
    const result = await listTabs();
    return result;
  }, [listTabs]);

  // ─── Create Tab ─────────────────────────────────────────────────────────

  const handleCreateTab = useCallback(
    async (params?: Record<string, unknown>) => {
      const label = (params?.label as string) || undefined;
      const cwd = (params?.cwd as string) || undefined;
      const result = await createTab({ label, cwd });
      onTabCreated(result.tabId);
      return result;
    },
    [createTab, onTabCreated],
  );

  // ─── Close Tab ──────────────────────────────────────────────────────────

  const handleCloseTab = useCallback(
    async (params?: Record<string, unknown>) => {
      const tabId = (params?.tabId as string) || '';
      if (!tabId) return;
      await closeTab({ tabId });
      onTabClosed(tabId);
    },
    [closeTab, onTabClosed],
  );

  // ─── Focus Tab ──────────────────────────────────────────────────────────

  const handleFocusTab = useCallback(
    async (params?: Record<string, unknown>) => {
      const tabId = (params?.tabId as string) || '';
      if (!tabId) return;
      onTabFocused(tabId);
    },
    [onTabFocused],
  );

  // ─── Execute ────────────────────────────────────────────────────────────

  const handleExecute = useCallback(
    async (params?: Record<string, unknown>) => {
      const command = (params?.command as string) || '';
      if (!command) return;
      const tabId = (params?.tabId as string) || activeTabId;
      if (!tabId) return;
      const result = await execute({ tabId, command });
      return result;
    },
    [execute, activeTabId],
  );

  // ─── Get Output ─────────────────────────────────────────────────────────

  const handleGetOutput = useCallback(
    async (params?: Record<string, unknown>) => {
      const tabId = (params?.tabId as string) || activeTabId;
      if (!tabId) return;
      const lines = (params?.lines as number) || 50;
      const result = await getOutput({ tabId, lines });
      return result;
    },
    [getOutput, activeTabId],
  );

  return (
    <ActionsProvider>
      <Action
        name="List Tabs"
        description="List all open terminal tabs with their IDs and labels"
        params={{}}
        handler={handleListTabs}
      />
      <Action
        name="Create Tab"
        description="Open a new terminal tab and make it active"
        params={{
          label: { type: 'string', description: 'Tab label', required: false },
          cwd: { type: 'string', description: 'Working directory', required: false },
        }}
        handler={handleCreateTab}
      />
      <Action
        name="Close Tab"
        description="Close a terminal tab by ID"
        params={{
          tabId: { type: 'string', description: 'Tab ID to close', required: true },
        }}
        handler={handleCloseTab}
      />
      <Action
        name="Focus Tab"
        description="Switch the viewport to a specific tab"
        params={{
          tabId: { type: 'string', description: 'Tab ID to focus', required: true },
        }}
        handler={handleFocusTab}
      />
      <Action
        name="Execute"
        description="Send a command string to the terminal for execution"
        params={{
          command: { type: 'string', description: 'Bash command to execute', required: true },
          tabId: { type: 'string', description: 'Target tab ID', required: false },
        }}
        handler={handleExecute}
      />
      <Action
        name="Get Output"
        description="Return recent terminal output from a tab"
        params={{
          tabId: { type: 'string', description: 'Tab ID', required: false },
          lines: { type: 'number', description: 'Number of lines to return', required: false },
        }}
        handler={handleGetOutput}
      />
      {tabs.length === 0 && null}
      {children}
    </ActionsProvider>
  );
}
