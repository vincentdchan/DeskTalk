import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCommand } from '@desktalk/sdk';
import type { Note, NoteMeta, TagCount } from './types';
import { TagFilter } from './components/TagFilter';
import { NoteList } from './components/NoteList';
import { NoteEditor } from './components/NoteEditor';
import { NoteActions } from './components/NoteActions';
import { NOTE_APP_RUNTIME_CSS, NOTE_APP_STYLE_ID } from './styles/runtime-css';
import styles from './styles/NoteApp.module.css';

function NoteApp() {
  useEffect(() => {
    if (document.getElementById(NOTE_APP_STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = NOTE_APP_STYLE_ID;
    style.textContent = NOTE_APP_RUNTIME_CSS;
    document.head.appendChild(style);
  }, []);

  // ─── State ───────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingNote, setLoadingNote] = useState(false);

  // ─── Backend commands ────────────────────────────────────────────────────
  const listNotes = useCommand<{ tag?: string }, NoteMeta[]>('notes.list');
  const getTags = useCommand<void, TagCount[]>('notes.tags');
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
      } else if (selectedTags.size > 0) {
        // Backend supports single tag filter. For multi-tag AND, we filter
        // client-side after fetching all notes for the first tag.
        const firstTag = Array.from(selectedTags)[0]!;
        const all = await listNotes({ tag: firstTag });
        result = all.filter((n) => Array.from(selectedTags).every((t) => n.tags.includes(t)));
      } else {
        result = await listNotes();
      }
      setNotes(result);
    } catch (err) {
      console.error('Failed to fetch notes:', err);
    }
  }, [listNotes, searchNotes, searchQuery, selectedTags]);

  const fetchTags = useCallback(async () => {
    try {
      const result = await getTags();
      setTags(result);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
    }
  }, [getTags]);

  const refresh = useCallback(() => {
    fetchNotes();
    fetchTags();
  }, [fetchNotes, fetchTags]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

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

  // ─── Tag toggling ───────────────────────────────────────────────────────

  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

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
        fetchTags();
      } catch (err) {
        console.error('Failed to save note:', err);
      }
    },
    [selectedId, currentNote, updateNote, fetchNotes, fetchTags],
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
      onNoteCreated={handleNoteCreated}
      onNoteDeleted={handleNoteDeleted}
      onSearch={handleSearch}
      onNoteUpdated={handleNoteUpdated}
      onRefresh={refresh}
    >
      <div className={styles.root}>
        <TagFilter tags={tags} selectedTags={selectedTags} onToggleTag={handleToggleTag} />
        <NoteList
          notes={notes}
          selectedId={selectedId}
          onSelect={selectNote}
          onCreate={handleCreate}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
        />
        <NoteEditor note={currentNote} loading={loadingNote} onSave={handleEditorSave} />
      </div>
    </NoteActions>
  );
}

export default NoteApp;
