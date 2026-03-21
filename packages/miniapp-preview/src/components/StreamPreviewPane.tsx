import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useCommand, useEvent, useWindowId } from '@desktalk/sdk';
import type {
  PreviewActionState,
  PreviewBridgeExecPayload,
  PreviewBridgeExecResponse,
  PreviewBridgeGetStatePayload,
  PreviewBridgeRequestMessage,
  PreviewBridgeResponseMessage,
  StreamedHtmlSnapshot,
} from '../types';
import { injectDtRuntime, type PreviewThemeRuntime } from '../html-injections';
import { HtmlViewport } from './HtmlViewport';
import { PreviewToolbar } from './PreviewToolbar';
import { BridgeConfirmDialog } from './BridgeConfirmDialog';
import { matchesPreviewFilePath } from '../preview-paths';

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

interface StreamPreviewPaneProps {
  streamId: string;
  streamTitle: string;
  bridgeToken?: string;
  theme: PreviewThemeRuntime;
  onActionStateChange: (state: PreviewActionState) => void;
}

export function StreamPreviewPane({
  streamId,
  streamTitle,
  bridgeToken,
  theme,
  onActionStateChange,
}: StreamPreviewPaneProps) {
  const windowId = useWindowId();
  const [streamHtml, setStreamHtml] = useState('');
  const [streaming, setStreaming] = useState(true);
  const [streamSnapshot, setStreamSnapshot] = useState<StreamedHtmlSnapshot | null>(null);
  const [pendingBridgeConfirm, setPendingBridgeConfirm] = useState<{
    confirmationRequestId: string;
    bridgeRequestId: string;
    commandPreview: string;
    cwd: string;
    reason: string;
    respond: (response: PreviewBridgeResponseMessage) => void;
  } | null>(null);
  const streamHtmlRef = useRef(streamHtml);

  const loadStreamedHtml = useCommand<
    { streamId: string; title: string },
    StreamedHtmlSnapshot | null
  >('preview.stream.load-html');
  const saveStreamedHtml = useCommand<
    { streamId: string; title: string; content: string },
    StreamedHtmlSnapshot
  >('preview.stream.save-html');
  const registerBridgeSession = useCommand<{ streamId: string; token: string }, void>(
    'preview.bridge.registerSession',
  );
  const execBridgeCommand = useCommand<PreviewBridgeExecPayload, PreviewBridgeExecResponse>(
    'preview.bridge.exec',
  );
  const confirmBridgeCommand = useCommand<
    { requestId: string; confirmed: boolean },
    PreviewBridgeExecResponse
  >('preview.bridge.exec.confirm');

  useEffect(() => {
    streamHtmlRef.current = streamHtml;
  }, [streamHtml]);

  useEffect(() => {
    onActionStateChange({
      mode: 'stream',
      streaming,
      file: {
        name: streamSnapshot?.name ?? streamTitle,
        path: streamSnapshot?.path ?? null,
        kind: 'stream',
      },
    });
  }, [onActionStateChange, streamSnapshot, streamTitle, streaming]);

  useEvent<{ filePath: string; content: string }>('preview.file-changed', (data) => {
    if (!matchesPreviewFilePath(data.filePath, streamSnapshot?.path)) {
      return;
    }

    const nextHtml = bridgeToken
      ? injectDtRuntime(data.content, {
          theme,
          streamId,
          bridgeToken,
        })
      : data.content;
    setStreamHtml(nextHtml);
    streamHtmlRef.current = nextHtml;
    setStreaming(false);
    setStreamSnapshot((currentSnapshot) =>
      currentSnapshot
        ? {
            ...currentSnapshot,
            content: data.content,
          }
        : currentSnapshot,
    );
  });

  useEvent<{ streamId: string; chunk: string }>('preview.html-chunk', (data) => {
    if (data.streamId !== streamId) {
      return;
    }

    setStreamHtml((prev) => {
      const next = prev + data.chunk;
      streamHtmlRef.current = next;
      return next;
    });
  });

  useEvent<{ streamId: string; html?: string }>('preview.html-done', (data) => {
    if (data.streamId !== streamId) {
      return;
    }

    setStreaming(false);
    const htmlToSave = typeof data.html === 'string' ? data.html : streamHtmlRef.current;
    void saveStreamedHtml({
      streamId,
      title: streamTitle,
      content: htmlToSave,
    })
      .then(setStreamSnapshot)
      .catch((saveError) => {
        console.error('Failed to save streamed HTML:', saveError);
      });
  });

  useEffect(() => {
    let cancelled = false;

    void loadStreamedHtml({ streamId, title: streamTitle })
      .then((snapshot) => {
        if (cancelled || !snapshot) {
          return;
        }
        const nextHtml = bridgeToken
          ? injectDtRuntime(snapshot.content, {
              theme,
              streamId,
              bridgeToken,
            })
          : snapshot.content;
        setStreamHtml(nextHtml);
        streamHtmlRef.current = nextHtml;
        setStreamSnapshot(snapshot);
        setStreaming(false);
      })
      .catch((loadError) => {
        if (!cancelled) {
          console.error('Failed to load streamed HTML snapshot:', loadError);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bridgeToken, loadStreamedHtml, streamId, streamTitle, theme]);

  useEffect(() => {
    if (!bridgeToken) {
      return;
    }

    void registerBridgeSession({ streamId, token: bridgeToken }).catch((error) => {
      console.error('Failed to register preview bridge session:', error);
    });
  }, [bridgeToken, registerBridgeSession, streamId]);

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
            mode: 'stream',
            streamId,
            title: streamTitle,
            path: null,
          };
        default:
          throw new Error(`Unsupported DeskTalk bridge selector: ${String(payload.selector)}`);
      }
    },
    [streamId, streamTitle, windowId],
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

      if (!bridgeToken) {
        reply({
          ok: false,
          error: 'DeskTalk bridge is only available for generated HTML previews.',
        });
        return;
      }

      if (request.streamId !== streamId || request.token !== bridgeToken) {
        reply({ ok: false, error: 'DeskTalk bridge token mismatch.' });
        return;
      }

      if (request.kind === 'getState') {
        try {
          reply({
            ok: true,
            result: resolveBridgeState(request.payload as PreviewBridgeGetStatePayload),
          });
        } catch (error) {
          reply({ ok: false, error: (error as Error).message });
        }
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
        streamId,
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
        .catch((error) => {
          reply({ ok: false, error: (error as Error).message });
        });
    },
    [bridgeToken, execBridgeCommand, pendingBridgeConfirm, resolveBridgeState, streamId],
  );

  const handleBridgeConfirmation = useCallback(
    async (confirmed: boolean) => {
      if (!pendingBridgeConfirm || !bridgeToken) {
        return;
      }

      const respond = pendingBridgeConfirm.respond;
      const requestId = pendingBridgeConfirm.bridgeRequestId;
      const token = bridgeToken;
      const confirmationRequestId = pendingBridgeConfirm.confirmationRequestId;
      setPendingBridgeConfirm(null);

      try {
        const result = await confirmBridgeCommand({
          requestId: confirmationRequestId,
          confirmed,
        });

        respond({
          type: 'desktalk:bridge-response',
          streamId,
          token,
          requestId,
          ok: result.status === 'completed',
          result: result.status === 'completed' ? result.result : undefined,
          error: result.status === 'completed' ? undefined : result.reason,
        });
      } catch (error) {
        respond({
          type: 'desktalk:bridge-response',
          streamId,
          token,
          requestId,
          ok: false,
          error: (error as Error).message,
        });
      }
    },
    [bridgeToken, confirmBridgeCommand, pendingBridgeConfirm, streamId],
  );

  const handleRefreshFromFile = useCallback(() => {
    void loadStreamedHtml({ streamId, title: streamTitle })
      .then((snapshot) => {
        if (!snapshot) {
          throw new Error('Saved streamed HTML file was not found.');
        }
        const nextHtml = bridgeToken
          ? injectDtRuntime(snapshot.content, {
              theme,
              streamId,
              bridgeToken,
            })
          : snapshot.content;
        setStreamHtml(nextHtml);
        streamHtmlRef.current = nextHtml;
        setStreamSnapshot(snapshot);
      })
      .catch((loadError) => {
        console.error('Failed to refresh streamed HTML from file:', loadError);
      });
  }, [bridgeToken, loadStreamedHtml, streamId, streamTitle, theme]);

  return (
    <>
      <PreviewToolbar
        filename={streamTitle}
        mode="stream"
        streaming={streaming}
        onRefreshFromFile={!streaming && streamSnapshot ? handleRefreshFromFile : undefined}
      />
      <HtmlViewport
        html={streamHtml}
        streaming={streaming}
        onBridgeRequest={respondToBridgeRequest}
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
