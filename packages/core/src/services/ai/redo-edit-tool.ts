import { writeFileSync } from 'node:fs';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { broadcastEvent } from '../messaging';
import { EditHistory, type ManagedPathResolver } from './edit-history';

const redoEditSchema = Type.Object({
  path: Type.String({
    description: 'Path to the file to restore. Absolute or user-home-relative.',
  }),
});

type RedoEditParams = {
  path: string;
};

interface RedoEditToolOptions {
  editHistory: EditHistory;
  resolvePath: ManagedPathResolver;
}

export function createRedoEditTool(options: RedoEditToolOptions): ToolDefinition {
  const { editHistory, resolvePath } = options;

  return {
    name: 'redo_edit',
    label: 'Redo Edit',
    description: 'Re-apply the next saved version of a managed file.',
    promptSnippet: 'Redo the last undone managed file edit.',
    promptGuidelines: ['Use the same file path that was edited earlier.'],
    parameters: redoEditSchema,
    async execute(_toolCallId, params) {
      const input = params as RedoEditParams;
      const absolutePath = resolvePath(input.path);
      const restoredContent = editHistory.redo(absolutePath);
      if (restoredContent === null) {
        throw new Error(`Nothing to redo for ${input.path}`);
      }

      writeFileSync(absolutePath, restoredContent, 'utf-8');
      broadcastEvent('preview', 'preview.file-changed', {
        filePath: absolutePath,
        content: restoredContent,
      });
      if (absolutePath.replace(/\\/g, '/').includes('/.data/liveapps/')) {
        broadcastEvent('preview', 'liveapps.changed', {
          path: absolutePath,
          reason: 'redo',
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
