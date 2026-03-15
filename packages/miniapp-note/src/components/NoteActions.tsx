import React, { useCallback, type RefObject } from 'react';
import { ActionsProvider, Action, useCommand } from '@desktalk/sdk';
import type { Note, NoteMeta } from '../types';
import type { NoteEditorHandle } from './NoteEditor';

/**
 * Compute a minimal unified-diff string for a single old_text→new_text replacement.
 * Returns a human-readable diff with context lines.
 */
function computeDiff(
  oldContent: string,
  newContent: string,
  oldText: string,
  newText: string,
  matchIndex: number,
): { diff: string; firstChangedLine: number } {
  const linesBefore = oldContent.substring(0, matchIndex).split('\n');
  const firstChangedLine = linesBefore.length; // 1-indexed (the line the match starts on)

  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Build a simple unified diff
  const contextStart = Math.max(0, firstChangedLine - 4); // up to 3 context lines before
  const allOldLines = oldContent.split('\n');
  const allNewLines = newContent.split('\n');

  const lines: string[] = [];
  lines.push(
    `@@ -${firstChangedLine},${oldLines.length} +${firstChangedLine},${newLines.length} @@`,
  );

  // Context lines before
  for (let i = contextStart; i < firstChangedLine - 1; i++) {
    lines.push(` ${allOldLines[i]}`);
  }
  // Removed lines
  for (const l of oldLines) {
    lines.push(`-${l}`);
  }
  // Added lines
  for (const l of newLines) {
    lines.push(`+${l}`);
  }
  // Context lines after
  const afterStart = firstChangedLine - 1 + oldLines.length;
  const afterEnd = Math.min(allNewLines.length, afterStart + 3);
  for (let i = afterStart; i < afterEnd; i++) {
    if (allNewLines[i] !== undefined) {
      lines.push(` ${allNewLines[i]}`);
    }
  }

  return { diff: lines.join('\n'), firstChangedLine };
}

interface NoteActionsProps {
  children: React.ReactNode;
  selectedNoteId: string | null;
  selectedNote: Note | null;
  editorRef: RefObject<NoteEditorHandle | null>;
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
  editorRef,
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

  // ─── AI Editing Actions ──────────────────────────────────────────────────

  const handleGetEditingContext = useCallback(async () => {
    if (!selectedNoteId || !selectedNote) {
      return { error: 'No note is currently open' };
    }
    const handle = editorRef.current;
    if (!handle) {
      return { error: 'Editor is not ready' };
    }
    const content = handle.getMarkdown();
    if (content === null) {
      return { error: 'Editor is not ready' };
    }
    return {
      id: selectedNote.id,
      title: selectedNote.title,
      content,
      cursorLine: handle.getCursorLine(),
      selectedText: handle.getSelectedText(),
    };
  }, [selectedNoteId, selectedNote, editorRef]);

  const handleEditNote = useCallback(
    async (params?: Record<string, unknown>) => {
      if (!selectedNoteId || !selectedNote) {
        return { success: false, error: 'No note is currently open' };
      }
      const handle = editorRef.current;
      if (!handle) {
        return { success: false, error: 'Editor is not ready' };
      }

      const oldText = params?.old_text as string | undefined;
      const newText = params?.new_text as string | undefined;
      if (oldText === undefined || newText === undefined) {
        return { success: false, error: 'Both old_text and new_text are required' };
      }

      const currentContent = handle.getMarkdown();
      if (currentContent === null) {
        return { success: false, error: 'Editor is not ready' };
      }

      // Handle empty old_text as "insert at beginning"
      if (oldText === '') {
        const newContent = newText + currentContent;
        handle.setMarkdown(newContent);
        const { diff, firstChangedLine } = computeDiff(currentContent, newContent, '', newText, 0);
        return { success: true, diff, firstChangedLine };
      }

      // Find exact match
      const firstIndex = currentContent.indexOf(oldText);
      if (firstIndex === -1) {
        return { success: false, error: 'Text not found in note' };
      }

      // Check for multiple matches
      const secondIndex = currentContent.indexOf(oldText, firstIndex + 1);
      if (secondIndex !== -1) {
        // Count total occurrences
        let count = 2;
        let searchFrom = secondIndex + 1;
        while (true) {
          const idx = currentContent.indexOf(oldText, searchFrom);
          if (idx === -1) break;
          count++;
          searchFrom = idx + 1;
        }
        return {
          success: false,
          error: `Text appears ${count} times; provide more surrounding context to make it unique`,
        };
      }

      // Apply replacement
      const newContent =
        currentContent.substring(0, firstIndex) +
        newText +
        currentContent.substring(firstIndex + oldText.length);
      handle.setMarkdown(newContent);

      const { diff, firstChangedLine } = computeDiff(
        currentContent,
        newContent,
        oldText,
        newText,
        firstIndex,
      );
      return { success: true, diff, firstChangedLine };
    },
    [selectedNoteId, selectedNote, editorRef],
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
      <Action
        name="Get Editing Context"
        description="Return the current editor state for the selected note including content, cursor position, and selected text"
        handler={handleGetEditingContext}
      />
      <Action
        name="Edit Note"
        description="Apply a text replacement to the current note body. Use old_text to find exact text and new_text to replace it. For inserts, include surrounding text in old_text and add the new content in new_text."
        params={{
          old_text: {
            type: 'string',
            description:
              'Exact text to find in the note body (must appear exactly once). Use empty string to insert at beginning.',
            required: true,
          },
          new_text: {
            type: 'string',
            description: 'Replacement text',
            required: true,
          },
        }}
        handler={handleEditNote}
      />
      {children}
    </ActionsProvider>
  );
}
