import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type { MiniAppFrontendContext } from '@desktalk/sdk';
import { useCommand, useEvent, MiniAppIdProvider, WindowIdProvider } from '@desktalk/sdk';
import type { TerminalTab, TerminalConfirmEvent } from './types';
import { TerminalTabBar } from './components/TerminalTabBar';
import { TerminalContainer } from './components/TerminalContainer';
import { SafetyConfirmDialog } from './components/SafetyConfirmDialog';
import { TerminalActions } from './components/TerminalActions';
import styles from './TerminalApp.module.css';

// Import xterm.js CSS
import '@xterm/xterm/css/xterm.css';

interface PendingConfirm {
  requestId: string;
  command: string;
  risk: string;
  tabId: string;
}

function TerminalApp() {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const createTab = useCommand<{ label?: string; cwd?: string }, { tabId: string }>(
    'terminal.create',
  );
  const closeTab = useCommand<{ tabId: string }, void>('terminal.close');
  const listTabs = useCommand<void, TerminalTab[]>('terminal.list');
  const confirmResponse = useCommand<{ requestId: string; confirmed: boolean }, void>(
    'terminal.confirmResponse',
  );

  // ─── Data fetching ───────────────────────────────────────────────────────

  const fetchTabs = useCallback(async () => {
    try {
      const result = await listTabs();
      setTabs(result);
    } catch (err) {
      console.error('Failed to fetch tabs:', err);
    }
  }, [listTabs]);

  // Create initial tab on mount
  const initRef = React.useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const init = async () => {
      try {
        const result = await createTab({});
        setActiveTabId(result.tabId);
        await fetchTabs();
      } catch (err) {
        console.error('Failed to create initial tab:', err);
      }
    };
    init();
  }, [createTab, fetchTabs]);

  // ─── Tab actions ──────────────────────────────────────────────────────────

  const handleNewTab = useCallback(async () => {
    try {
      const result = await createTab({});
      setActiveTabId(result.tabId);
      await fetchTabs();
    } catch (err) {
      console.error('Failed to create tab:', err);
    }
  }, [createTab, fetchTabs]);

  const handleCloseTab = useCallback(
    async (tabId: string) => {
      try {
        await closeTab({ tabId });
        setTabs((prev) => {
          const remaining = prev.filter((t) => t.tabId !== tabId);
          if (activeTabId === tabId) {
            setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].tabId : null);
          }
          return remaining;
        });
      } catch (err) {
        console.error('Failed to close tab:', err);
      }
    },
    [closeTab, activeTabId],
  );

  const handleSelectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  // ─── Safety confirmation ──────────────────────────────────────────────────

  useEvent<TerminalConfirmEvent>('terminal.confirm', (event) => {
    setPendingConfirm({
      requestId: event.requestId,
      command: event.command,
      risk: event.risk,
      tabId: event.tabId,
    });
  });

  const handleConfirm = useCallback(async () => {
    if (!pendingConfirm) return;
    try {
      await confirmResponse({ requestId: pendingConfirm.requestId, confirmed: true });
    } catch (err) {
      console.error('Failed to send confirm response:', err);
    }
    setPendingConfirm(null);
  }, [confirmResponse, pendingConfirm]);

  const handleCancel = useCallback(async () => {
    if (!pendingConfirm) return;
    try {
      await confirmResponse({ requestId: pendingConfirm.requestId, confirmed: false });
    } catch (err) {
      console.error('Failed to send cancel response:', err);
    }
    setPendingConfirm(null);
  }, [confirmResponse, pendingConfirm]);

  // ─── Action callbacks ─────────────────────────────────────────────────────

  const handleActionTabCreated = useCallback(
    (tabId: string) => {
      setActiveTabId(tabId);
      fetchTabs();
    },
    [fetchTabs],
  );

  const handleActionTabClosed = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.tabId !== tabId);
        if (activeTabId === tabId) {
          setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].tabId : null);
        }
        return remaining;
      });
    },
    [activeTabId],
  );

  const handleActionTabFocused = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  const tabIds = tabs.map((t) => t.tabId);

  return (
    <TerminalActions
      activeTabId={activeTabId}
      onTabCreated={handleActionTabCreated}
      onTabClosed={handleActionTabClosed}
      onTabFocused={handleActionTabFocused}
    >
      <div className={styles.root}>
        <TerminalTabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onNewTab={handleNewTab}
        />
        <TerminalContainer tabIds={tabIds} activeTabId={activeTabId} />
        {pendingConfirm && (
          <SafetyConfirmDialog
            command={pendingConfirm.command}
            risk={pendingConfirm.risk}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        )}
      </div>
    </TerminalActions>
  );
}

let root: ReturnType<typeof createRoot> | null = null;

export function activate(ctx: MiniAppFrontendContext): void {
  root = createRoot(ctx.root);
  root.render(
    <WindowIdProvider windowId={ctx.windowId}>
      <MiniAppIdProvider miniAppId={ctx.miniAppId}>
        <TerminalApp />
      </MiniAppIdProvider>
    </WindowIdProvider>,
  );
}

export function deactivate(): void {
  root?.unmount();
  root = null;
}
