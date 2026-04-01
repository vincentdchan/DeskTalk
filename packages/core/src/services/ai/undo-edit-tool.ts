import { writeFileSync } from 'node:fs';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { broadcastEvent } from '../messaging';
import { EditHistory, type ManagedPathResolver } from './edit-history';

const undoEditSchema = Type.Object({
  path: Type.String({
    description: 'Path to the file to restore. Absolute or user-home-relative.',
  }),
});

type UndoEditParams = {
  path: string;
};

interface UndoEditToolOptions {
  editHistory: EditHistory;
  resolvePath: ManagedPathResolver;
}

export function createUndoEditTool(options: UndoEditToolOptions): ToolDefinition {
  const { editHistory, resolvePath } = options;

  return {
    name: 'undo_edit',
    label: 'Undo Edit',
    description: 'Restore the previous saved version of a managed file.',
    promptSnippet: 'Undo the last managed file edit.',
    promptGuidelines: ['Use the same file path that was edited earlier.'],
    parameters: undoEditSchema,
    async execute(_toolCallId, params) {
      const input = params as UndoEditParams;
      const absolutePath = resolvePath(input.path);
      const restoredContent = await editHistory.undo(absolutePath);
      if (restoredContent === null) {
        throw new Error(`Nothing to undo for ${input.path}`);
      }

      writeFileSync(absolutePath, restoredContent, 'utf-8');
      broadcastEvent('preview', 'preview.file-changed', {
        filePath: absolutePath,
        content: restoredContent,
      });
      if (absolutePath.replace(/\\/g, '/').includes('/.data/liveapps/')) {
        broadcastEvent('preview', 'liveapps.changed', {
          path: absolutePath,
          reason: 'undo',
        });
      }

      const payload = { ok: true, path: absolutePath, contentLength: restoredContent.length };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        details: payload,
      };
    },
  };
}
