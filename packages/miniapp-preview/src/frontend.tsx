import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { MiniAppFrontendContext } from '@desktalk/sdk';
import {
  useCommand,
  useWindowArgsUpdated,
  MiniAppIdProvider,
  WindowIdProvider,
} from '@desktalk/sdk';
import type { PreviewFile, SiblingList } from './types';
import { PreviewToolbar } from './components/PreviewToolbar';
import { ImageViewport } from './components/ImageViewport';
import { PreviewActions } from './components/PreviewActions';
import styles from './PreviewApp.module.css';

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

function PreviewApp({ initialPath }: { initialPath?: string }) {
  // ─── State ───────────────────────────────────────────────────────────────
  const [currentFile, setCurrentFile] = useState<PreviewFile | null>(null);
  const [siblings, setSiblings] = useState<SiblingList | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // ─── Backend commands ────────────────────────────────────────────────────
  const openFile = useCommand<{ path: string }, PreviewFile>('preview.open');
  const getSiblings = useCommand<{ path: string }, SiblingList>('preview.siblings');
  const nextFile = useCommand<{ currentPath: string }, PreviewFile>('preview.next');
  const previousFile = useCommand<{ currentPath: string }, PreviewFile>('preview.previous');

  // ─── Load file and siblings ──────────────────────────────────────────────

  const handleFileOpened = useCallback(
    (file: PreviewFile) => {
      setError(null);
      setCurrentFile(file);
      setZoom(1);
      getSiblings({ path: file.path }).then(setSiblings).catch(console.error);
    },
    [getSiblings],
  );

  // Auto-open the file specified by launch arguments
  useEffect(() => {
    if (!initialPath) return;
    openFile({ path: initialPath }).then(handleFileOpened).catch(console.error);
  }, []);

  // Handle updated args when the shell reuses this window with a new file
  useWindowArgsUpdated(
    useCallback(
      (args: Record<string, unknown>) => {
        const path = typeof args.path === 'string' ? args.path : undefined;
        if (path) {
          openFile({ path }).then(handleFileOpened).catch(console.error);
        }
      },
      [openFile, handleFileOpened],
    ),
  );

  // ─── Zoom controls ──────────────────────────────────────────────────────

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

  // ─── Pan (from actions) ──────────────────────────────────────────────────

  const handlePan = useCallback((direction: string) => {
    // Delegate to the viewport's panInDirection method
    const container = document.querySelector('[data-preview-viewport]');
    if (container) {
      const el = container as HTMLDivElement & { panInDirection?: (d: string) => void };
      el.panInDirection?.(direction);
    }
  }, []);

  // ─── Navigation ──────────────────────────────────────────────────────────

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

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
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
  }, [handleZoomIn, handleZoomOut, handleFitToWindow]);

  // ─── Derived state ──────────────────────────────────────────────────────

  const canGoPrev = siblings !== null && siblings.files.length > 1;
  const canGoNext = siblings !== null && siblings.files.length > 1;
  const zoomPercent = Math.round(zoom * 100);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <PreviewActions
      currentFile={currentFile}
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
        {currentFile ? (
          <>
            <PreviewToolbar
              filename={currentFile.name}
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
        )}
      </div>
    </PreviewActions>
  );
}

let root: ReturnType<typeof createRoot> | null = null;

export function activate(ctx: MiniAppFrontendContext): void {
  const initialPath = typeof ctx.args?.path === 'string' ? ctx.args.path : undefined;
  root = createRoot(ctx.root);
  root.render(
    <WindowIdProvider windowId={ctx.windowId}>
      <MiniAppIdProvider miniAppId={ctx.miniAppId}>
        <PreviewApp initialPath={initialPath} />
      </MiniAppIdProvider>
    </WindowIdProvider>,
  );
}

export function deactivate(): void {
  root?.unmount();
  root = null;
}
