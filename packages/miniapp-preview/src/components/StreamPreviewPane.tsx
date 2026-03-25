import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useCommand, useEvent, useWindowId } from '@desktalk/sdk';
import type {
  PreviewActionState,
  PreviewBridgeActionDefinition,
  PreviewBridgeActionsRequest,
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
  StreamedHtmlSnapshot,
} from '../types';
import { injectDtRuntime, type PreviewThemeRuntime } from '../html-injections';
import { HtmlViewport, type HtmlViewportHandle } from './HtmlViewport';
import { PreviewToolbar } from './PreviewToolbar';
import { BridgeConfirmDialog } from './BridgeConfirmDialog';
import { getStreamedDirectoryName } from '../liveapp-id';
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
  onLiveAppActionsChange: (actions: PreviewBridgeActionDefinition[]) => void;
  onLiveAppActionInvokerChange: (
    invoker: ((actionName: string, params?: Record<string, unknown>) => Promise<unknown>) | null,
  ) => void;
}

export function StreamPreviewPane({
  streamId,
  streamTitle,
  bridgeToken,
  theme,
  onActionStateChange,
  onLiveAppActionsChange,
  onLiveAppActionInvokerChange,
}: StreamPreviewPaneProps) {
  const windowId = useWindowId();
  const viewportRef = useRef<HtmlViewportHandle | null>(null);
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
  const storageBridgeCommand = useCommand<PreviewBridgeStoragePayload, PreviewBridgeStorageResult>(
    'preview.bridge.storage',
  );
  const requestBridgeCommand = useCommand<PreviewBridgeRequestPayload, PreviewBridgeRequestResult>(
    'preview.bridge.request',
  );
  const liveAppId = getStreamedDirectoryName(streamId, streamTitle);

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

    clearLiveAppActions();
    rejectPendingActionInvocations('LiveApp reloaded before the action completed.');
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

    clearLiveAppActions();
    rejectPendingActionInvocations('LiveApp reloaded before the action completed.');
    setStreaming(false);
    const htmlToSave = typeof data.html === 'string' ? data.html : streamHtmlRef.current;
    void saveStreamedHtml({
      streamId,
      title: streamTitle,
      content: htmlToSave,
    })
      .then(setStreamSnapshot)
      .catch((saveError) => {
        console.error('Failed to save LiveApp HTML:', saveError);
      });
  });

  useEffect(() => {
    let cancelled = false;

    void loadStreamedHtml({ streamId, title: streamTitle })
      .then((snapshot) => {
        if (cancelled || !snapshot) {
          return;
        }
        clearLiveAppActions();
        rejectPendingActionInvocations('LiveApp reloaded before the action completed.');
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
          console.error('Failed to load LiveApp HTML snapshot:', loadError);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bridgeToken, loadStreamedHtml, streamId, streamTitle, theme]);

  useEffect(() => {
    if (!bridgeToken) {
      onLiveAppActionInvokerChange(null);
      onLiveAppActionsChange([]);
      return;
    }

    void registerBridgeSession({ streamId, token: bridgeToken }).catch((error) => {
      console.error('Failed to register preview bridge session:', error);
    });
  }, [
    bridgeToken,
    onLiveAppActionInvokerChange,
    onLiveAppActionsChange,
    registerBridgeSession,
    streamId,
  ]);

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

  const invokeLiveAppAction = useCallback(
    (actionName: string, params?: Record<string, unknown>) => {
      if (!bridgeToken) {
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
          streamId,
          token: bridgeToken,
          requestId,
          actionName,
          params: params ?? null,
        });
      });
    },
    [bridgeToken, streamId],
  );

  useEffect(() => {
    if (!bridgeToken) {
      return;
    }

    onLiveAppActionInvokerChange(invokeLiveAppAction);
    return () => {
      onLiveAppActionInvokerChange(null);
    };
  }, [bridgeToken, invokeLiveAppAction, onLiveAppActionInvokerChange]);

  useEffect(() => {
    return () => {
      rejectPendingActionInvocations('LiveApp action invocation was interrupted.');
      clearLiveAppActions();
      onLiveAppActionInvokerChange(null);
    };
  }, [clearLiveAppActions, onLiveAppActionInvokerChange, rejectPendingActionInvocations]);

  const handleInvokeActionResult = useCallback(
    (message: PreviewInvokeActionResultMessage) => {
      if (!bridgeToken || message.streamId !== streamId || message.token !== bridgeToken) {
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
    [bridgeToken, streamId],
  );

  const handleViewportLoad = useCallback(() => {
    if (!bridgeToken) {
      return;
    }

    clearLiveAppActions();
    rejectPendingActionInvocations('LiveApp reloaded before the action completed.');
  }, [bridgeToken, clearLiveAppActions, rejectPendingActionInvocations]);

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

      if (request.kind === 'storage') {
        void storageBridgeCommand({
          streamId,
          token: bridgeToken,
          liveAppId,
          request: request.payload as PreviewBridgeStoragePayload['request'],
        })
          .then((result) => {
            reply({ ok: true, result });
          })
          .catch((error) => {
            reply({ ok: false, error: (error as Error).message });
          });
        return;
      }

      if (request.kind === 'request') {
        void requestBridgeCommand({
          streamId,
          token: bridgeToken,
          request: request.payload as PreviewBridgeRequestPayload['request'],
        })
          .then((result) => {
            reply({ ok: true, result });
          })
          .catch((error) => {
            reply({ ok: false, error: (error as Error).message });
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
    [
      bridgeToken,
      execBridgeCommand,
      liveAppId,
      pendingBridgeConfirm,
      requestBridgeCommand,
      publishLiveAppActions,
      clearLiveAppActions,
      resolveBridgeState,
      storageBridgeCommand,
      streamId,
    ],
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
          throw new Error('Saved LiveApp HTML file was not found.');
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
        console.error('Failed to refresh LiveApp HTML from file:', loadError);
      });
  }, [bridgeToken, loadStreamedHtml, streamId, streamTitle, theme]);

  return (
    <>
      <PreviewToolbar
        filename={streamTitle}
        filepath={streamSnapshot?.path}
        mode="stream"
        streaming={streaming}
        onRefreshFromFile={!streaming && streamSnapshot ? handleRefreshFromFile : undefined}
      />
      <HtmlViewport
        ref={viewportRef}
        html={streamHtml}
        streaming={streaming}
        onBridgeRequest={respondToBridgeRequest}
        onInvokeActionResult={handleInvokeActionResult}
        onLoad={handleViewportLoad}
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
