import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { MiniAppFrontendActivation, MiniAppFrontendContext } from '@desktalk/sdk';
import { useCommand, MiniAppIdProvider, WindowIdProvider } from '@desktalk/sdk';
import type { Note, NoteMeta } from './types';
import { NoteList } from './components/NoteList';
import { NoteEditor, type NoteEditorHandle } from './components/NoteEditor';
import { NoteActions } from './components/NoteActions';
import styles from './styles/NoteApp.module.css';

const COMPACT_WIDTH = 720;

function NoteApp() {
  // ─── State ───────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingNote, setLoadingNote] = useState(false);
  const [compact, setCompact] = useState(false);
  const editorRef = useRef<NoteEditorHandle>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // ─── Backend commands ────────────────────────────────────────────────────
  const listNotes = useCommand<{ tag?: string }, NoteMeta[]>('notes.list');
  const getNote = useCommand<{ id: string }, Note>('notes.get');
  const updateNote = useCommand<{ id: string; content?: string; tags?: string[] }, Note>(
    'notes.update',
  );
  const searchNotes = useCommand<{ query: string }, NoteMeta[]>('notes.search');
  const createNote = useCommand<{ title?: string; content?: string; tags?: string[] }, Note>(
    'notes.create',
  );

  // ─── Data fetching ───────────────────────────────────────────────────────

  const fetchNotes = useCallback(async () => {
    try {
      let result: NoteMeta[];
      if (searchQuery) {
        result = await searchNotes({ query: searchQuery });
      } else {
        result = await listNotes();
      }
      setNotes(result);
    } catch (err) {
      console.error('Failed to fetch notes:', err);
    }
  }, [listNotes, searchNotes, searchQuery]);

  const refresh = useCallback(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // ─── Responsive layout ───────────────────────────────────────────────────
  useEffect(() => {
    if (!rootRef.current) return;

    const updateLayout = (width: number) => {
      setCompact(width <= COMPACT_WIDTH);
    };

    updateLayout(rootRef.current.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateLayout(entry.contentRect.width);
    });

    observer.observe(rootRef.current);

    return () => observer.disconnect();
  }, []);

  // ─── Note selection ──────────────────────────────────────────────────────

  const selectNote = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setLoadingNote(true);
      try {
        const note = await getNote({ id });
        setCurrentNote(note);
      } catch (err) {
        console.error('Failed to load note:', err);
        setCurrentNote(null);
      } finally {
        setLoadingNote(false);
      }
    },
    [getNote],
  );

  // ─── Search (debounced) ─────────────────────────────────────────────────

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    // Debounce the actual search
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      // fetchNotes will pick up the new searchQuery via state
    }, 300);
  }, []);

  // ─── Editor auto-save ───────────────────────────────────────────────────

  const handleEditorSave = useCallback(
    async (markdown: string) => {
      if (!selectedId || !currentNote) return;
      try {
        const updated = await updateNote({
          id: selectedId,
          content: markdown,
        });
        // Update the current note in state (to keep tags/title in sync)
        setCurrentNote(updated);
        // Refresh list to update preview/date
        fetchNotes();
      } catch (err) {
        console.error('Failed to save note:', err);
      }
    },
    [selectedId, currentNote, updateNote, fetchNotes],
  );

  // ─── Action callbacks ───────────────────────────────────────────────────

  const handleNoteCreated = useCallback(
    (note: Note) => {
      refresh();
      setSelectedId(note.id);
      setCurrentNote(note);
    },
    [refresh],
  );

  const handleNoteDeleted = useCallback(
    (id: string) => {
      if (selectedId === id) {
        setSelectedId(null);
        setCurrentNote(null);
      }
      refresh();
    },
    [selectedId, refresh],
  );

  const handleNoteUpdated = useCallback(
    (note: Note) => {
      if (selectedId === note.id) {
        setCurrentNote(note);
      }
      refresh();
    },
    [selectedId, refresh],
  );

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleCreate = useCallback(async () => {
    try {
      const note = await createNote({});
      handleNoteCreated(note);
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  }, [createNote, handleNoteCreated]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <NoteActions
      selectedNoteId={selectedId}
      selectedNote={currentNote}
      notes={notes}
      editorRef={editorRef}
      onNoteCreated={handleNoteCreated}
      onNoteDeleted={handleNoteDeleted}
      onSearch={handleSearch}
      onNoteUpdated={handleNoteUpdated}
      onSelectNote={selectNote}
      onRefresh={refresh}
    >
      <div ref={rootRef} className={`${styles.root}${compact ? ` ${styles.rootCompact}` : ''}`}>
        <NoteList
          notes={notes}
          selectedId={selectedId}
          onSelect={selectNote}
          onCreate={handleCreate}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
        />
        <NoteEditor
          ref={editorRef}
          note={currentNote}
          loading={loadingNote}
          onSave={handleEditorSave}
        />
      </div>
    </NoteActions>
  );
}

export function activate(ctx: MiniAppFrontendContext): MiniAppFrontendActivation {
  const root = createRoot(ctx.root);
  root.render(
    <WindowIdProvider windowId={ctx.windowId}>
      <MiniAppIdProvider miniAppId={ctx.miniAppId}>
        <NoteApp />
      </MiniAppIdProvider>
    </WindowIdProvider>,
  );

  return {
    deactivate() {
      root.unmount();
    },
  };
}
