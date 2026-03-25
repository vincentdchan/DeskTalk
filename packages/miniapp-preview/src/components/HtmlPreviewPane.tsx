import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useCommand, useEvent, useOpenMiniApp, useWindowId } from '@desktalk/sdk';
import type {
  PreviewActionState,
  PreviewBridgeConfirmPayload,
  PreviewBridgeExecPayload,
  PreviewBridgeExecResponse,
  PreviewBridgeGetStatePayload,
  PreviewBridgeRequestPayload,
  PreviewBridgeRequestResult,
  PreviewBridgeRequestMessage,
  PreviewBridgeResponseMessage,
  PreviewBridgeStoragePayload,
  PreviewBridgeStorageResult,
} from '../types';
import { HtmlViewport } from './HtmlViewport';
import { PreviewToolbar } from './PreviewToolbar';
import type { PreviewThemeRuntime } from '../html-injections';
import { isLiveAppPath, matchesPreviewFilePath, normalizePreviewPath } from '../preview-paths';
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

function buildDtfsUrl(
  path: string,
  options?: {
    streamId?: string;
    token?: string;
    accentColor?: string;
    theme?: 'light' | 'dark';
    cacheBust?: string;
  },
): string {
  const normalized = normalizePreviewPath(path) ?? path;
  const encodedPath = normalized
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const params = new URLSearchParams();

  if (options?.streamId) params.set('streamId', options.streamId);
  if (options?.token) params.set('token', options.token);
  if (options?.accentColor) params.set('accent', options.accentColor);
  if (options?.theme) params.set('theme', options.theme);
  if (options?.cacheBust) params.set('t', options.cacheBust);

  const query = params.toString();
  return query ? `/@dtfs/${encodedPath}?${query}` : `/@dtfs/${encodedPath}`;
}

interface HtmlPreviewPaneProps {
  initialPath?: string;
  liveAppId?: string;
  bridgeToken?: string;
  theme: PreviewThemeRuntime;
  onActionStateChange: (state: PreviewActionState) => void;
}

export function HtmlPreviewPane({
  initialPath,
  liveAppId,
  bridgeToken,
  theme,
  onActionStateChange,
}: HtmlPreviewPaneProps) {
  const windowId = useWindowId();
  const openMiniApp = useOpenMiniApp();
  const [reloadKey, setReloadKey] = useState(0);
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

  const normalizedPath = normalizePreviewPath(initialPath);
  const fileName = useMemo(() => getFileName(initialPath), [initialPath]);
  const shouldInjectRuntime = Boolean(liveAppId && bridgeToken && isLiveAppPath(initialPath));
  const canEditLiveAppSource = Boolean(shouldInjectRuntime && normalizedPath);

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
          onEditSource={canEditLiveAppSource ? handleEditSource : undefined}
        />
        <HtmlViewport
          src={iframeSrc}
          onBridgeRequest={shouldInjectRuntime ? respondToBridgeRequest : undefined}
        />
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
