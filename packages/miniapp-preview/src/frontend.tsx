import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { MiniAppFrontendActivation, MiniAppFrontendContext } from '@desktalk/sdk';
import { useCommand, MiniAppIdProvider, WindowIdProvider } from '@desktalk/sdk';
import type { PreviewFile, PreviewMode, PreviewActionState, SiblingList } from './types';
import { PreviewToolbar } from './components/PreviewToolbar';
import { ImageViewport } from './components/ImageViewport';
import { HtmlPreviewPane } from './components/HtmlPreviewPane';
import { PreviewActions } from './components/PreviewActions';
import { StreamPreviewPane } from './components/StreamPreviewPane';
import type { PreviewThemeRuntime } from './html-injections';
import styles from './PreviewApp.module.css';

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

// ─── Main component ──────────────────────────────────────────────────────────

function PreviewApp({
  initialPath,
  mode,
  liveAppId,
  streamId,
  streamTitle,
  bridgeToken,
  theme,
}: {
  initialPath?: string;
  mode: PreviewMode;
  liveAppId?: string;
  streamId?: string;
  streamTitle?: string;
  bridgeToken?: string;
  theme: PreviewThemeRuntime;
}) {
  // ─── Image-mode state ───────────────────────────────────────────────────
  const [currentFile, setCurrentFile] = useState<PreviewFile | null>(null);
  const [siblings, setSiblings] = useState<SiblingList | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [htmlActionState, setHtmlActionState] = useState<PreviewActionState>({
    mode: 'html',
    streaming: false,
    file: null,
  });
  const [streamActionState, setStreamActionState] = useState<PreviewActionState>({
    mode: 'stream',
    streaming: mode === 'stream',
    file: streamTitle
      ? {
          name: streamTitle,
          path: null,
          kind: 'stream',
        }
      : null,
  });

  // ─── Backend commands ───────────────────────────────────────────────────
  const openFile = useCommand<{ path: string }, PreviewFile>('preview.open');
  const getSiblings = useCommand<{ path: string }, SiblingList>('preview.siblings');
  const nextFile = useCommand<{ currentPath: string }, PreviewFile>('preview.next');
  const previousFile = useCommand<{ currentPath: string }, PreviewFile>('preview.previous');

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

    if (mode === 'image') {
      openFile({ path: initialPath }).then(handleFileOpened).catch(console.error);
    }
  }, [handleFileOpened, initialPath, mode, openFile]);

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
        ? htmlActionState
        : streamActionState;

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
          <HtmlPreviewPane
            initialPath={initialPath}
            liveAppId={liveAppId}
            bridgeToken={bridgeToken}
            theme={theme}
            onActionStateChange={setHtmlActionState}
          />
        ) : (
          <StreamPreviewPane
            streamId={streamId!}
            streamTitle={streamTitle ?? 'HTML Preview'}
            bridgeToken={bridgeToken}
            theme={theme}
            onActionStateChange={setStreamActionState}
          />
        )}
      </div>
    </PreviewActions>
  );
}

export function activate(ctx: MiniAppFrontendContext): MiniAppFrontendActivation {
  const themedContext = ctx as MiniAppFrontendContext & { theme?: PreviewThemeRuntime };
  const mode = detectMode(ctx.args);
  const initialPath = typeof ctx.args?.path === 'string' ? ctx.args.path : undefined;
  const liveAppId = typeof ctx.args?.liveAppId === 'string' ? ctx.args.liveAppId : undefined;
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
          liveAppId={liveAppId}
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
