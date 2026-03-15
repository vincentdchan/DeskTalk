import React, { useCallback, type RefObject } from 'react';
import { ActionsProvider, Action, useCommand } from '@desktalk/sdk';
import type { Note, NoteMeta } from '../types';
import type { NoteEditorHandle } from './NoteEditor';
import { parseFrontMatter, serializeFrontMatter } from '../lib/frontmatter';

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
  notes: NoteMeta[];
  editorRef: RefObject<NoteEditorHandle | null>;
  onNoteCreated: (note: Note) => void;
  onNoteDeleted: (id: string) => void;
  onSearch: (query: string) => void;
  onNoteUpdated: (note: Note) => void;
  onSelectNote: (id: string) => Promise<void>;
  onRefresh: () => void;
}

export function NoteActions({
  children,
  selectedNoteId,
  selectedNote,
  notes,
  editorRef,
  onNoteCreated,
  onNoteDeleted,
  onSearch,
  onNoteUpdated,
  onSelectNote,
  onRefresh: _onRefresh,
}: NoteActionsProps) {
  const createNote = useCommand<
    { title?: string; content?: string; tags?: string[]; path?: string },
    Note
  >('notes.create');
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
        path: (params?.path as string) || undefined,
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

  // ─── AI Editing Actions ──────────────────────────────────────────────────

  /**
   * Reconstruct full raw content (front matter + body) from note metadata
   * and the live editor body. This ensures we get the latest unsaved edits.
   */
  const getRawContent = useCallback((): string | null => {
    if (!selectedNote) return null;
    const handle = editorRef.current;
    if (!handle) return null;
    const body = handle.getMarkdown();
    if (body === null) return null;
    return serializeFrontMatter(
      selectedNote.title,
      selectedNote.tags,
      selectedNote.createdAt,
      body,
    );
  }, [selectedNote, editorRef]);

  const handleListNotes = useCallback(async () => {
    // Cap at 20 most recent, annotate with selection status.
    const listed = notes.slice(0, 20).map((n) => ({
      id: n.id,
      title: n.title,
      updatedAt: n.updatedAt,
      selected: n.id === selectedNoteId,
    }));
    return { notes: listed };
  }, [notes, selectedNoteId]);

  const handleSelectNote = useCallback(
    async (params?: Record<string, unknown>) => {
      const id = params?.id as string | undefined;
      if (!id) {
        return { success: false, error: 'id parameter is required' };
      }
      // Verify the note exists in the current list
      const found = notes.find((n) => n.id === id);
      if (!found) {
        return { success: false, error: `Note not found: ${id}` };
      }
      await onSelectNote(id);
      return { success: true };
    },
    [notes, onSelectNote],
  );

  const handleGetEditingContext = useCallback(async () => {
    if (!selectedNoteId || !selectedNote) {
      return { error: 'No note is currently open' };
    }
    const handle = editorRef.current;
    if (!handle) {
      return { error: 'Editor is not ready' };
    }
    const content = getRawContent();
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
  }, [selectedNoteId, selectedNote, editorRef, getRawContent]);

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

      const currentRaw = getRawContent();
      if (currentRaw === null) {
        return { success: false, error: 'Editor is not ready' };
      }

      // Handle empty old_text as "insert at beginning"
      let newRaw: string;
      let matchIndex: number;
      if (oldText === '') {
        newRaw = newText + currentRaw;
        matchIndex = 0;
      } else {
        // Find exact match in the full raw content (including front matter)
        const firstIndex = currentRaw.indexOf(oldText);
        if (firstIndex === -1) {
          return { success: false, error: 'Text not found in note' };
        }

        // Check for multiple matches
        const secondIndex = currentRaw.indexOf(oldText, firstIndex + 1);
        if (secondIndex !== -1) {
          let count = 2;
          let searchFrom = secondIndex + 1;
          while (true) {
            const idx = currentRaw.indexOf(oldText, searchFrom);
            if (idx === -1) break;
            count++;
            searchFrom = idx + 1;
          }
          return {
            success: false,
            error: `Text appears ${count} times; provide more surrounding context to make it unique`,
          };
        }

        newRaw =
          currentRaw.substring(0, firstIndex) +
          newText +
          currentRaw.substring(firstIndex + oldText.length);
        matchIndex = firstIndex;
      }

      // Parse the new raw content to split front matter and body
      const parsed = parseFrontMatter(newRaw);

      // Update the editor with the body portion
      handle.setMarkdown(parsed.body);

      // If front matter metadata changed, persist via backend update
      const tagsChanged =
        parsed.tags.length !== selectedNote.tags.length ||
        parsed.tags.some((t, i) => t !== selectedNote.tags[i]);
      const titleChanged = parsed.title !== selectedNote.title;

      if (tagsChanged || titleChanged) {
        const updated = await updateNote({
          id: selectedNoteId,
          tags: parsed.tags,
          // Send the full content so backend can parse the new title
          content: parsed.body,
        });
        onNoteUpdated(updated);
      }

      const { diff, firstChangedLine } = computeDiff(
        currentRaw,
        newRaw,
        oldText,
        newText,
        matchIndex,
      );
      return { success: true, diff, firstChangedLine };
    },
    [selectedNoteId, selectedNote, editorRef, getRawContent, updateNote, onNoteUpdated],
  );

  return (
    <ActionsProvider>
      <Action
        name="Create Note"
        description="Create a new note with optional title, content, and path"
        params={{
          title: { type: 'string', description: 'Note title', required: false },
          content: { type: 'string', description: 'Note content in Markdown', required: false },
          tags: { type: 'string', description: 'Comma-separated tags', required: false },
          path: {
            type: 'string',
            description:
              'Relative path for the note (e.g. "work/meeting-notes"). Becomes the note ID. Auto-generated if omitted.',
            required: false,
          },
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
        name="List Notes"
        description="Return the 20 most recent notes with selection status"
        handler={handleListNotes}
      />
      <Action
        name="Select Note"
        description="Select a note by ID and open it in the editor"
        params={{
          id: {
            type: 'string',
            description: 'Note ID (relative path without .md)',
            required: true,
          },
        }}
        handler={handleSelectNote}
      />
      <Action
        name="Get Editing Context"
        description="Return the current editor state for the selected note including content, cursor position, and selected text"
        handler={handleGetEditingContext}
      />
      <Action
        name="Edit Note"
        description="Apply a text replacement to the current note content including front matter. Use old_text to find exact text and new_text to replace it. To edit tags or title, modify the YAML front matter directly."
        params={{
          old_text: {
            type: 'string',
            description:
              'Exact text to find in the note content (must appear exactly once). Searches the full content including YAML front matter. Use empty string to insert at beginning.',
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
