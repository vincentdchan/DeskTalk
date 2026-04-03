import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCommand, useEvent, useOpenMiniApp, useWindowId } from '@desktalk/sdk';
import type {
  PreviewActionState,
  PreviewBridgeActionDefinition,
  PreviewBridgeActionsRequest,
  PreviewBridgeConfirmPayload,
  PreviewBridgeExecPayload,
  PreviewBridgeExecResponse,
  PreviewBridgeGetStatePayload,
  PreviewBridgeRequestPayload,
  PreviewBridgeRequestResult,
  PreviewInvokeActionResultMessage,
  PreviewBridgeRequestMessage,
  PreviewBridgeResponseMessage,
  PreviewBridgeStoragePayload,
  PreviewBridgeStorageResult,
  PreviewHistoryEntry,
} from '../types';
import { HtmlViewport, type HtmlViewportHandle } from './HtmlViewport';
import { HistoryDialog } from './HistoryDialog';
import { PreviewToolbar } from './PreviewToolbar';
import type { PreviewThemeRuntime } from '../html-injections';
import {
  buildDtfsUrl,
  isLiveAppPath,
  matchesPreviewFilePath,
  normalizePreviewPath,
} from '../preview-paths';
import { BridgeConfirmDialog } from './BridgeConfirmDialog';
import styles from './HtmlPreviewPane.module.css';

function requestCoreBridgeState(selector: PreviewBridgeGetStatePayload['selector']): unknown {
  let result: unknown;
  let error: Error | null = null;
  let resolved = false;

  window.dispatchEvent(
    new CustomEvent('desktalk:bridge:get-state', {
      detail: {
        selector,
        resolve: (value: unknown) => {
          resolved = true;
          result = value;
        },
        reject: (message: string) => {
          error = new Error(message);
        },
      },
    }),
  );

  if (error) {
    throw error;
  }

  if (!resolved) {
    throw new Error('DeskTalk core state bridge is unavailable.');
  }

  return result;
}

function getFileName(path: string | undefined): string | null {
  const normalized = normalizePreviewPath(path);
  if (!normalized) {
    return null;
  }

  const parts = normalized.split('/').filter(Boolean);
  return parts.at(-1) ?? normalized;
}

interface HtmlPreviewPaneProps {
  initialPath?: string;
  liveAppId?: string;
  bridgeToken?: string;
  theme: PreviewThemeRuntime;
  onActionStateChange: (state: PreviewActionState) => void;
  onLiveAppActionsChange: (actions: PreviewBridgeActionDefinition[]) => void;
  onLiveAppActionInvokerChange: (
    invoker: ((actionName: string, params?: Record<string, unknown>) => Promise<unknown>) | null,
  ) => void;
}

export function HtmlPreviewPane({
  initialPath,
  liveAppId,
  bridgeToken,
  theme,
  onActionStateChange,
  onLiveAppActionsChange,
  onLiveAppActionInvokerChange,
}: HtmlPreviewPaneProps) {
  const windowId = useWindowId();
  const openMiniApp = useOpenMiniApp();
  const viewportRef = useRef<HtmlViewportHandle | null>(null);
  const liveAppActionsRef = useRef<Map<string, PreviewBridgeActionDefinition>>(new Map());
  const pendingActionInvocationsRef = useRef<
    Map<
      string,
      {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timeout: ReturnType<typeof setTimeout>;
      }
    >
  >(new Map());
  const [reloadKey, setReloadKey] = useState(0);
  const [historyEntries, setHistoryEntries] = useState<PreviewHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoringHistoryHash, setRestoringHistoryHash] = useState<string | null>(null);
  const [pendingBridgeConfirm, setPendingBridgeConfirm] = useState<{
    confirmationRequestId: string;
    bridgeRequestId: string;
    commandPreview: string;
    cwd: string;
    reason: string;
    respond: (response: PreviewBridgeResponseMessage) => void;
  } | null>(null);
  const registerBridgeSession = useCommand<{ streamId: string; token: string }, void>(
    'preview.bridge.registerSession',
  );
  const execBridgeCommand = useCommand<PreviewBridgeExecPayload, PreviewBridgeExecResponse>(
    'preview.bridge.exec',
  );
  const confirmBridgeCommand = useCommand<PreviewBridgeConfirmPayload, PreviewBridgeExecResponse>(
    'preview.bridge.exec.confirm',
  );
  const storageBridgeCommand = useCommand<PreviewBridgeStoragePayload, PreviewBridgeStorageResult>(
    'preview.bridge.storage',
  );
  const requestBridgeCommand = useCommand<PreviewBridgeRequestPayload, PreviewBridgeRequestResult>(
    'preview.bridge.request',
  );
  const listHistory = useCommand<{ path: string }, PreviewHistoryEntry[]>('preview.history.list');
  const restoreHistory = useCommand<{ path: string; commitHash: string }, { content: string }>(
    'preview.history.restore',
  );

  const normalizedPath = normalizePreviewPath(initialPath);
  const fileName = useMemo(() => getFileName(initialPath), [initialPath]);
  const shouldInjectRuntime = Boolean(liveAppId && bridgeToken && isLiveAppPath(initialPath));
  const canEditLiveAppSource = Boolean(shouldInjectRuntime && normalizedPath);

  const publishLiveAppActions = useCallback(() => {
    onLiveAppActionsChange(Array.from(liveAppActionsRef.current.values()));
  }, [onLiveAppActionsChange]);

  const rejectPendingActionInvocations = useCallback((message: string) => {
    for (const pending of pendingActionInvocationsRef.current.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    pendingActionInvocationsRef.current.clear();
  }, []);

  const clearLiveAppActions = useCallback(() => {
    liveAppActionsRef.current.clear();
    publishLiveAppActions();
  }, [publishLiveAppActions]);

  const iframeSrc = useMemo(() => {
    if (!normalizedPath) {
      return null;
    }

    return buildDtfsUrl(normalizedPath, {
      streamId: shouldInjectRuntime ? liveAppId : undefined,
      token: shouldInjectRuntime ? bridgeToken : undefined,
      accentColor: shouldInjectRuntime ? theme.accentColor : undefined,
      theme: shouldInjectRuntime ? theme.mode : undefined,
      cacheBust: reloadKey > 0 ? String(reloadKey) : undefined,
    });
  }, [bridgeToken, liveAppId, normalizedPath, reloadKey, shouldInjectRuntime, theme]);

  useEvent<{ filePath: string; content: string }>('preview.file-changed', (data) => {
    if (!matchesPreviewFilePath(data.filePath, normalizedPath)) {
      return;
    }

    clearLiveAppActions();
    rejectPendingActionInvocations('LiveApp reloaded before the action completed.');
    setReloadKey(Date.now());
  });

  useEffect(() => {
    if (!shouldInjectRuntime || !liveAppId || !bridgeToken) {
      return;
    }

    void registerBridgeSession({ streamId: liveAppId, token: bridgeToken }).catch(
      (registerError) => {
        console.error('Failed to register preview bridge session:', registerError);
      },
    );
  }, [bridgeToken, liveAppId, registerBridgeSession, shouldInjectRuntime]);

  const resolveBridgeState = useCallback(
    (payload: PreviewBridgeGetStatePayload): unknown => {
      switch (payload.selector) {
        case 'desktop.summary':
        case 'desktop.windows':
        case 'desktop.focusedWindow':
        case 'theme.current':
          return requestCoreBridgeState(payload.selector);
        case 'preview.context':
          return {
            windowId,
            mode: 'html',
            liveAppId,
            title: fileName,
            path: normalizedPath,
          };
        default:
          throw new Error(`Unsupported DeskTalk bridge selector: ${String(payload.selector)}`);
      }
    },
    [fileName, liveAppId, normalizedPath, windowId],
  );

  const invokeLiveAppAction = useCallback(
    (actionName: string, params?: Record<string, unknown>) => {
      if (!shouldInjectRuntime || !liveAppId || !bridgeToken) {
        return Promise.reject(new Error('DeskTalk LiveApp actions are unavailable.'));
      }

      if (!viewportRef.current) {
        return Promise.reject(new Error('LiveApp viewport is not ready.'));
      }

      const requestId = `liveapp-action-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      return new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingActionInvocationsRef.current.delete(requestId);
          reject(new Error(`LiveApp action "${actionName}" timed out.`));
        }, 10000);

        pendingActionInvocationsRef.current.set(requestId, { resolve, reject, timeout });
        viewportRef.current?.postInvokeAction({
          type: 'desktalk:invoke-action',
          streamId: liveAppId,
          token: bridgeToken,
          requestId,
          actionName,
          params: params ?? null,
        });
      });
    },
    [bridgeToken, liveAppId, shouldInjectRuntime],
  );

  useEffect(() => {
    if (!shouldInjectRuntime) {
      onLiveAppActionInvokerChange(null);
      onLiveAppActionsChange([]);
      return;
    }

    onLiveAppActionInvokerChange(invokeLiveAppAction);
    return () => {
      onLiveAppActionInvokerChange(null);
    };
  }, [
    invokeLiveAppAction,
    onLiveAppActionInvokerChange,
    onLiveAppActionsChange,
    shouldInjectRuntime,
  ]);

  useEffect(() => {
    return () => {
      rejectPendingActionInvocations('LiveApp action invocation was interrupted.');
      clearLiveAppActions();
      onLiveAppActionInvokerChange(null);
    };
  }, [clearLiveAppActions, onLiveAppActionInvokerChange, rejectPendingActionInvocations]);

  const handleInvokeActionResult = useCallback(
    (message: PreviewInvokeActionResultMessage) => {
      if (!shouldInjectRuntime || message.streamId !== liveAppId || message.token !== bridgeToken) {
        return;
      }

      const pending = pendingActionInvocationsRef.current.get(message.requestId);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeout);
      pendingActionInvocationsRef.current.delete(message.requestId);

      if (message.ok) {
        pending.resolve(message.result);
        return;
      }

      pending.reject(new Error(message.error || 'LiveApp action failed.'));
    },
    [bridgeToken, liveAppId, shouldInjectRuntime],
  );

  const handleViewportLoad = useCallback(() => {
    if (!shouldInjectRuntime) {
      return;
    }

    clearLiveAppActions();
    rejectPendingActionInvocations('LiveApp reloaded before the action completed.');
  }, [clearLiveAppActions, rejectPendingActionInvocations, shouldInjectRuntime]);

  const respondToBridgeRequest = useCallback(
    (
      request: PreviewBridgeRequestMessage,
      respond: (response: PreviewBridgeResponseMessage) => void,
    ) => {
      const reply = (
        payload: Omit<PreviewBridgeResponseMessage, 'type' | 'streamId' | 'token' | 'requestId'>,
      ) => {
        respond({
          type: 'desktalk:bridge-response',
          streamId: request.streamId,
          token: request.token,
          requestId: request.requestId,
          ...payload,
        });
      };

      if (!shouldInjectRuntime || !liveAppId || !bridgeToken) {
        reply({ ok: false, error: 'DeskTalk bridge is only available for LiveApps.' });
        return;
      }

      if (request.streamId !== liveAppId || request.token !== bridgeToken) {
        reply({ ok: false, error: 'DeskTalk bridge token mismatch.' });
        return;
      }

      if (request.kind === 'getState') {
        try {
          reply({
            ok: true,
            result: resolveBridgeState(request.payload as PreviewBridgeGetStatePayload),
          });
        } catch (bridgeError) {
          reply({ ok: false, error: (bridgeError as Error).message });
        }
        return;
      }

      if (request.kind === 'storage') {
        void storageBridgeCommand({
          streamId: liveAppId,
          token: bridgeToken,
          liveAppId,
          request: request.payload as PreviewBridgeStoragePayload['request'],
        })
          .then((result) => {
            reply({ ok: true, result });
          })
          .catch((bridgeError) => {
            reply({ ok: false, error: (bridgeError as Error).message });
          });
        return;
      }

      if (request.kind === 'request') {
        void requestBridgeCommand({
          streamId: liveAppId,
          token: bridgeToken,
          request: request.payload as PreviewBridgeRequestPayload['request'],
        })
          .then((result) => {
            reply({ ok: true, result });
          })
          .catch((bridgeError) => {
            reply({ ok: false, error: (bridgeError as Error).message });
          });
        return;
      }

      if (request.kind === 'actions') {
        const payload = request.payload as PreviewBridgeActionsRequest;

        if (payload.action === 'register') {
          liveAppActionsRef.current.set(payload.name, {
            name: payload.name,
            description: payload.description,
            params: payload.params,
          });
          publishLiveAppActions();
          reply({ ok: true, result: { ok: true } });
          return;
        }

        if (payload.action === 'unregister') {
          liveAppActionsRef.current.delete(payload.name);
          publishLiveAppActions();
          reply({ ok: true, result: { ok: true } });
          return;
        }

        if (payload.action === 'clear') {
          clearLiveAppActions();
          reply({ ok: true, result: { ok: true } });
          return;
        }

        reply({ ok: false, error: 'Unsupported DeskTalk actions request.' });
        return;
      }

      if (request.kind !== 'exec') {
        reply({ ok: false, error: `Unsupported DeskTalk bridge request: ${request.kind}` });
        return;
      }

      if (pendingBridgeConfirm) {
        reply({ ok: false, error: 'A command confirmation is already waiting for user input.' });
        return;
      }

      void execBridgeCommand({
        ...(request.payload as Omit<PreviewBridgeExecPayload, 'streamId' | 'token'>),
        streamId: liveAppId,
        token: bridgeToken,
      })
        .then((result) => {
          if (result.status === 'completed') {
            reply({ ok: true, result: result.result });
            return;
          }

          if (result.status === 'requires_confirmation') {
            setPendingBridgeConfirm({
              confirmationRequestId: result.requestId,
              bridgeRequestId: request.requestId,
              commandPreview: result.commandPreview,
              cwd: result.cwd,
              reason: result.reason,
              respond,
            });
            return;
          }

          reply({ ok: false, error: result.reason });
        })
        .catch((bridgeError) => {
          reply({ ok: false, error: (bridgeError as Error).message });
        });
    },
    [
      bridgeToken,
      execBridgeCommand,
      liveAppId,
      pendingBridgeConfirm,
      requestBridgeCommand,
      publishLiveAppActions,
      clearLiveAppActions,
      resolveBridgeState,
      shouldInjectRuntime,
      storageBridgeCommand,
    ],
  );

  const handleBridgeConfirmation = useCallback(
    async (confirmed: boolean) => {
      if (!pendingBridgeConfirm || !bridgeToken || !liveAppId) {
        return;
      }

      const respond = pendingBridgeConfirm.respond;
      const requestId = pendingBridgeConfirm.bridgeRequestId;
      const confirmationRequestId = pendingBridgeConfirm.confirmationRequestId;
      setPendingBridgeConfirm(null);

      try {
        const result = await confirmBridgeCommand({
          requestId: confirmationRequestId,
          confirmed,
        });

        respond({
          type: 'desktalk:bridge-response',
          streamId: liveAppId,
          token: bridgeToken,
          requestId,
          ok: result.status === 'completed',
          result: result.status === 'completed' ? result.result : undefined,
          error: result.status === 'completed' ? undefined : result.reason,
        });
      } catch (bridgeError) {
        respond({
          type: 'desktalk:bridge-response',
          streamId: liveAppId,
          token: bridgeToken,
          requestId,
          ok: false,
          error: (bridgeError as Error).message,
        });
      }
    },
    [bridgeToken, confirmBridgeCommand, liveAppId, pendingBridgeConfirm],
  );

  const handleEditSource = useCallback(() => {
    if (!normalizedPath || !shouldInjectRuntime) {
      return;
    }

    openMiniApp('text-edit', { path: normalizedPath });
  }, [normalizedPath, openMiniApp, shouldInjectRuntime]);

  const handleShowHistory = useCallback(() => {
    if (!normalizedPath || !canEditLiveAppSource) {
      return;
    }

    void listHistory({ path: normalizedPath })
      .then((entries) => {
        setHistoryEntries(entries);
        setHistoryOpen(true);
      })
      .catch((historyError) => {
        console.error('Failed to load preview history:', historyError);
      });
  }, [canEditLiveAppSource, listHistory, normalizedPath]);

  const handleRestoreHistory = useCallback(
    (entry: PreviewHistoryEntry) => {
      if (!normalizedPath || !fileName) {
        return;
      }

      const confirmed = window.confirm(
        `Restore ${fileName} to this version?\n\n${entry.message}\n${new Date(entry.date).toLocaleString()}`,
      );
      if (!confirmed) {
        return;
      }

      setRestoringHistoryHash(entry.hash);
      void restoreHistory({ path: normalizedPath, commitHash: entry.hash })
        .then(() => {
          setHistoryOpen(false);
        })
        .catch((historyError) => {
          console.error('Failed to restore preview history:', historyError);
        })
        .finally(() => {
          setRestoringHistoryHash(null);
        });
    },
    [fileName, normalizedPath, restoreHistory],
  );

  useEffect(() => {
    onActionStateChange({
      mode: 'html',
      streaming: false,
      file:
        normalizedPath && fileName
          ? {
              name: fileName,
              path: normalizedPath,
              kind: 'html',
            }
          : null,
    });
  }, [fileName, normalizedPath, onActionStateChange]);

  if (iframeSrc && fileName) {
    return (
      <>
        <PreviewToolbar
          filename={fileName}
          filepath={normalizedPath ?? undefined}
          mode="html"
          onShowHistory={canEditLiveAppSource ? handleShowHistory : undefined}
          onEditSource={canEditLiveAppSource ? handleEditSource : undefined}
        />
        <HtmlViewport
          ref={viewportRef}
          src={iframeSrc}
          theme={theme}
          onBridgeRequest={shouldInjectRuntime ? respondToBridgeRequest : undefined}
          onInvokeActionResult={shouldInjectRuntime ? handleInvokeActionResult : undefined}
          onLoad={shouldInjectRuntime ? handleViewportLoad : undefined}
        />
        {historyOpen ? (
          <HistoryDialog
            entries={historyEntries}
            restoringHash={restoringHistoryHash}
            onRestore={handleRestoreHistory}
            onClose={() => {
              if (!restoringHistoryHash) {
                setHistoryOpen(false);
              }
            }}
          />
        ) : null}
        {pendingBridgeConfirm ? (
          <BridgeConfirmDialog
            command={pendingBridgeConfirm.commandPreview}
            cwd={pendingBridgeConfirm.cwd}
            risk={pendingBridgeConfirm.reason}
            onConfirm={() => {
              void handleBridgeConfirmation(true);
            }}
            onCancel={() => {
              void handleBridgeConfirmation(false);
            }}
          />
        ) : null}
      </>
    );
  }

  return <div className={styles.emptyState}>Loading HTML...</div>;
}
