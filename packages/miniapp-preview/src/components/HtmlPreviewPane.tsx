import React, { useCallback, useEffect, useState } from 'react';
import { useCommand, useEvent, useWindowId } from '@desktalk/sdk';
import type {
  HtmlPreviewFile,
  PreviewActionState,
  PreviewBridgeConfirmPayload,
  PreviewBridgeExecPayload,
  PreviewBridgeExecResponse,
  PreviewBridgeGetStatePayload,
  PreviewBridgeRequestMessage,
  PreviewBridgeResponseMessage,
  PreviewBridgeStoragePayload,
  PreviewBridgeStorageResult,
} from '../types';
import { HtmlViewport } from './HtmlViewport';
import { PreviewToolbar } from './PreviewToolbar';
import { injectDtRuntime, type PreviewThemeRuntime } from '../html-injections';
import { isLiveAppPath, matchesPreviewFilePath } from '../preview-paths';
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
  const [htmlFile, setHtmlFile] = useState<HtmlPreviewFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingBridgeConfirm, setPendingBridgeConfirm] = useState<{
    confirmationRequestId: string;
    bridgeRequestId: string;
    commandPreview: string;
    cwd: string;
    reason: string;
    respond: (response: PreviewBridgeResponseMessage) => void;
  } | null>(null);
  const openHtmlFile = useCommand<{ path: string }, HtmlPreviewFile>('preview.open-html');
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

  const shouldInjectRuntime = Boolean(liveAppId && bridgeToken && isLiveAppPath(initialPath));

  const applyRuntime = useCallback(
    (file: HtmlPreviewFile): HtmlPreviewFile => ({
      ...file,
      content:
        shouldInjectRuntime && liveAppId && bridgeToken
          ? injectDtRuntime(file.content, {
              theme,
              streamId: liveAppId,
              bridgeToken,
            })
          : file.content,
    }),
    [bridgeToken, liveAppId, shouldInjectRuntime, theme],
  );

  useEvent<{ filePath: string; content: string }>('preview.file-changed', (data) => {
    if (!matchesPreviewFilePath(data.filePath, htmlFile?.path ?? initialPath)) {
      return;
    }

    setHtmlFile((currentFile) =>
      currentFile
        ? applyRuntime({
            ...currentFile,
            content: data.content,
          })
        : currentFile,
    );
  });

  useEffect(() => {
    if (!initialPath) {
      return;
    }

    openHtmlFile({ path: initialPath })
      .then((file) => setHtmlFile(applyRuntime(file)))
      .catch((err) => setError(String(err)));
  }, [applyRuntime, initialPath, openHtmlFile]);

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
            title: htmlFile?.name ?? initialPath ?? null,
            path: htmlFile?.path ?? initialPath ?? null,
          };
        default:
          throw new Error(`Unsupported DeskTalk bridge selector: ${String(payload.selector)}`);
      }
    },
    [htmlFile?.name, htmlFile?.path, initialPath, liveAppId, windowId],
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
      resolveBridgeState,
      storageBridgeCommand,
      shouldInjectRuntime,
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

  useEffect(() => {
    onActionStateChange({
      mode: 'html',
      streaming: false,
      file: htmlFile
        ? {
            name: htmlFile.name,
            path: htmlFile.path,
            kind: 'html',
          }
        : null,
    });
  }, [htmlFile, onActionStateChange]);

  if (htmlFile) {
    return (
      <>
        <PreviewToolbar filename={htmlFile.name} filepath={htmlFile.path} mode="html" />
        <HtmlViewport
          html={htmlFile.content}
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

  if (error) {
    return (
      <div className={styles.errorState}>
        <span className={styles.errorIcon}>{'\u26A0'}</span>
        <span>{error}</span>
      </div>
    );
  }

  return <div className={styles.emptyState}>Loading HTML...</div>;
}
