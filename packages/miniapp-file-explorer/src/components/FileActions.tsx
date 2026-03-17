import React, { useCallback } from 'react';
import { ActionsProvider, Action, useCommand } from '@desktalk/sdk';
import type { FileEntry } from '../types';

const LIST_FILES_DEFAULT_LIMIT = 50;
const LIST_FILES_MAX_LIMIT = 200;

interface FileActionsProps {
  children: React.ReactNode;
  currentPath: string;
  onNavigated: (path: string) => void;
  onFileCreated: (entry: FileEntry) => void;
  onDirectoryCreated: (entry: FileEntry) => void;
  onDeleted: (path: string) => void;
  onRenamed: (entry: FileEntry) => void;
  onRefresh: () => void;
}

export function FileActions({
  children,
  currentPath,
  onNavigated,
  onFileCreated,
  onDirectoryCreated,
  onDeleted,
  onRenamed,
  onRefresh: _onRefresh,
}: FileActionsProps) {
  const createEntry = useCommand<
    { path: string; type: 'file' | 'directory'; content?: string },
    FileEntry
  >('files.create');
  const deleteEntry = useCommand<{ path: string }, void>('files.delete');
  const renameEntry = useCommand<{ path: string; newName: string }, FileEntry>('files.rename');
  const listFiles = useCommand<{ path: string; limit?: number }, FileEntry[]>('files.list');

  // ─── List Files ─────────────────────────────────────────────────────────

  const handleListFiles = useCallback(
    async (params?: Record<string, unknown>) => {
      const rawLimit = params?.limit != null ? Number(params.limit) : LIST_FILES_DEFAULT_LIMIT;
      const limit = Math.max(1, Math.min(rawLimit, LIST_FILES_MAX_LIMIT));
      const entries = await listFiles({ path: currentPath, limit });
      return entries;
    },
    [listFiles, currentPath],
  );

  // ─── Navigate ───────────────────────────────────────────────────────────

  const handleNavigate = useCallback(
    async (params?: Record<string, unknown>) => {
      const path = (params?.path as string) || '.';
      onNavigated(path);
    },
    [onNavigated],
  );

  // ─── Create File ────────────────────────────────────────────────────────

  const handleCreateFile = useCallback(
    async (params?: Record<string, unknown>) => {
      const name = (params?.name as string) || '';
      if (!name) return;

      const path = currentPath === '.' ? name : `${currentPath}/${name}`;
      const content = (params?.content as string) ?? '';
      const entry = await createEntry({ path, type: 'file', content });
      onFileCreated(entry);
      return entry;
    },
    [createEntry, currentPath, onFileCreated],
  );

  // ─── Create Directory ───────────────────────────────────────────────────

  const handleCreateDirectory = useCallback(
    async (params?: Record<string, unknown>) => {
      const name = (params?.name as string) || '';
      if (!name) return;

      const path = currentPath === '.' ? name : `${currentPath}/${name}`;
      const entry = await createEntry({ path, type: 'directory' });
      onDirectoryCreated(entry);
      return entry;
    },
    [createEntry, currentPath, onDirectoryCreated],
  );

  // ─── Delete ─────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (params?: Record<string, unknown>) => {
      const path = (params?.path as string) || '';
      if (!path) return;

      await deleteEntry({ path });
      onDeleted(path);
    },
    [deleteEntry, onDeleted],
  );

  // ─── Rename ─────────────────────────────────────────────────────────────

  const handleRename = useCallback(
    async (params?: Record<string, unknown>) => {
      const path = (params?.path as string) || '';
      const newName = (params?.newName as string) || '';
      if (!path || !newName) return;

      const entry = await renameEntry({ path, newName });
      onRenamed(entry);
      return entry;
    },
    [renameEntry, onRenamed],
  );

  return (
    <ActionsProvider>
      <Action
        name="List Files"
        description="List files and directories in the current folder. Returns up to limit entries (default 50, max 200)."
        params={{
          limit: {
            type: 'number',
            description: 'Maximum number of entries to return (default 50, max 200)',
            required: false,
          },
        }}
        handler={handleListFiles}
      />
      <Action
        name="Navigate"
        description="Navigate to a directory"
        params={{
          path: { type: 'string', description: 'Directory path to navigate to', required: true },
        }}
        handler={handleNavigate}
      />
      <Action
        name="Create File"
        description="Create a new file in the current directory"
        params={{
          name: { type: 'string', description: 'File name', required: true },
          content: { type: 'string', description: 'File content', required: false },
        }}
        handler={handleCreateFile}
      />
      <Action
        name="Create Directory"
        description="Create a new directory in the current directory"
        params={{
          name: { type: 'string', description: 'Directory name', required: true },
        }}
        handler={handleCreateDirectory}
      />
      <Action
        name="Delete"
        description="Delete a file or directory"
        params={{
          path: {
            type: 'string',
            description: 'Path of file or directory to delete',
            required: true,
          },
        }}
        handler={handleDelete}
      />
      <Action
        name="Rename"
        description="Rename a file or directory"
        params={{
          path: { type: 'string', description: 'Current path', required: true },
          newName: { type: 'string', description: 'New name', required: true },
        }}
        handler={handleRename}
      />
      {children}
    </ActionsProvider>
  );
}
