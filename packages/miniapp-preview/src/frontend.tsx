import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { MiniAppFrontendActivation, MiniAppFrontendContext } from '@desktalk/sdk';
import { useCommand, useEvent, MiniAppIdProvider, WindowIdProvider } from '@desktalk/sdk';
import { useWindowId } from '@desktalk/sdk';
import type {
  PreviewFile,
  HtmlPreviewFile,
  StreamedHtmlSnapshot,
  PreviewMode,
  PreviewActionState,
  SiblingList,
  PreviewBridgeExecPayload,
  PreviewBridgeExecResponse,
  PreviewBridgeGetStatePayload,
  PreviewBridgeRequestMessage,
  PreviewBridgeResponseMessage,
} from './types';
import { PreviewToolbar } from './components/PreviewToolbar';
import { ImageViewport } from './components/ImageViewport';
import { HtmlViewport } from './components/HtmlViewport';
import { PreviewActions } from './components/PreviewActions';
import { BridgeConfirmDialog } from './components/BridgeConfirmDialog';
import { injectDtRuntime, type PreviewThemeRuntime } from './html-injections';
import styles from './PreviewApp.module.css';

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

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

// ─── Mode detection ──────────────────────────────────────────────────────────

function detectMode(args?: Record<string, unknown>): PreviewMode {
  if (args?.streamId && typeof args.streamId === 'string') return 'stream';
  if (typeof args?.path === 'string') {
    const ext = args.path.toLowerCase();
    if (ext.endsWith('.html') || ext.endsWith('.htm')) return 'html';
  }
  return 'image';
}

function normalizePreviewPath(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }

  return path.replace(/\\/g, '/');
}

function matchesPreviewFilePath(
  changedPath: string,
  currentPath: string | null | undefined,
): boolean {
  const normalizedChangedPath = normalizePreviewPath(changedPath);
  const normalizedCurrentPath = normalizePreviewPath(currentPath);

  if (!normalizedChangedPath || !normalizedCurrentPath) {
    return false;
  }

  return (
    normalizedChangedPath === normalizedCurrentPath ||
    normalizedChangedPath.endsWith(`/${normalizedCurrentPath}`)
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

function PreviewApp({
  initialPath,
  mode,
  streamId,
  streamTitle,
  bridgeToken,
  theme,
}: {
  initialPath?: string;
  mode: PreviewMode;
  streamId?: string;
  streamTitle?: string;
  bridgeToken?: string;
  theme: PreviewThemeRuntime;
}) {
  const windowId = useWindowId();
  // ─── Image-mode state ───────────────────────────────────────────────────
  const [currentFile, setCurrentFile] = useState<PreviewFile | null>(null);
  const [siblings, setSiblings] = useState<SiblingList | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // ─── HTML-file mode state ───────────────────────────────────────────────
  const [htmlFile, setHtmlFile] = useState<HtmlPreviewFile | null>(null);

  // ─── Stream mode state ──────────────────────────────────────────────────
  const [streamHtml, setStreamHtml] = useState('');
  const [streaming, setStreaming] = useState(mode === 'stream');
  const [streamSnapshot, setStreamSnapshot] = useState<StreamedHtmlSnapshot | null>(null);
  const [pendingBridgeConfirm, setPendingBridgeConfirm] = useState<{
    confirmationRequestId: string;
    bridgeRequestId: string;
    commandPreview: string;
    cwd: string;
    reason: string;
    respond: (response: PreviewBridgeResponseMessage) => void;
  } | null>(null);

  // ─── Backend commands ───────────────────────────────────────────────────
  const openFile = useCommand<{ path: string }, PreviewFile>('preview.open');
  const openHtmlFile = useCommand<{ path: string }, HtmlPreviewFile>('preview.open-html');
  const loadStreamedHtml = useCommand<
    { streamId: string; title: string },
    StreamedHtmlSnapshot | null
  >('preview.stream.load-html');
  const saveStreamedHtml = useCommand<
    { streamId: string; title: string; content: string },
    StreamedHtmlSnapshot
  >('preview.stream.save-html');
  const getSiblings = useCommand<{ path: string }, SiblingList>('preview.siblings');
  const nextFile = useCommand<{ currentPath: string }, PreviewFile>('preview.next');
  const previousFile = useCommand<{ currentPath: string }, PreviewFile>('preview.previous');
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

  const streamHtmlRef = useRef(streamHtml);

  useEffect(() => {
    streamHtmlRef.current = streamHtml;
  }, [streamHtml]);

  useEvent<{ filePath: string; content: string }>('preview.file-changed', (data) => {
    if (mode === 'stream' && matchesPreviewFilePath(data.filePath, streamSnapshot?.path)) {
      const nextHtml =
        streamId && bridgeToken
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
      return;
    }

    if (mode === 'html' && matchesPreviewFilePath(data.filePath, htmlFile?.path ?? initialPath)) {
      setHtmlFile((currentFile) =>
        currentFile
          ? {
              ...currentFile,
              content: data.content,
            }
          : currentFile,
      );
    }
  });

  // ─── Stream event listeners ─────────────────────────────────────────────

  useEvent<{ streamId: string; chunk: string }>('preview.html-chunk', (data) => {
    if (mode !== 'stream' || data.streamId !== streamId) return;
    setStreamHtml((prev) => {
      const next = prev + data.chunk;
      streamHtmlRef.current = next;
      return next;
    });
  });

  useEvent<{ streamId: string; html?: string }>('preview.html-done', (data) => {
    if (mode !== 'stream' || data.streamId !== streamId) return;
    setStreaming(false);
    if (!streamId || !streamTitle) {
      return;
    }
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

  // ─── Load file on mount ─────────────────────────────────────────────────

  const handleFileOpened = useCallback(
    (file: PreviewFile) => {
      setError(null);
      setCurrentFile(file);
      setZoom(1);
      getSiblings({ path: file.path }).then(setSiblings).catch(console.error);
    },
    [getSiblings],
  );

  useEffect(() => {
    if (!initialPath) return;

    if (mode === 'html') {
      openHtmlFile({ path: initialPath })
        .then(setHtmlFile)
        .catch((err) => setError(String(err)));
    } else if (mode === 'image') {
      openFile({ path: initialPath }).then(handleFileOpened).catch(console.error);
    }
    // Stream mode doesn't load a file — it waits for events
  }, []);

  useEffect(() => {
    if (mode !== 'stream' || !streamId || !streamTitle) {
      return;
    }

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
  }, [bridgeToken, loadStreamedHtml, mode, streamId, streamTitle, theme]);

  useEffect(() => {
    if (mode !== 'stream' || !streamId || !bridgeToken) {
      return;
    }

    void registerBridgeSession({ streamId, token: bridgeToken }).catch((error) => {
      console.error('Failed to register preview bridge session:', error);
    });
  }, [bridgeToken, mode, registerBridgeSession, streamId]);

  // ─── Zoom controls (image mode only) ───────────────────────────────────

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  }, []);

  const handleFitToWindow = useCallback(() => {
    if (!currentFile || !viewportRef.current) {
      setZoom(1);
      return;
    }
    const container = viewportRef.current;
    const rect = container.getBoundingClientRect();
    const scaleX = rect.width / currentFile.width;
    const scaleY = rect.height / currentFile.height;
    setZoom(Math.min(scaleX, scaleY, 1));
  }, [currentFile]);

  const handleActualSize = useCallback(() => {
    setZoom(1);
  }, []);

  const handleZoomChange = useCallback((newZoom: number) => {
    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom)));
  }, []);

  // ─── Pan (from actions) ─────────────────────────────────────────────────

  const handlePan = useCallback((direction: string) => {
    const container = document.querySelector('[data-preview-viewport]');
    if (container) {
      const el = container as HTMLDivElement & { panInDirection?: (d: string) => void };
      el.panInDirection?.(direction);
    }
  }, []);

  // ─── Navigation (image mode) ────────────────────────────────────────────

  const handleNext = useCallback(async () => {
    if (!currentFile) return;
    try {
      const file = await nextFile({ currentPath: currentFile.path });
      setCurrentFile(file);
      setZoom(1);
      const sibs = await getSiblings({ path: file.path });
      setSiblings(sibs);
    } catch (err) {
      console.error('Failed to load next file:', err);
    }
  }, [currentFile, nextFile, getSiblings]);

  const handlePrevious = useCallback(async () => {
    if (!currentFile) return;
    try {
      const file = await previousFile({ currentPath: currentFile.path });
      setCurrentFile(file);
      setZoom(1);
      const sibs = await getSiblings({ path: file.path });
      setSiblings(sibs);
    } catch (err) {
      console.error('Failed to load previous file:', err);
    }
  }, [currentFile, previousFile, getSiblings]);

  // ─── Keyboard shortcuts (image mode only) ──────────────────────────────

  useEffect(() => {
    if (mode !== 'image') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
          e.preventDefault();
          handleFitToWindow();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, handleZoomIn, handleZoomOut, handleFitToWindow]);

  // ─── Derived state ─────────────────────────────────────────────────────

  const canGoPrev = siblings !== null && siblings.files.length > 1;
  const canGoNext = siblings !== null && siblings.files.length > 1;
  const zoomPercent = Math.round(zoom * 100);

  // ─── Determine display title ───────────────────────────────────────────

  const displayTitle =
    mode === 'stream'
      ? (streamTitle ?? 'HTML Preview')
      : mode === 'html'
        ? (htmlFile?.name ?? 'Loading...')
        : (currentFile?.name ?? '');

  const previewActionState: PreviewActionState =
    mode === 'image'
      ? {
          mode,
          streaming: false,
          file: currentFile
            ? {
                name: currentFile.name,
                path: currentFile.path,
                kind: 'image',
                mimeType: currentFile.mimeType,
              }
            : null,
        }
      : mode === 'html'
        ? {
            mode,
            streaming: false,
            file: htmlFile
              ? {
                  name: htmlFile.name,
                  path: htmlFile.path,
                  kind: 'html',
                }
              : null,
          }
        : {
            mode,
            streaming,
            file: {
              name: streamSnapshot?.name ?? displayTitle,
              path: streamSnapshot?.path ?? null,
              kind: 'stream',
            },
          };

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
            mode,
            streamId: streamId ?? null,
            title: displayTitle,
            path: initialPath ?? null,
          };
        default:
          throw new Error(`Unsupported DeskTalk bridge selector: ${String(payload.selector)}`);
      }
    },
    [displayTitle, initialPath, mode, streamId, windowId],
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

      if (mode !== 'stream' || !streamId || !bridgeToken) {
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
    [bridgeToken, execBridgeCommand, mode, pendingBridgeConfirm, resolveBridgeState, streamId],
  );

  const handleBridgeConfirmation = useCallback(
    async (confirmed: boolean) => {
      if (!pendingBridgeConfirm || !streamId || !bridgeToken) return;

      const respond = pendingBridgeConfirm.respond;
      const requestId = pendingBridgeConfirm.bridgeRequestId;
      const token = bridgeToken;
      const currentStreamId = streamId;
      const confirmationRequestId = pendingBridgeConfirm.confirmationRequestId;
      setPendingBridgeConfirm(null);

      try {
        const result = await confirmBridgeCommand({
          requestId: confirmationRequestId,
          confirmed,
        });

        respond({
          type: 'desktalk:bridge-response',
          streamId: currentStreamId,
          token,
          requestId,
          ok: result.status === 'completed',
          result: result.status === 'completed' ? result.result : undefined,
          error: result.status === 'completed' ? undefined : result.reason,
        });
      } catch (error) {
        respond({
          type: 'desktalk:bridge-response',
          streamId: currentStreamId,
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
    if (!streamId || !streamTitle) {
      return;
    }

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
        setError((loadError as Error).message);
      });
  }, [bridgeToken, loadStreamedHtml, streamId, streamTitle, theme]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <PreviewActions
      state={previewActionState}
      onFileOpened={handleFileOpened}
      onZoomIn={handleZoomIn}
      onZoomOut={handleZoomOut}
      onFitToWindow={handleFitToWindow}
      onActualSize={handleActualSize}
      onPan={handlePan}
      onPrevious={handlePrevious}
      onNext={handleNext}
    >
      <div className={styles.root}>
        {mode === 'image' ? (
          currentFile ? (
            <>
              <PreviewToolbar
                filename={currentFile.name}
                mode="image"
                zoomPercent={zoomPercent}
                canGoPrev={canGoPrev}
                canGoNext={canGoNext}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onFitToWindow={handleFitToWindow}
                onActualSize={handleActualSize}
                onPrevious={handlePrevious}
                onNext={handleNext}
              />
              <div
                ref={viewportRef}
                data-preview-viewport=""
                style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}
              >
                <ImageViewport
                  dataUrl={currentFile.dataUrl}
                  zoom={zoom}
                  onZoomChange={handleZoomChange}
                />
              </div>
            </>
          ) : error ? (
            <div className={styles.errorState}>
              <span className={styles.errorIcon}>{'\u26A0'}</span>
              <span>{error}</span>
            </div>
          ) : (
            <div className={styles.emptyState}>No image open</div>
          )
        ) : mode === 'html' ? (
          htmlFile ? (
            <>
              <PreviewToolbar filename={htmlFile.name} mode="html" />
              <HtmlViewport html={htmlFile.content} onBridgeRequest={respondToBridgeRequest} />
            </>
          ) : error ? (
            <div className={styles.errorState}>
              <span className={styles.errorIcon}>{'\u26A0'}</span>
              <span>{error}</span>
            </div>
          ) : (
            <div className={styles.emptyState}>Loading HTML...</div>
          )
        ) : (
          /* stream mode */
          <>
            <PreviewToolbar
              filename={displayTitle}
              mode="stream"
              streaming={streaming}
              onRefreshFromFile={!streaming && streamSnapshot ? handleRefreshFromFile : undefined}
            />
            <HtmlViewport
              html={streamHtml}
              streaming={streaming}
              onBridgeRequest={respondToBridgeRequest}
            />
          </>
        )}
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
      </div>
    </PreviewActions>
  );
}

export function activate(ctx: MiniAppFrontendContext): MiniAppFrontendActivation {
  const themedContext = ctx as MiniAppFrontendContext & { theme?: PreviewThemeRuntime };
  const mode = detectMode(ctx.args);
  const initialPath = typeof ctx.args?.path === 'string' ? ctx.args.path : undefined;
  const streamId = typeof ctx.args?.streamId === 'string' ? ctx.args.streamId : undefined;
  const streamTitle = typeof ctx.args?.title === 'string' ? ctx.args.title : undefined;
  const bridgeToken = typeof ctx.args?.bridgeToken === 'string' ? ctx.args.bridgeToken : undefined;
  const theme: PreviewThemeRuntime = {
    accentColor: themedContext.theme?.accentColor ?? '#7c6ff7',
    mode: themedContext.theme?.mode === 'light' ? 'light' : 'dark',
  };

  const root = createRoot(ctx.root);
  root.render(
    <WindowIdProvider windowId={ctx.windowId}>
      <MiniAppIdProvider miniAppId={ctx.miniAppId}>
        <PreviewApp
          initialPath={initialPath}
          mode={mode}
          streamId={streamId}
          streamTitle={streamTitle}
          bridgeToken={bridgeToken}
          theme={theme}
        />
      </MiniAppIdProvider>
    </WindowIdProvider>,
  );

  return {
    deactivate() {
      root.unmount();
    },
  };
}
