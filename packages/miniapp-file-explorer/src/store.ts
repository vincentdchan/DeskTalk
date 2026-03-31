import type { MiniAppManifest } from '@desktalk/sdk';
import { createStore } from 'zustand/vanilla';
import type { FileEntry, SortColumn, SortDirection, ViewMode } from './types';

export interface FileExplorerContextMenuState {
  x: number;
  y: number;
  entry: FileEntry | null;
}

interface FileExplorerState {
  currentPath: string;
  history: string[];
  historyIndex: number;
  entries: FileEntry[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  viewMode: ViewMode;
  isDragActive: boolean;
  isUploading: boolean;
  miniAppManifests: MiniAppManifest[];
  selectedPath: string | null;
  previewEntry: FileEntry | null;
  previewContent: string | null;
  previewLoading: boolean;
  renamingPath: string | null;
  renameValue: string;
  contextMenu: FileExplorerContextMenuState | null;
}

interface FileExplorerActions {
  setEntries: (entries: FileEntry[]) => void;
  setSortColumn: (column: SortColumn) => void;
  setSortDirection: (direction: SortDirection) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setDragActive: (isDragActive: boolean) => void;
  setUploading: (isUploading: boolean) => void;
  setMiniAppManifests: (manifests: MiniAppManifest[]) => void;
  setSelectedPath: (path: string | null) => void;
  setPreviewEntry: (entry: FileEntry | null) => void;
  setPreviewContent: (content: string | null) => void;
  setPreviewLoading: (loading: boolean) => void;
  setRenameValue: (value: string) => void;
  setContextMenu: (menu: FileExplorerContextMenuState | null) => void;
  startRename: (path: string, value: string) => void;
  stopRename: () => void;
  closePreview: () => void;
  navigateTo: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
}

export type FileExplorerStore = FileExplorerState & FileExplorerActions;

const INITIAL_STATE: FileExplorerState = {
  currentPath: '.',
  history: ['.'],
  historyIndex: 0,
  entries: [],
  sortColumn: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  isDragActive: false,
  isUploading: false,
  miniAppManifests: [],
  selectedPath: null,
  previewEntry: null,
  previewContent: null,
  previewLoading: false,
  renamingPath: null,
  renameValue: '',
  contextMenu: null,
};

function resetTransientState(): Pick<
  FileExplorerState,
  'selectedPath' | 'previewEntry' | 'previewContent' | 'previewLoading' | 'contextMenu'
> {
  return {
    selectedPath: null,
    previewEntry: null,
    previewContent: null,
    previewLoading: false,
    contextMenu: null,
  };
}

export function createFileExplorerStore() {
  return createStore<FileExplorerStore>((set, get) => ({
    ...INITIAL_STATE,

    setEntries(entries: FileEntry[]) {
      set({ entries });
    },

    setSortColumn(sortColumn: SortColumn) {
      set({ sortColumn });
    },

    setSortDirection(sortDirection: SortDirection) {
      set({ sortDirection });
    },

    setViewMode(viewMode: ViewMode) {
      set({ viewMode });
    },

    setDragActive(isDragActive: boolean) {
      set({ isDragActive });
    },

    setUploading(isUploading: boolean) {
      set({ isUploading });
    },

    setMiniAppManifests(miniAppManifests: MiniAppManifest[]) {
      set({ miniAppManifests });
    },

    setSelectedPath(selectedPath: string | null) {
      set({ selectedPath });
    },

    setPreviewEntry(previewEntry: FileEntry | null) {
      set({ previewEntry });
    },

    setPreviewContent(previewContent: string | null) {
      set({ previewContent });
    },

    setPreviewLoading(previewLoading: boolean) {
      set({ previewLoading });
    },

    setRenameValue(renameValue: string) {
      set({ renameValue });
    },

    setContextMenu(contextMenu: FileExplorerContextMenuState | null) {
      set({ contextMenu });
    },

    startRename(renamingPath: string, renameValue: string) {
      set({ renamingPath, renameValue });
    },

    stopRename() {
      set({ renamingPath: null, renameValue: '' });
    },

    closePreview() {
      set({ previewEntry: null, previewContent: null, previewLoading: false });
    },

    navigateTo(path: string) {
      const { history, historyIndex } = get();
      const nextHistory = [...history.slice(0, historyIndex + 1), path];
      set({
        currentPath: path,
        history: nextHistory,
        historyIndex: nextHistory.length - 1,
        ...resetTransientState(),
      });
    },

    goBack() {
      const { history, historyIndex } = get();
      if (historyIndex <= 0) {
        return;
      }

      const nextIndex = historyIndex - 1;
      set({
        currentPath: history[nextIndex],
        historyIndex: nextIndex,
        ...resetTransientState(),
      });
    },

    goForward() {
      const { history, historyIndex } = get();
      if (historyIndex >= history.length - 1) {
        return;
      }

      const nextIndex = historyIndex + 1;
      set({
        currentPath: history[nextIndex],
        historyIndex: nextIndex,
        ...resetTransientState(),
      });
    },
  }));
}
