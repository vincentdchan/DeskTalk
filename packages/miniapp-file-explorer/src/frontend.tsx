import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { MiniAppFrontendContext } from '@desktalk/sdk';
import { useCommand, MiniAppIdProvider, WindowIdProvider } from '@desktalk/sdk';
import type { FileEntry, SortColumn, SortDirection } from './types';
import { FileBreadcrumb } from './components/FileBreadcrumb';
import { FileList } from './components/FileList';
import { FilePreview } from './components/FilePreview';
import { FileActions } from './components/FileActions';
import { ContextMenu, type ContextMenuAction } from './components/ContextMenu';
import styles from './FileExplorerApp.module.css';

function FileExplorerApp() {
  // ─── Navigation state ───────────────────────────────────────────────────
  const [currentPath, setCurrentPath] = useState('.');
  const [history, setHistory] = useState<string[]>(['.']);
  const [historyIndex, setHistoryIndex] = useState(0);

  // ─── File list state ────────────────────────────────────────────────────
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // ─── Selection and preview ──────────────────────────────────────────────
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<FileEntry | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ─── Rename state ───────────────────────────────────────────────────────
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // ─── Context menu state ─────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entry: FileEntry;
  } | null>(null);

  // ─── Backend commands ───────────────────────────────────────────────────
  const listFiles = useCommand<{ path: string }, FileEntry[]>('files.list');
  const readFile = useCommand<{ path: string }, { content: string; mimeType: string }>(
    'files.read',
  );
  const deleteEntry = useCommand<{ path: string }, void>('files.delete');
  const renameEntry = useCommand<{ path: string; newName: string }, FileEntry>('files.rename');
  const copyEntry = useCommand<{ source: string; destination: string }, FileEntry>('files.copy');
  const moveEntry = useCommand<{ source: string; destination: string }, FileEntry>('files.move');
  const uploadEntry = useCommand<{ path: string; contentBase64: string }, FileEntry>(
    'files.upload',
  );

  // ─── Clipboard for copy/move ────────────────────────────────────────────
  const clipboardRef = useRef<{ path: string; mode: 'copy' | 'cut' } | null>(null);

  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error(`Failed to read file: ${file.name}`));
          return;
        }
        const commaIndex = result.indexOf(',');
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  // ─── Fetch directory contents ───────────────────────────────────────────

  const fetchEntries = useCallback(
    async (path: string) => {
      try {
        const result = await listFiles({ path });
        setEntries(result);
      } catch (err) {
        console.error('Failed to list directory:', err);
        setEntries([]);
      }
    },
    [listFiles],
  );

  // Fetch on path change
  useEffect(() => {
    fetchEntries(currentPath);
  }, [currentPath, fetchEntries]);

  const refresh = useCallback(() => {
    fetchEntries(currentPath);
  }, [currentPath, fetchEntries]);

  // ─── Navigation ─────────────────────────────────────────────────────────

  const navigateTo = useCallback(
    (path: string) => {
      setCurrentPath(path);
      setSelectedPath(null);
      setPreviewEntry(null);
      setPreviewContent(null);
      setContextMenu(null);

      // Trim forward history and push
      const newHistory = [...history.slice(0, historyIndex + 1), path];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    },
    [history, historyIndex],
  );

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const goBack = useCallback(() => {
    if (!canGoBack) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setCurrentPath(history[newIndex]);
    setSelectedPath(null);
    setPreviewEntry(null);
    setPreviewContent(null);
  }, [canGoBack, historyIndex, history]);

  const goForward = useCallback(() => {
    if (!canGoForward) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setCurrentPath(history[newIndex]);
    setSelectedPath(null);
    setPreviewEntry(null);
    setPreviewContent(null);
  }, [canGoForward, historyIndex, history]);

  // ─── Sorting ────────────────────────────────────────────────────────────

  const handleSort = useCallback(
    (column: SortColumn) => {
      if (sortColumn === column) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortColumn(column);
        setSortDirection('asc');
      }
    },
    [sortColumn],
  );

  // ─── Selection ──────────────────────────────────────────────────────────

  const handleSelect = useCallback((entry: FileEntry) => {
    setSelectedPath(entry.path);
    setContextMenu(null);
  }, []);

  // ─── Open (double-click) ────────────────────────────────────────────────

  const handleOpen = useCallback(
    async (entry: FileEntry) => {
      if (entry.type === 'directory') {
        navigateTo(entry.path);
        return;
      }

      // Open file preview
      setPreviewEntry(entry);
      setPreviewLoading(true);
      setPreviewContent(null);

      try {
        const result = await readFile({ path: entry.path });
        setPreviewContent(result.content);
      } catch (err) {
        console.error('Failed to read file:', err);
        setPreviewContent(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [navigateTo, readFile],
  );

  // ─── Context menu ──────────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    setSelectedPath(entry.path);
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // ─── Rename ─────────────────────────────────────────────────────────────

  const startRename = useCallback((entry: FileEntry) => {
    setRenamingPath(entry.path);
    setRenameValue(entry.name);
  }, []);

  const handleRenameSubmit = useCallback(async () => {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null);
      return;
    }

    try {
      await renameEntry({ path: renamingPath, newName: renameValue.trim() });
      refresh();
    } catch (err) {
      console.error('Failed to rename:', err);
    } finally {
      setRenamingPath(null);
    }
  }, [renamingPath, renameValue, renameEntry, refresh]);

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
  }, []);

  // ─── Delete ─────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (path: string) => {
      try {
        await deleteEntry({ path });
        if (previewEntry?.path === path) {
          setPreviewEntry(null);
          setPreviewContent(null);
        }
        if (selectedPath === path) {
          setSelectedPath(null);
        }
        refresh();
      } catch (err) {
        console.error('Failed to delete:', err);
      }
    },
    [deleteEntry, previewEntry, selectedPath, refresh],
  );

  // ─── Copy / Cut / Paste ────────────────────────────────────────────────

  const handleCopy = useCallback((path: string) => {
    clipboardRef.current = { path, mode: 'copy' };
  }, []);

  const handleCut = useCallback((path: string) => {
    clipboardRef.current = { path, mode: 'cut' };
  }, []);

  const handlePaste = useCallback(async () => {
    if (!clipboardRef.current) return;

    const { path: sourcePath, mode } = clipboardRef.current;
    const sourceName = sourcePath.includes('/') ? sourcePath.split('/').pop()! : sourcePath;
    const destination = currentPath === '.' ? sourceName : `${currentPath}/${sourceName}`;

    try {
      if (mode === 'copy') {
        await copyEntry({ source: sourcePath, destination });
      } else {
        await moveEntry({ source: sourcePath, destination });
        clipboardRef.current = null;
      }
      refresh();
    } catch (err) {
      console.error(`Failed to ${mode}:`, err);
    }
  }, [currentPath, copyEntry, moveEntry, refresh]);

  // ─── Drag and drop upload ────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = e.relatedTarget as Node | null;
    if (nextTarget && e.currentTarget.contains(nextTarget)) {
      return;
    }
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      if (!Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
      setIsDragActive(false);

      const droppedFiles = Array.from(e.dataTransfer.files).filter((file) => file.size >= 0);
      if (droppedFiles.length === 0) return;

      setIsUploading(true);
      try {
        await Promise.all(
          droppedFiles.map(async (file) => {
            const contentBase64 = await fileToBase64(file);
            const path = currentPath === '.' ? file.name : `${currentPath}/${file.name}`;
            await uploadEntry({ path, contentBase64 });
          }),
        );
        refresh();
      } catch (err) {
        console.error('Failed to upload dropped files:', err);
      } finally {
        setIsUploading(false);
      }
    },
    [currentPath, fileToBase64, refresh, uploadEntry],
  );

  // ─── Build context menu actions ─────────────────────────────────────────

  const buildContextMenuActions = useCallback(
    (entry: FileEntry): ContextMenuAction[] => {
      const actions: ContextMenuAction[] = [];

      if (entry.type === 'directory') {
        actions.push({
          label: 'Open',
          handler: () => navigateTo(entry.path),
        });
      } else {
        actions.push({
          label: 'Preview',
          handler: () => handleOpen(entry),
        });
      }

      actions.push({
        label: 'Rename',
        handler: () => startRename(entry),
      });

      actions.push({
        label: 'Copy',
        handler: () => handleCopy(entry.path),
      });

      actions.push({
        label: 'Cut',
        handler: () => handleCut(entry.path),
      });

      if (clipboardRef.current) {
        actions.push({
          label: 'Paste here',
          handler: handlePaste,
        });
      }

      actions.push({
        label: 'Delete',
        danger: true,
        handler: () => handleDelete(entry.path),
      });

      return actions;
    },
    [navigateTo, handleOpen, startRename, handleCopy, handleCut, handlePaste, handleDelete],
  );

  // ─── Close preview ─────────────────────────────────────────────────────

  const handleClosePreview = useCallback(() => {
    setPreviewEntry(null);
    setPreviewContent(null);
  }, []);

  // ─── Action callbacks (from AI-invoked actions) ─────────────────────────

  const handleActionNavigated = useCallback(
    (path: string) => {
      navigateTo(path);
    },
    [navigateTo],
  );

  const handleActionCreated = useCallback(() => {
    refresh();
  }, [refresh]);

  const handleActionDeleted = useCallback(
    (path: string) => {
      if (previewEntry?.path === path) {
        setPreviewEntry(null);
        setPreviewContent(null);
      }
      refresh();
    },
    [previewEntry, refresh],
  );

  const handleActionRenamed = useCallback(() => {
    refresh();
  }, [refresh]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <FileActions
      currentPath={currentPath}
      onNavigated={handleActionNavigated}
      onFileCreated={handleActionCreated}
      onDirectoryCreated={handleActionCreated}
      onDeleted={handleActionDeleted}
      onRenamed={handleActionRenamed}
      onRefresh={refresh}
    >
      <div className={styles.root}>
        {/* Navigation Bar */}
        <div className={styles.navBar}>
          <button className={styles.navBtn} onClick={goBack} disabled={!canGoBack} title="Back">
            {'\u25C0'}
          </button>
          <button
            className={styles.navBtn}
            onClick={goForward}
            disabled={!canGoForward}
            title="Forward"
          >
            {'\u25B6'}
          </button>
          <FileBreadcrumb currentPath={currentPath} onNavigate={navigateTo} />
        </div>

        {/* Main Content */}
        <div className={styles.body}>
          <div className={styles.fileListPanel}>
            <div
              className={styles.fileListDropZone}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <FileList
                entries={entries}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                selectedPath={selectedPath}
                renamingPath={renamingPath}
                renameValue={renameValue}
                isUploading={isUploading}
                onSort={handleSort}
                onSelect={handleSelect}
                onOpen={handleOpen}
                onContextMenu={handleContextMenu}
                onRenameChange={setRenameValue}
                onRenameSubmit={handleRenameSubmit}
                onRenameCancel={handleRenameCancel}
              />
              {isDragActive && (
                <div className={styles.dropOverlay}>
                  <div className={styles.dropOverlayCard}>
                    <div className={styles.dropOverlayTitle}>Drop files to upload</div>
                    <div className={styles.dropOverlayHint}>
                      Files will be added to this folder.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {previewEntry && (
            <FilePreview
              entry={previewEntry}
              content={previewContent}
              loading={previewLoading}
              onClose={handleClosePreview}
            />
          )}
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            actions={buildContextMenuActions(contextMenu.entry)}
            onClose={handleCloseContextMenu}
          />
        )}
      </div>
    </FileActions>
  );
}

let root: ReturnType<typeof createRoot> | null = null;

export function activate(ctx: MiniAppFrontendContext): void {
  root = createRoot(ctx.root);
  root.render(
    <WindowIdProvider windowId={ctx.windowId}>
      <MiniAppIdProvider miniAppId={ctx.miniAppId}>
        <FileExplorerApp />
      </MiniAppIdProvider>
    </WindowIdProvider>,
  );
}

export function deactivate(): void {
  root?.unmount();
  root = null;
}
