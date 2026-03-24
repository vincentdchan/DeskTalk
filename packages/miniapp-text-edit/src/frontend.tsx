import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import * as monaco from 'monaco-editor';
import type { MiniAppFrontendContext } from '@desktalk/sdk';
import {
  useCommand,
  useWindowArgsUpdated,
  MiniAppIdProvider,
  WindowIdProvider,
} from '@desktalk/sdk';
import type { TextEditFile, SaveResult } from './types';
import type { TextEditHandle } from './components/TextEditActions';
import { TextEditActions } from './components/TextEditActions';
import { EditorTitleBar } from './components/EditorTitleBar';
import { EditorStatusBar } from './components/EditorStatusBar';
import { detectLanguage, detectLineEnding } from './lib/language';
import styles from './styles/TextEditApp.module.css';

// ─── Auto-save debounce delay (ms) ──────────────────────────────────────────

const AUTO_SAVE_DELAY = 1000;

const MONACO_WORKER_LABELS = new Set([
  'editorWorkerService',
  'json',
  'css',
  'scss',
  'less',
  'html',
  'handlebars',
  'razor',
  'typescript',
  'javascript',
]);

function getMonacoWorkerUrl(label: string): string {
  const normalizedLabel = MONACO_WORKER_LABELS.has(label) ? label : 'editorWorkerService';
  return new URL(
    `/api/miniapps/text-edit/monaco/worker/${encodeURIComponent(normalizedLabel)}`,
    window.location.origin,
  ).toString();
}

function ensureMonacoEnvironment(): void {
  const globalScope = globalThis as typeof globalThis & {
    MonacoEnvironment?: {
      getWorker?: (_workerId: string, label: string) => Worker;
    };
  };

  if (globalScope.MonacoEnvironment?.getWorker) {
    return;
  }

  globalScope.MonacoEnvironment = {
    getWorker: (_workerId: string, label: string) => {
      return new Worker(getMonacoWorkerUrl(label), {
        type: 'module',
        name: label,
      });
    },
  };
}

// ─── Saved indicator display duration (ms) ───────────────────────────────────

const SAVED_INDICATOR_DURATION = 2000;

function TextEditApp({ initialPath }: { initialPath?: string }) {
  // ─── State ───────────────────────────────────────────────────────────────

  const [currentFile, setCurrentFile] = useState<TextEditFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorColumn, setCursorColumn] = useState(1);
  const [language, setLanguage] = useState('plaintext');
  const [lineEnding, setLineEnding] = useState<'LF' | 'CRLF'>('LF');
  const [totalLines, setTotalLines] = useState(1);

  // ─── Refs ────────────────────────────────────────────────────────────────

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentFileRef = useRef<TextEditFile | null>(null);
  const isDirtyRef = useRef(false);

  // Keep refs in sync with state
  currentFileRef.current = currentFile;
  isDirtyRef.current = isDirty;

  // ─── Backend commands ────────────────────────────────────────────────────

  const openFileCmd = useCommand<{ path: string }, TextEditFile>('textedit.open');
  const saveFileCmd = useCommand<{ path: string; content: string }, SaveResult>('textedit.save');

  // ─── Save logic ──────────────────────────────────────────────────────────

  const doSave = useCallback(async () => {
    const file = currentFileRef.current;
    const editor = editorRef.current;
    if (!file || !editor) return;

    const content = editor.getValue();
    setSaveStatus('saving');
    try {
      const result = await saveFileCmd({ path: file.path, content });
      setCurrentFile((prev) => (prev ? { ...prev, modifiedAt: result.updatedAt } : prev));
      setIsDirty(false);
      setSaveStatus('saved');

      // Clear previous saved indicator timer
      if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current);
      savedIndicatorTimerRef.current = setTimeout(() => {
        setSaveStatus('idle');
      }, SAVED_INDICATOR_DURATION);
    } catch (err) {
      console.error('Failed to save file:', err);
      setSaveStatus('idle');
    }
  }, [saveFileCmd]);

  // ─── Initialize Monaco editor ────────────────────────────────────────────

  useEffect(() => {
    if (!editorContainerRef.current) return;

    ensureMonacoEnvironment();

    const editor = monaco.editor.create(editorContainerRef.current, {
      value: '',
      language: 'plaintext',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: 'on',
      bracketPairColorization: { enabled: true },
      autoIndent: 'full',
      folding: true,
      wordWrap: 'off',
      fontSize: 13,
      fontFamily: 'var(--font-mono), "Cascadia Code", "Fira Code", Menlo, Monaco, monospace',
      scrollBeyondLastLine: false,
      renderWhitespace: 'selection',
      tabSize: 2,
      insertSpaces: true,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      padding: { top: 8, bottom: 8 },
    });

    editorRef.current = editor;

    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
      setCursorLine(e.position.lineNumber);
      setCursorColumn(e.position.column);
    });

    // Track model content changes for dirty state and auto-save
    editor.onDidChangeModelContent(() => {
      setIsDirty(true);
      setTotalLines(editor.getModel()?.getLineCount() ?? 1);

      // Reset auto-save timer
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        if (isDirtyRef.current) {
          doSave();
        }
      }, AUTO_SAVE_DELAY);
    });

    // Keyboard shortcut: Cmd/Ctrl+S
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      doSave();
    });

    return () => {
      editor.dispose();
      editorRef.current = null;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current);
    };
  }, [doSave]);

  // ─── Load a file into the editor ─────────────────────────────────────────

  const loadFile = useCallback(
    async (path: string) => {
      setError(null);
      try {
        const file = await openFileCmd({ path });
        setCurrentFile(file);

        const lang = detectLanguage(file.name);
        setLanguage(lang);
        setLineEnding(detectLineEnding(file.content));
        setIsDirty(false);
        setSaveStatus('idle');

        const editor = editorRef.current;
        if (editor) {
          const model = editor.getModel();
          if (model) {
            model.setValue(file.content);
            monaco.editor.setModelLanguage(model, lang);
          }
          editor.setScrollTop(0);
          editor.setPosition({ lineNumber: 1, column: 1 });
          setTotalLines(editor.getModel()?.getLineCount() ?? 1);
          setCursorLine(1);
          setCursorColumn(1);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to open file';
        setError(message);
        setCurrentFile(null);
      }
    },
    [openFileCmd],
  );

  // ─── Auto-open file from launch arguments ────────────────────────────────

  useEffect(() => {
    if (!initialPath) return;
    loadFile(initialPath);
  }, []);

  // Handle updated args when the shell reuses this window with a new file
  useWindowArgsUpdated(
    useCallback(
      (args: Record<string, unknown>) => {
        const path = typeof args.path === 'string' ? args.path : undefined;
        if (path) loadFile(path);
      },
      [loadFile],
    ),
  );

  // ─── Build editor handle for TextEditActions ─────────────────────────────

  const editorHandle = useMemo<TextEditHandle | null>(() => {
    if (!editorRef.current) return null;
    const editor = editorRef.current;
    return {
      getContent(): string | null {
        return editor.getValue() ?? null;
      },
      setContent(content: string): void {
        const model = editor.getModel();
        if (!model) return;

        // Use executeEdits to preserve undo stack
        const fullRange = model.getFullModelRange();
        editor.executeEdits('textedit-action', [
          {
            range: fullRange,
            text: content,
            forceMoveMarkers: true,
          },
        ]);
      },
      getCursorLine(): number {
        return editor.getPosition()?.lineNumber ?? 1;
      },
      getCursorColumn(): number {
        return editor.getPosition()?.column ?? 1;
      },
      getSelectedText(): string {
        const selection = editor.getSelection();
        if (!selection || selection.isEmpty()) return '';
        return editor.getModel()?.getValueInRange(selection) ?? '';
      },
      getTotalLines(): number {
        return editor.getModel()?.getLineCount() ?? 1;
      },
      getLanguage(): string {
        return language;
      },
      getFilePath(): string | null {
        return currentFileRef.current?.path ?? null;
      },
      isDirty(): boolean {
        return isDirtyRef.current;
      },
    };
  }, [language]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <TextEditActions
      editorHandle={editorHandle}
      currentFilePath={currentFile?.path ?? null}
      onFileOpened={(file) => loadFile(file.path)}
      onSave={doSave}
    >
      <div className={styles.root}>
        {error ? (
          <div className={styles.errorState}>
            <span className={styles.errorIcon}>{'\u26A0'}</span>
            <span>{error}</span>
          </div>
        ) : !currentFile ? (
          <div className={styles.emptyState}>No file open</div>
        ) : (
          <>
            <EditorTitleBar
              filename={currentFile.name}
              isDirty={isDirty}
              saveStatus={saveStatus}
              onSave={doSave}
            />
          </>
        )}
        {/* Always in DOM so Monaco can initialise on mount */}
        <div
          ref={editorContainerRef}
          className={styles.editorContainer}
          style={{ display: currentFile && !error ? undefined : 'none' }}
        />
        {currentFile && !error && (
          <EditorStatusBar
            cursorLine={cursorLine}
            cursorColumn={cursorColumn}
            language={language}
            lineEnding={lineEnding}
            totalLines={totalLines}
          />
        )}
      </div>
    </TextEditActions>
  );
}

let root: ReturnType<typeof createRoot> | null = null;

export function activate(ctx: MiniAppFrontendContext): void {
  const initialPath = typeof ctx.args?.path === 'string' ? ctx.args.path : undefined;
  root = createRoot(ctx.root);
  root.render(
    <WindowIdProvider windowId={ctx.windowId}>
      <MiniAppIdProvider miniAppId={ctx.miniAppId}>
        <TextEditApp initialPath={initialPath} />
      </MiniAppIdProvider>
    </WindowIdProvider>,
  );
}

export function deactivate(): void {
  root?.unmount();
  root = null;
}
