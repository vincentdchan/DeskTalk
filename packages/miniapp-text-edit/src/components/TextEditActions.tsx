import React, { useCallback } from 'react';
import { ActionsProvider, Action, useCommand } from '@desktalk/sdk';
import type { TextEditFile } from '../types';

/**
 * Compute a minimal unified-diff string for a single old_text→new_text replacement.
 */
function computeDiff(
  oldContent: string,
  newContent: string,
  oldText: string,
  newText: string,
  matchIndex: number,
): { diff: string; firstChangedLine: number } {
  const linesBefore = oldContent.substring(0, matchIndex).split('\n');
  const firstChangedLine = linesBefore.length;

  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const contextStart = Math.max(0, firstChangedLine - 4);
  const allOldLines = oldContent.split('\n');
  const allNewLines = newContent.split('\n');

  const lines: string[] = [];
  lines.push(
    `@@ -${firstChangedLine},${oldLines.length} +${firstChangedLine},${newLines.length} @@`,
  );

  for (let i = contextStart; i < firstChangedLine - 1; i++) {
    lines.push(` ${allOldLines[i]}`);
  }
  for (const l of oldLines) {
    lines.push(`-${l}`);
  }
  for (const l of newLines) {
    lines.push(`+${l}`);
  }
  const afterStart = firstChangedLine - 1 + oldLines.length;
  const afterEnd = Math.min(allNewLines.length, afterStart + 3);
  for (let i = afterStart; i < afterEnd; i++) {
    if (allNewLines[i] !== undefined) {
      lines.push(` ${allNewLines[i]}`);
    }
  }

  return { diff: lines.join('\n'), firstChangedLine };
}

/** Handle exposed by TextEditApp for reading/writing editor state. */
export interface TextEditHandle {
  getContent(): string | null;
  setContent(content: string): void;
  getCursorLine(): number;
  getCursorColumn(): number;
  getSelectedText(): string;
  getTotalLines(): number;
  getLanguage(): string;
  getFilePath(): string | null;
  isDirty(): boolean;
}

interface TextEditActionsProps {
  children: React.ReactNode;
  editorHandle: TextEditHandle | null;
  currentFilePath: string | null;
  onFileOpened: (file: TextEditFile) => void;
  onSave: () => void;
}

export function TextEditActions({
  children,
  editorHandle,
  currentFilePath,
  onFileOpened,
  onSave,
}: TextEditActionsProps) {
  const openFile = useCommand<{ path: string }, TextEditFile>('textedit.open');

  // ─── Open File ───────────────────────────────────────────────────────────

  const handleOpen = useCallback(
    async (params?: Record<string, unknown>) => {
      const path = params?.path as string;
      if (!path) return { error: 'path parameter is required' };
      const file = await openFile({ path });
      onFileOpened(file);
      return { success: true, path: file.path, name: file.name };
    },
    [openFile, onFileOpened],
  );

  // ─── Get Editing Context ─────────────────────────────────────────────────

  const handleGetEditingContext = useCallback(async () => {
    if (!editorHandle || !currentFilePath) {
      return { error: 'No file is currently open' };
    }
    const content = editorHandle.getContent();
    if (content === null) {
      return { error: 'Editor is not ready' };
    }
    return {
      path: currentFilePath,
      language: editorHandle.getLanguage(),
      content,
      cursorLine: editorHandle.getCursorLine(),
      cursorColumn: editorHandle.getCursorColumn(),
      selectedText: editorHandle.getSelectedText(),
      isDirty: editorHandle.isDirty(),
      totalLines: editorHandle.getTotalLines(),
    };
  }, [editorHandle, currentFilePath]);

  // ─── Edit File ───────────────────────────────────────────────────────────

  const handleEditFile = useCallback(
    async (params?: Record<string, unknown>) => {
      if (!editorHandle || !currentFilePath) {
        return { success: false, error: 'No file is currently open' };
      }

      const oldText = params?.old_text as string | undefined;
      const newText = params?.new_text as string | undefined;
      if (oldText === undefined || newText === undefined) {
        return { success: false, error: 'Both old_text and new_text are required' };
      }

      const currentContent = editorHandle.getContent();
      if (currentContent === null) {
        return { success: false, error: 'Editor is not ready' };
      }

      // Handle empty old_text as "insert at beginning"
      let newContent: string;
      let matchIndex: number;
      if (oldText === '') {
        newContent = newText + currentContent;
        matchIndex = 0;
      } else {
        const firstIndex = currentContent.indexOf(oldText);
        if (firstIndex === -1) {
          return { success: false, error: 'Text not found in file' };
        }

        // Check for multiple matches
        const secondIndex = currentContent.indexOf(oldText, firstIndex + 1);
        if (secondIndex !== -1) {
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

        newContent =
          currentContent.substring(0, firstIndex) +
          newText +
          currentContent.substring(firstIndex + oldText.length);
        matchIndex = firstIndex;
      }

      // Apply the edit via the editor handle (preserves undo stack)
      editorHandle.setContent(newContent);

      const { diff, firstChangedLine } = computeDiff(
        currentContent,
        newContent,
        oldText,
        newText,
        matchIndex,
      );
      return { success: true, diff, firstChangedLine };
    },
    [editorHandle, currentFilePath],
  );

  // ─── Save ────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!editorHandle || !currentFilePath) {
      return { error: 'No file is currently open' };
    }
    onSave();
    return { success: true };
  }, [editorHandle, currentFilePath, onSave]);

  return (
    <ActionsProvider>
      <Action
        name="Open File"
        description="Open a file by path in the editor"
        params={{
          path: {
            type: 'string',
            description: 'Relative path to the file (e.g. "src/index.ts")',
            required: true,
          },
        }}
        handler={handleOpen}
      />
      <Action
        name="Get Editing Context"
        description="Return the current editor state for the open file including content, cursor position, language, and selected text"
        handler={handleGetEditingContext}
      />
      <Action
        name="Edit File"
        description="Apply a text replacement to the current file content. Use old_text to find exact text and new_text to replace it."
        params={{
          old_text: {
            type: 'string',
            description:
              'Exact text to find in the file content (must appear exactly once). Use empty string to insert at beginning.',
            required: true,
          },
          new_text: {
            type: 'string',
            description: 'Replacement text',
            required: true,
          },
        }}
        handler={handleEditFile}
      />
      <Action name="Save" description="Save the current file immediately" handler={handleSave} />
      {children}
    </ActionsProvider>
  );
}
