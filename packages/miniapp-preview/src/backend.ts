import type { MiniAppManifest, MiniAppContext, MiniAppBackendActivation } from '@desktalk/sdk';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  PreviewFile,
  SiblingList,
  SiblingEntry,
  PreviewBridgeConfirmPayload,
  PreviewBridgeExecPayload,
  PreviewBridgeExecResponse,
  PreviewBridgeRequestPayload,
  PreviewBridgeRequestResult,
  PreviewBridgeStoragePayload,
  PreviewBridgeStorageResult,
  StreamedHtmlSnapshot,
} from './types';
import { analyzeProgram, formatCommand } from './bridge-safety';
import { runBridgeCommand, validateExecInput } from './bridge-command-runner';
import { runBridgeRequest, validateBridgeRequestInput } from './bridge-request';
import { LiveAppStorage } from './bridge-storage';
import {
  fileName,
  getMimeType,
  isSupported,
  loadStreamedHtml,
  parentDir,
  parseImageDimensions,
  saveStreamedHtml,
} from './backend-helpers';

// ─── Manifest ────────────────────────────────────────────────────────────────

export const manifest: MiniAppManifest = {
  id: 'preview',
  name: 'Preview',
  icon: '\uD83D\uDDBC\uFE0F',
  version: '0.1.0',
  description: 'Viewer for images and HTML files',
  fileAssociations: {
    extensions: ['.jpg', '.jpeg', '.png', '.webp', '.html', '.htm'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'text/html'],
  },
};

// ─── Activate ────────────────────────────────────────────────────────────────

export function activate(ctx: MiniAppContext): MiniAppBackendActivation {
  ctx.logger.info('Preview MiniApp activated');
  const workspaceRoot = process.cwd();
  const liveAppStorage = new LiveAppStorage(ctx.paths.home);
  const bridgeSessions = new Map<string, string>();
  const pendingExecConfirms = new Map<
    string,
    { program: string; args: string[]; cwd?: string; timeoutMs: number }
  >();
  let activeBridgeExecs = 0;
  let activeBridgeRequests = 0;

  function generateId(): string {
    return `preview-bridge-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function assertAuthorizedBridgeSession(streamId: string, token: string): void {
    const expectedToken = bridgeSessions.get(streamId);
    if (!expectedToken || expectedToken !== token) {
      throw new Error('Preview bridge session is not authorized for this stream.');
    }
  }

  async function executeBridgeCommand(
    program: string,
    args: string[],
    cwd: string | undefined,
    timeoutMs: number,
  ) {
    if (activeBridgeExecs >= 10) {
      throw new Error('Too many bridge commands are already running.');
    }

    activeBridgeExecs += 1;
    try {
      return await runBridgeCommand({ program, args, cwd, workspaceRoot }, timeoutMs);
    } finally {
      activeBridgeExecs -= 1;
    }
  }

  async function executeBridgeRequest(request: PreviewBridgeRequestPayload['request']) {
    if (activeBridgeRequests >= 30) {
      throw new Error('Too many bridge requests are already running.');
    }

    activeBridgeRequests += 1;
    try {
      return await runBridgeRequest(validateBridgeRequestInput(request));
    } finally {
      activeBridgeRequests -= 1;
    }
  }

  /**
   * Build a PreviewFile from a file path.
   */
  async function buildPreviewFile(path: string): Promise<PreviewFile> {
    const name = fileName(path);
    const mimeType = getMimeType(name);
    if (!mimeType) {
      throw new Error(`Unsupported format: ${name}`);
    }

    const base64 = await ctx.fs.readFileBase64(path);
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const { width, height } = parseImageDimensions(base64, mimeType);

    return { name, path, mimeType, dataUrl, width, height };
  }

  /**
   * List supported image siblings in the same directory as the given file.
   */
  async function listSiblings(path: string): Promise<SiblingList> {
    const dir = parentDir(path);
    const entries = await ctx.fs.readDir(dir);

    const siblings: SiblingEntry[] = [];
    for (const entry of entries) {
      if (entry.type === 'file' && isSupported(entry.name)) {
        siblings.push({ name: entry.name, path: entry.path });
      }
    }

    // Sort alphabetically
    siblings.sort((a, b) => a.name.localeCompare(b.name));

    const currentIndex = siblings.findIndex((s) => s.path === path);
    return { files: siblings, currentIndex };
  }

  // ─── preview.open ─────────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ path: string }, PreviewFile>('preview.open', async (req) =>
    buildPreviewFile(req.path),
  );

  ctx.messaging.onCommand<{ streamId: string; title: string }, StreamedHtmlSnapshot | null>(
    'preview.stream.load-html',
    async (req) => {
      if (!req?.streamId || !req?.title) {
        throw new Error('streamId and title are required to load LiveApp HTML.');
      }
      return loadStreamedHtml(ctx.paths.home, req.streamId, req.title, ctx.paths.data);
    },
  );

  ctx.messaging.onCommand<
    { streamId: string; title: string; content: string },
    StreamedHtmlSnapshot
  >('preview.stream.save-html', async (req) => {
    if (!req?.streamId || !req?.title) {
      throw new Error('streamId and title are required to save LiveApp HTML.');
    }
    mkdirSync(join(ctx.paths.home, '.data', 'liveapps'), { recursive: true });
    const snapshot = await saveStreamedHtml(
      ctx.paths.home,
      req.streamId,
      req.title,
      req.content ?? '',
    );
    ctx.messaging.emit('liveapps.changed', {
      path: snapshot.path,
      reason: 'saved',
    });
    return snapshot;
  });

  // ─── preview.siblings ─────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ path: string }, SiblingList>('preview.siblings', async (req) =>
    listSiblings(req.path),
  );

  // ─── preview.next ─────────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ currentPath: string }, PreviewFile>('preview.next', async (req) => {
    const { files, currentIndex } = await listSiblings(req.currentPath);
    if (files.length === 0) {
      throw new Error('No images in directory');
    }
    const nextIndex = (currentIndex + 1) % files.length;
    return buildPreviewFile(files[nextIndex].path);
  });

  // ─── preview.previous ─────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ currentPath: string }, PreviewFile>('preview.previous', async (req) => {
    const { files, currentIndex } = await listSiblings(req.currentPath);
    if (files.length === 0) {
      throw new Error('No images in directory');
    }
    const prevIndex = (currentIndex - 1 + files.length) % files.length;
    return buildPreviewFile(files[prevIndex].path);
  });

  ctx.messaging.onCommand<{ streamId: string; token: string }, void>(
    'preview.bridge.registerSession',
    async (req) => {
      if (!req?.streamId || !req?.token) {
        throw new Error('streamId and token are required to register a bridge session.');
      }
      bridgeSessions.set(req.streamId, req.token);
    },
  );

  ctx.messaging.onCommand<PreviewBridgeExecPayload, PreviewBridgeExecResponse>(
    'preview.bridge.exec',
    async (req) => {
      assertAuthorizedBridgeSession(req.streamId, req.token);

      const validated = validateExecInput({
        program: req.program,
        args: req.args,
        cwd: req.options?.cwd,
        timeoutMs: req.options?.timeoutMs,
      });
      const analysis = analyzeProgram(validated.program, validated.args);
      const commandPreview = formatCommand(validated.program, validated.args);
      const resolvedCwd = validated.cwd ?? '.';

      if (analysis.level === 'block') {
        return {
          status: 'rejected',
          reason: analysis.reason ?? 'Command blocked by safety policy.',
        };
      }

      if (analysis.level === 'warn') {
        const requestId = generateId();
        pendingExecConfirms.set(requestId, validated);
        return {
          status: 'requires_confirmation',
          requestId,
          reason: analysis.reason ?? 'This command may change files or system state.',
          commandPreview,
          cwd: resolvedCwd,
        };
      }

      return {
        status: 'completed',
        result: await executeBridgeCommand(
          validated.program,
          validated.args,
          validated.cwd,
          validated.timeoutMs,
        ),
      };
    },
  );

  ctx.messaging.onCommand<PreviewBridgeStoragePayload, PreviewBridgeStorageResult>(
    'preview.bridge.storage',
    async (req) => {
      assertAuthorizedBridgeSession(req.streamId, req.token);
      return liveAppStorage.execute(req.liveAppId, req.request);
    },
  );

  ctx.messaging.onCommand<PreviewBridgeRequestPayload, PreviewBridgeRequestResult>(
    'preview.bridge.request',
    async (req) => {
      assertAuthorizedBridgeSession(req.streamId, req.token);
      return executeBridgeRequest(req.request);
    },
  );

  ctx.messaging.onCommand<PreviewBridgeConfirmPayload, PreviewBridgeExecResponse>(
    'preview.bridge.exec.confirm',
    async (req) => {
      const pending = pendingExecConfirms.get(req.requestId);
      if (!pending) {
        throw new Error('No pending bridge command confirmation was found.');
      }
      pendingExecConfirms.delete(req.requestId);

      if (!req.confirmed) {
        return { status: 'cancelled', reason: 'User declined to run the command.' };
      }

      return {
        status: 'completed',
        result: await executeBridgeCommand(
          pending.program,
          pending.args,
          pending.cwd,
          pending.timeoutMs,
        ),
      };
    },
  );

  return {};
}

export function deactivate(): void {
  // cleanup
}
