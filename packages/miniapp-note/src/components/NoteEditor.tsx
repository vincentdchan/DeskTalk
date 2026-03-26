import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import type { Note } from '../types';
import styles from '../styles/NoteApp.module.css';
import '@desktalk/ui';

/**
 * Public handle exposed by NoteEditor via ref.
 * Used by NoteActions for AI-driven editing.
 */
export interface NoteEditorHandle {
  /** Get the current markdown content (front matter stripped). */
  getMarkdown(): string | null;
  /** Replace all editor content with new markdown. */
  setMarkdown(markdown: string): void;
  /** Get the 1-indexed line number of the cursor. */
  getCursorLine(): number;
  /** Get the currently selected text (empty string if none). */
  getSelectedText(): string;
}

interface NoteEditorProps {
  note: Note | null;
  loading: boolean;
  onSave: (content: string) => void;
}

/**
 * Strip YAML front matter from raw content, returning just the body.
 */
function stripFrontMatter(raw: string): string {
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return match ? match[1] : raw;
}

/**
 * NoteEditor uses <dt-markdown-editor> custom element.
 * Shows a placeholder when no note is selected.
 */
export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  { note, loading, onSave },
  ref,
) {
  const editorRef = useRef<HTMLElement & { value: string }>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Set initial value when note changes
  useEffect(() => {
    if (editorRef.current && note) {
      const bodyContent = stripFrontMatter(note.content);
      editorRef.current.value = bodyContent;
    }
  }, [note?.id]);

  // Listen for dt-change events
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleChange = (e: Event) => {
      const detail = (e as CustomEvent<{ value: string }>).detail;
      if (!detail) return;

      // Debounced auto-save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus('saving');
      saveTimerRef.current = setTimeout(() => {
        onSaveRef.current(detail.value);
        setSaveStatus('saved');
      }, 500);
    };

    editor.addEventListener('dt-change', handleChange);
    return () => editor.removeEventListener('dt-change', handleChange);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Expose editor handle to parent via ref
  useImperativeHandle(
    ref,
    () => ({
      getMarkdown(): string | null {
        return editorRef.current?.value ?? null;
      },
      setMarkdown(markdown: string): void {
        if (editorRef.current) {
          editorRef.current.value = markdown;
        }
      },
      getCursorLine(): number {
        // dt-markdown-editor doesn't expose cursor position API
        // Return 1 as fallback
        return 1;
      },
      getSelectedText(): string {
        // dt-markdown-editor doesn't expose selection API
        // Return empty string as fallback
        return '';
      },
    }),
    [],
  );

  if (!note) {
    return (
      <div className={styles.editorPanel}>
        <div className={styles.editorPlaceholder}>
          {loading ? 'Loading...' : 'Select a note or create a new one'}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.editorPanel}>
      <div className={styles.editorHeader}>
        <div>
          <div className={styles.editorTitle}>{note.title}</div>
          {note.tags.length > 0 && (
            <div className={styles.editorTags}>
              {note.tags.map((tag) => (
                <span key={tag} className={styles.editorTag}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className={saveStatus === 'saving' ? styles.saveStatusSaving : styles.saveStatus}>
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : ''}
        </span>
      </div>
      <div className={styles.editorBody}>
        <dt-markdown-editor
          ref={editorRef}
          placeholder="Start writing..."
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
});
