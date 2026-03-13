import React, { useCallback } from 'react';
import { ActionsProvider, Action, useCommand } from '@desktalk/sdk';
import type { Note, NoteMeta } from '../types';

interface NoteActionsProps {
  children: React.ReactNode;
  selectedNoteId: string | null;
  selectedNote: Note | null;
  onNoteCreated: (note: Note) => void;
  onNoteDeleted: (id: string) => void;
  onSearch: (query: string) => void;
  onNoteUpdated: (note: Note) => void;
  onRefresh: () => void;
}

export function NoteActions({
  children,
  selectedNoteId,
  selectedNote,
  onNoteCreated,
  onNoteDeleted,
  onSearch,
  onNoteUpdated,
  onRefresh: _onRefresh,
}: NoteActionsProps) {
  const createNote = useCommand<{ title?: string; content?: string; tags?: string[] }, Note>(
    'notes.create',
  );
  const deleteNote = useCommand<{ id: string }, void>('notes.delete');
  const searchNotes = useCommand<{ query: string }, NoteMeta[]>('notes.search');
  const updateNote = useCommand<{ id: string; content?: string; tags?: string[] }, Note>(
    'notes.update',
  );

  const handleCreate = useCallback(
    async (params?: Record<string, unknown>) => {
      const note = await createNote({
        title: (params?.title as string) || undefined,
        content: (params?.content as string) || undefined,
        tags: (params?.tags as string[]) || undefined,
      });
      onNoteCreated(note);
      return note;
    },
    [createNote, onNoteCreated],
  );

  const handleDelete = useCallback(async () => {
    if (!selectedNoteId) return;
    await deleteNote({ id: selectedNoteId });
    onNoteDeleted(selectedNoteId);
  }, [deleteNote, selectedNoteId, onNoteDeleted]);

  const handleSearch = useCallback(
    async (params?: Record<string, unknown>) => {
      const query = (params?.query as string) || '';
      onSearch(query);
      const results = await searchNotes({ query });
      return results;
    },
    [searchNotes, onSearch],
  );

  const handleAddTag = useCallback(
    async (params?: Record<string, unknown>) => {
      if (!selectedNoteId || !selectedNote) return;
      const tag = (params?.tag as string) || '';
      if (!tag || selectedNote.tags.includes(tag)) return;
      const note = await updateNote({
        id: selectedNoteId,
        tags: [...selectedNote.tags, tag],
      });
      onNoteUpdated(note);
      return note;
    },
    [updateNote, selectedNoteId, selectedNote, onNoteUpdated],
  );

  const handleRemoveTag = useCallback(
    async (params?: Record<string, unknown>) => {
      if (!selectedNoteId || !selectedNote) return;
      const tag = (params?.tag as string) || '';
      if (!tag) return;
      const note = await updateNote({
        id: selectedNoteId,
        tags: selectedNote.tags.filter((t) => t !== tag),
      });
      onNoteUpdated(note);
      return note;
    },
    [updateNote, selectedNoteId, selectedNote, onNoteUpdated],
  );

  return (
    <ActionsProvider>
      <Action
        name="Create Note"
        description="Create a new note with optional title and content"
        params={{
          title: { type: 'string', description: 'Note title', required: false },
          content: { type: 'string', description: 'Note content in Markdown', required: false },
          tags: { type: 'string', description: 'Comma-separated tags', required: false },
        }}
        handler={handleCreate}
      />
      <Action
        name="Delete Note"
        description="Delete the currently selected note"
        handler={handleDelete}
      />
      <Action
        name="Search Notes"
        description="Search notes by keyword"
        params={{
          query: { type: 'string', description: 'Search query', required: true },
        }}
        handler={handleSearch}
      />
      <Action
        name="Add Tag"
        description="Add a tag to the current note"
        params={{
          tag: { type: 'string', description: 'Tag name to add', required: true },
        }}
        handler={handleAddTag}
      />
      <Action
        name="Remove Tag"
        description="Remove a tag from the current note"
        params={{
          tag: { type: 'string', description: 'Tag name to remove', required: true },
        }}
        handler={handleRemoveTag}
      />
      {children}
    </ActionsProvider>
  );
}
