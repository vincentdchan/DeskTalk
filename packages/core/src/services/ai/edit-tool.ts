import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import { broadcastEvent } from '../messaging';
import { EditHistory, type ManagedPathResolver } from './edit-history';

const editSchema = Type.Object({
  path: Type.String({ description: 'Path to the file to edit. Absolute or user-home-relative.' }),
  oldText: Type.String({ description: 'Exact text to replace. Multi-line text is supported.' }),
  newText: Type.String({ description: 'Replacement text. Multi-line text is supported.' }),
});

type EditParams = {
  path: string;
  oldText: string;
  newText: string;
};

interface EditToolOptions {
  editHistory: EditHistory;
  resolvePath: ManagedPathResolver;
}

function countOccurrences(content: string, needle: string): number {
  if (!needle) {
    return 0;
  }

  let count = 0;
  let searchIndex = 0;
  while (true) {
    const matchIndex = content.indexOf(needle, searchIndex);
    if (matchIndex === -1) {
      return count;
    }
    count += 1;
    searchIndex = matchIndex + needle.length;
  }
}

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
  const allOldLines = oldContent.split('\n');
  const allNewLines = newContent.split('\n');
  const contextStart = Math.max(0, firstChangedLine - 4);

  const lines: string[] = [];
  lines.push(
    `@@ -${firstChangedLine},${oldLines.length} +${firstChangedLine},${newLines.length} @@`,
  );

  for (let index = contextStart; index < firstChangedLine - 1; index += 1) {
    lines.push(` ${allOldLines[index]}`);
  }
  for (const line of oldLines) {
    lines.push(`-${line}`);
  }
  for (const line of newLines) {
    lines.push(`+${line}`);
  }

  const afterStart = firstChangedLine - 1 + oldLines.length;
  const afterEnd = Math.min(allNewLines.length, afterStart + 3);
  for (let index = afterStart; index < afterEnd; index += 1) {
    if (allNewLines[index] !== undefined) {
      lines.push(` ${allNewLines[index]}`);
    }
  }

  return { diff: lines.join('\n'), firstChangedLine };
}

export function createEditTool(options: EditToolOptions): ToolDefinition {
  const { editHistory, resolvePath } = options;

  return {
    name: 'edit',
    label: 'Edit File',
    description:
      'Edit a managed file by replacing one exact text match with new text. Supports multi-line replacements and persistent undo/redo history.',
    promptSnippet: 'Edit a managed file with exact text replacement.',
    promptGuidelines: [
      'Use this after discovering the target file path from a Preview Get State action or another trusted source.',
      'Read the file first so you can provide an exact oldText match.',
      'oldText must match exactly once or the tool will fail.',
      'Call `read_manual` with `page: "editing/preview"` when editing an existing Preview document.',
    ],
    parameters: editSchema,
    async execute(_toolCallId, params) {
      const input = params as EditParams;
      if (!input.oldText) {
        throw new Error('oldText must not be empty.');
      }

      const absolutePath = resolvePath(input.path);
      if (!existsSync(absolutePath)) {
        throw new Error(`File not found: ${input.path}`);
      }

      const currentContent = readFileSync(absolutePath, 'utf-8');
      const occurrenceCount = countOccurrences(currentContent, input.oldText);
      if (occurrenceCount === 0) {
        throw new Error('oldText was not found in the file.');
      }
      if (occurrenceCount > 1) {
        throw new Error(`oldText matched ${occurrenceCount} times; provide a unique match.`);
      }

      const matchIndex = currentContent.indexOf(input.oldText);
      const nextContent =
        currentContent.slice(0, matchIndex) +
        input.newText +
        currentContent.slice(matchIndex + input.oldText.length);

      await editHistory.recordEdit(absolutePath, currentContent, nextContent);
      writeFileSync(absolutePath, nextContent, 'utf-8');

      broadcastEvent('preview', 'preview.file-changed', {
        filePath: absolutePath,
        content: nextContent,
      });
      if (absolutePath.replace(/\\/g, '/').includes('/.data/liveapps/')) {
        broadcastEvent('preview', 'liveapps.changed', {
          path: absolutePath,
          reason: 'edited',
        });
      }

      const { diff, firstChangedLine } = computeDiff(
        currentContent,
        nextContent,
        input.oldText,
        input.newText,
        matchIndex,
      );

      const payload = {
        ok: true,
        path: absolutePath,
        firstChangedLine,
        diff,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        details: payload,
      };
    },
  };
}
