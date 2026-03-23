import React, { useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import type {
  MiniAppFrontendActivation,
  MiniAppFrontendContext,
  MiniAppManifest,
} from '@desktalk/sdk';
import { useCommand, useOpenMiniApp, MiniAppIdProvider, WindowIdProvider } from '@desktalk/sdk';
import type { FileEntry, SortColumn } from './types';
import { FileBreadcrumb } from './components/FileBreadcrumb';
import { FileList } from './components/FileList';
import { FilePreview } from './components/FilePreview';
import { FileActions } from './components/FileActions';
import { ContextMenu, type ContextMenuAction } from './components/ContextMenu';
import { createFileExplorerStore } from './store';
import styles from './FileExplorerApp.module.css';

const DEFAULT_OPEN_APP_IDS = ['preview', 'text-edit'];

function getNextDirectoryName(entries: FileEntry[]): string {
  const names = new Set(
    entries.filter((entry) => entry.type === 'directory').map((entry) => entry.name.toLowerCase()),
  );

  if (!names.has('new folder')) {
    return 'New folder';
  }

  let suffix = 2;
  while (names.has(`new folder ${suffix}`)) {
    suffix += 1;
  }

  return `New folder ${suffix}`;
}

function getExtension(name: string): string | null {
  const lowerName = name.toLowerCase();
  if (lowerName.startsWith('.')) {
    return lowerName;
  }
  const dotIndex = lowerName.lastIndexOf('.');
  return dotIndex >= 0 ? lowerName.slice(dotIndex) : null;
}

function matchesManifest(entry: FileEntry, manifest: MiniAppManifest): boolean {
  if (entry.type !== 'file') {
    return false;
  }

  const association = manifest.fileAssociations;
  if (!association) {
    return false;
  }

  const extension = getExtension(entry.name);
  const extensionMatch =
    extension !== null &&
    association.extensions?.some((candidate: string) => candidate.toLowerCase() === extension);
  const mimeTypeMatch =
    entry.mimeType !== null &&
    association.mimeTypes?.some((candidate: string) => candidate === entry.mimeType);

  return Boolean(extensionMatch || mimeTypeMatch);
}

function getCompatibleMiniApps(entry: FileEntry, manifests: MiniAppManifest[]): MiniAppManifest[] {
  return manifests.filter((manifest) => matchesManifest(entry, manifest));
}

function getDefaultMiniApp(entry: FileEntry, manifests: MiniAppManifest[]): MiniAppManifest | null {
  const compatible = getCompatibleMiniApps(entry, manifests);
  for (const miniAppId of DEFAULT_OPEN_APP_IDS) {
    const match = compatible.find((manifest) => manifest.id === miniAppId);
    if (match) {
      return match;
    }
  }
  return compatible[0] ?? null;
}

function FileExplorerApp() {
  const storeRef = useRef<ReturnType<typeof createFileExplorerStore> | null>(null);
  if (!storeRef.current) {
    storeRef.current = createFileExplorerStore();
  }
  const store = storeRef.current;

  const currentPath = useStore(store, (state) => state.currentPath);
  const history = useStore(store, (state) => state.history);
  const historyIndex = useStore(store, (state) => state.historyIndex);
  const entries = useStore(store, (state) => state.entries);
  const sortColumn = useStore(store, (state) => state.sortColumn);
  const sortDirection = useStore(store, (state) => state.sortDirection);
  const isDragActive = useStore(store, (state) => state.isDragActive);
  const isUploading = useStore(store, (state) => state.isUploading);
  const miniAppManifests = useStore(store, (state) => state.miniAppManifests);
  const selectedPath = useStore(store, (state) => state.selectedPath);
  const previewEntry = useStore(store, (state) => state.previewEntry);
  const previewContent = useStore(store, (state) => state.previewContent);
  const previewLoading = useStore(store, (state) => state.previewLoading);
  const renamingPath = useStore(store, (state) => state.renamingPath);
  const renameValue = useStore(store, (state) => state.renameValue);
  const contextMenu = useStore(store, (state) => state.contextMenu);

  const setEntries = useStore(store, (state) => state.setEntries);
  const setSortColumn = useStore(store, (state) => state.setSortColumn);
  const setSortDirection = useStore(store, (state) => state.setSortDirection);
  const setDragActive = useStore(store, (state) => state.setDragActive);
  const setUploading = useStore(store, (state) => state.setUploading);
  const setMiniAppManifests = useStore(store, (state) => state.setMiniAppManifests);
  const setSelectedPath = useStore(store, (state) => state.setSelectedPath);
  const setPreviewEntry = useStore(store, (state) => state.setPreviewEntry);
  const setPreviewContent = useStore(store, (state) => state.setPreviewContent);
  const setPreviewLoading = useStore(store, (state) => state.setPreviewLoading);
  const setRenameValue = useStore(store, (state) => state.setRenameValue);
  const setContextMenu = useStore(store, (state) => state.setContextMenu);
  const startRename = useStore(store, (state) => state.startRename);
  const stopRename = useStore(store, (state) => state.stopRename);
  const closePreview = useStore(store, (state) => state.closePreview);
  const navigateTo = useStore(store, (state) => state.navigateTo);
  const goBackInHistory = useStore(store, (state) => state.goBack);
  const goForwardInHistory = useStore(store, (state) => state.goForward);

  const listFiles = useCommand<{ path: string }, FileEntry[]>('files.list');
  const readFile = useCommand<{ path: string }, { content: string; mimeType: string }>(
    'files.read',
  );
  const deleteEntry = useCommand<{ path: string }, void>('files.delete');
  const renameEntry = useCommand<{ path: string; newName: string }, FileEntry>('files.rename');
  const createEntry = useCommand<
    { path: string; type: 'file' | 'directory'; content?: string },
    FileEntry
  >('files.create');
  const copyEntry = useCommand<{ source: string; destination: string }, FileEntry>('files.copy');
  const moveEntry = useCommand<{ source: string; destination: string }, FileEntry>('files.move');
  const uploadEntry = useCommand<{ path: string; contentBase64: string }, FileEntry>(
    'files.upload',
  );

  const clipboardRef = useRef<{ path: string; mode: 'copy' | 'cut' } | null>(null);
  const renameSubmittingRef = useRef(false);
  const openMiniApp = useOpenMiniApp();

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

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
    [listFiles, setEntries],
  );

  useEffect(() => {
    fetchEntries(currentPath);
  }, [currentPath, fetchEntries]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch('/api/miniapps');
        if (!response.ok) {
          throw new Error(`Failed to load MiniApps (${response.status})`);
        }

        const manifests = (await response.json()) as MiniAppManifest[];
        if (!cancelled) {
          setMiniAppManifests(manifests);
        }
      } catch (error) {
        console.error('Failed to load MiniApps:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setMiniAppManifests]);

  const refresh = useCallback(() => {
    fetchEntries(currentPath);
  }, [currentPath, fetchEntries]);

  const handleSort = useCallback(
    (column: SortColumn) => {
      if (sortColumn === column) {
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        setSortColumn(column);
        setSortDirection('asc');
      }
    },
    [setSortColumn, setSortDirection, sortColumn, sortDirection],
  );

  const handleSelect = useCallback(
    (entry: FileEntry) => {
      setSelectedPath(entry.path);
      setContextMenu(null);
    },
    [setContextMenu, setSelectedPath],
  );

  const openInlinePreview = useCallback(
    async (entry: FileEntry) => {
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
    [readFile, setPreviewContent, setPreviewEntry, setPreviewLoading],
  );

  const handleOpen = useCallback(
    async (entry: FileEntry) => {
      if (entry.type === 'directory') {
        navigateTo(entry.path);
        return;
      }

      const defaultMiniApp = getDefaultMiniApp(entry, miniAppManifests);
      if (defaultMiniApp) {
        openMiniApp(defaultMiniApp.id, { path: entry.path });
        return;
      }

      await openInlinePreview(entry);
    },
    [miniAppManifests, navigateTo, openInlinePreview, openMiniApp],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: FileEntry) => {
      e.preventDefault();
      setSelectedPath(entry.path);
      setContextMenu({ x: e.clientX, y: e.clientY, entry });
    },
    [setContextMenu, setSelectedPath],
  );

  const handleBackgroundContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest('tr')) {
        return;
      }

      e.preventDefault();
      setSelectedPath(null);
      setContextMenu({ x: e.clientX, y: e.clientY, entry: null });
    },
    [setContextMenu, setSelectedPath],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, [setContextMenu]);

  const handleRenameSubmit = useCallback(async () => {
    if (renameSubmittingRef.current) {
      return;
    }

    if (!renamingPath || !renameValue.trim()) {
      stopRename();
      await fetchEntries(currentPath);
      return;
    }

    const originalEntry = entries.find((entry) => entry.path === renamingPath);
    const nextName = renameValue.trim();
    if (originalEntry && originalEntry.name === nextName) {
      stopRename();
      return;
    }

    renameSubmittingRef.current = true;
    try {
      const renamedEntry = await renameEntry({ path: renamingPath, newName: nextName });
      await fetchEntries(currentPath);

      if (selectedPath === renamingPath) {
        setSelectedPath(renamedEntry.path);
      }

      if (previewEntry?.path === renamingPath) {
        setPreviewEntry(renamedEntry);
      }
    } catch (err) {
      console.error('Failed to rename:', err);
      await fetchEntries(currentPath);
    } finally {
      renameSubmittingRef.current = false;
      stopRename();
    }
  }, [
    currentPath,
    entries,
    fetchEntries,
    previewEntry,
    renameEntry,
    renameValue,
    renamingPath,
    selectedPath,
    setPreviewEntry,
    setSelectedPath,
    stopRename,
  ]);

  const handleRenameCancel = useCallback(() => {
    stopRename();
  }, [stopRename]);

  const handleCreateDirectory = useCallback(async () => {
    const name = getNextDirectoryName(entries);
    const path = currentPath === '.' ? name : `${currentPath}/${name}`;

    try {
      const entry = await createEntry({ path, type: 'directory' });
      await fetchEntries(currentPath);
      setSelectedPath(entry.path);
      startRename(entry.path, entry.name);
    } catch (err) {
      console.error('Failed to create directory:', err);
    }
  }, [createEntry, currentPath, entries, fetchEntries, setSelectedPath, startRename]);

  const handleOpenInTerminal = useCallback(() => {
    openMiniApp('terminal', { cwd: currentPath });
  }, [currentPath, openMiniApp]);

  const handleDelete = useCallback(
    async (path: string) => {
      try {
        await deleteEntry({ path });
        if (previewEntry?.path === path) {
          closePreview();
        }
        if (selectedPath === path) {
          setSelectedPath(null);
        }
        refresh();
      } catch (err) {
        console.error('Failed to delete:', err);
      }
    },
    [closePreview, deleteEntry, previewEntry, refresh, selectedPath, setSelectedPath],
  );

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
  }, [copyEntry, currentPath, moveEntry, refresh]);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDragActive(true);
    },
    [setDragActive],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const nextTarget = e.relatedTarget as Node | null;
      if (nextTarget && e.currentTarget.contains(nextTarget)) {
        return;
      }
      setDragActive(false);
    },
    [setDragActive],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      if (!Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
      setDragActive(false);

      const droppedFiles = Array.from(e.dataTransfer.files).filter((file) => file.size >= 0);
      if (droppedFiles.length === 0) return;

      setUploading(true);
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
        setUploading(false);
      }
    },
    [currentPath, fileToBase64, refresh, setDragActive, setUploading, uploadEntry],
  );

  const buildContextMenuActions = useCallback(
    (entry: FileEntry | null): ContextMenuAction[] => {
      if (entry === null) {
        return [
          {
            label: 'New folder',
            handler: () => {
              void handleCreateDirectory();
            },
          },
          {
            label: 'Open in Terminal',
            handler: handleOpenInTerminal,
          },
        ];
      }

      const actions: ContextMenuAction[] = [];

      if (entry.type === 'directory') {
        actions.push({
          label: 'Open',
          handler: () => navigateTo(entry.path),
        });
      } else {
        const compatibleMiniApps = getCompatibleMiniApps(entry, miniAppManifests);
        const defaultMiniApp = getDefaultMiniApp(entry, miniAppManifests);

        actions.push({
          label: 'Open',
          handler: () => {
            if (defaultMiniApp) {
              openMiniApp(defaultMiniApp.id, { path: entry.path });
              return;
            }
            void openInlinePreview(entry);
          },
        });

        if (compatibleMiniApps.length > 0) {
          actions.push({
            label: 'Open with',
            children: compatibleMiniApps.map((manifest) => ({
              label: manifest.name,
              handler: () => openMiniApp(manifest.id, { path: entry.path }),
            })),
          });
        }
      }

      actions.push({
        label: 'Rename',
        handler: () => startRename(entry.path, entry.name),
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
    [
      handleCopy,
      handleCreateDirectory,
      handleCut,
      handleDelete,
      handleOpenInTerminal,
      handlePaste,
      miniAppManifests,
      navigateTo,
      openInlinePreview,
      openMiniApp,
      startRename,
    ],
  );

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
        closePreview();
      }
      refresh();
    },
    [closePreview, previewEntry, refresh],
  );

  const handleActionRenamed = useCallback(() => {
    refresh();
  }, [refresh]);

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
        <div className={styles.navBar}>
          <button
            className={styles.navBtn}
            onClick={goBackInHistory}
            disabled={!canGoBack}
            title="Back"
          >
            {'\u25C0'}
          </button>
          <button
            className={styles.navBtn}
            onClick={goForwardInHistory}
            disabled={!canGoForward}
            title="Forward"
          >
            {'\u25B6'}
          </button>
          <FileBreadcrumb currentPath={currentPath} onNavigate={navigateTo} />
        </div>

        <div className={styles.body}>
          <div className={styles.fileListPanel}>
            <div
              className={styles.fileListDropZone}
              onContextMenu={handleBackgroundContextMenu}
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
              onClose={closePreview}
            />
          )}
        </div>

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

export function activate(ctx: MiniAppFrontendContext): MiniAppFrontendActivation {
  const root = createRoot(ctx.root);
  root.render(
    <WindowIdProvider windowId={ctx.windowId}>
      <MiniAppIdProvider miniAppId={ctx.miniAppId}>
        <FileExplorerApp />
      </MiniAppIdProvider>
    </WindowIdProvider>,
  );

  return {
    deactivate() {
      root.unmount();
    },
  };
}
