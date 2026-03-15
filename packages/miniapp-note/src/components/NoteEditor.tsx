import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Crepe } from '@milkdown/crepe';
import { MilkdownProvider, Milkdown, useEditor } from '@milkdown/react';
import { replaceAll } from '@milkdown/kit/utils';
import { editorViewCtx } from '@milkdown/kit/core';
import type { Note } from '../types';
import styles from '../styles/NoteApp.module.css';

// Import Crepe dark theme CSS — individual files, skipping latex (KaTeX fonts)
import '@milkdown/crepe/theme/common/prosemirror.css';
import '@milkdown/crepe/theme/common/reset.css';
import '@milkdown/crepe/theme/common/block-edit.css';
import '@milkdown/crepe/theme/common/code-mirror.css';
import '@milkdown/crepe/theme/common/cursor.css';
import '@milkdown/crepe/theme/common/image-block.css';
import '@milkdown/crepe/theme/common/link-tooltip.css';
import '@milkdown/crepe/theme/common/list-item.css';
import '@milkdown/crepe/theme/common/placeholder.css';
import '@milkdown/crepe/theme/common/toolbar.css';
import '@milkdown/crepe/theme/common/table.css';
import '@milkdown/crepe/theme/frame-dark.css';

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
 * Inner editor component that lives inside <MilkdownProvider>.
 * Manages the Milkdown Crepe instance lifecycle.
 */
const EditorInner = forwardRef<NoteEditorHandle, { note: Note; onSave: (content: string) => void }>(
  function EditorInner({ note, onSave }, ref) {
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
    const onSaveRef = useRef(onSave);
    onSaveRef.current = onSave;

    // We need the raw body (without front matter) for the editor.
    // The backend returns content with front matter included. Strip it.
    const bodyContent = stripFrontMatter(note.content);

    const crepeRef = useRef<Crepe | null>(null);

    useEditor(
      (root) => {
        const crepe = new Crepe({
          root,
          defaultValue: bodyContent,
          features: {
            [Crepe.Feature.CodeMirror]: false,
            [Crepe.Feature.Latex]: false,
            [Crepe.Feature.ImageBlock]: false,
          },
        });

        crepe.on((listener) => {
          listener.markdownUpdated((_ctx, markdown) => {
            // Debounced auto-save
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            setSaveStatus('saving');
            saveTimerRef.current = setTimeout(() => {
              onSaveRef.current(markdown);
              setSaveStatus('saved');
            }, 500);
          });
        });

        crepeRef.current = crepe;
        return crepe;
      },
      [note.id],
    ); // Recreate editor when note changes

    // Expose editor handle to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        getMarkdown(): string | null {
          if (!crepeRef.current) return null;
          return crepeRef.current.getMarkdown();
        },
        setMarkdown(markdown: string): void {
          if (!crepeRef.current) return;
          crepeRef.current.editor.action(replaceAll(markdown));
        },
        getCursorLine(): number {
          if (!crepeRef.current) return 1;
          return crepeRef.current.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const { selection } = view.state;
            // Get all text before cursor, count newlines to derive 1-indexed line
            const textBefore = view.state.doc.textBetween(0, selection.from, '\n');
            return textBefore.split('\n').length;
          });
        },
        getSelectedText(): string {
          if (!crepeRef.current) return '';
          return crepeRef.current.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const { selection } = view.state;
            if (selection.empty) return '';
            return view.state.doc.textBetween(selection.from, selection.to, '\n');
          });
        },
      }),
      [],
    );

    // Cleanup timers on unmount
    useEffect(() => {
      return () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      };
    }, []);

    return (
      <>
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
          <Milkdown />
        </div>
      </>
    );
  },
);

/**
 * Strip YAML front matter from raw content, returning just the body.
 */
function stripFrontMatter(raw: string): string {
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return match ? match[1] : raw;
}

/**
 * NoteEditor wraps Milkdown in a MilkdownProvider.
 * Shows a placeholder when no note is selected.
 */
export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  { note, loading, onSave },
  ref,
) {
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
      <MilkdownProvider>
        <EditorInner key={note.id} ref={ref} note={note} onSave={onSave} />
      </MilkdownProvider>
    </div>
  );
});
