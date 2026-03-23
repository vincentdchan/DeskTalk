import type { MiniAppManifest, MiniAppContext, MiniAppBackendActivation } from '@desktalk/sdk';
import { isAbsolute, join } from 'node:path';
import type {
  TerminalTab,
  TerminalOutputEvent,
  TerminalExitEvent,
  TerminalConfirmEvent,
} from './types';
import { analyzeCommand } from './safety-analyzer';

// ─── Manifest ────────────────────────────────────────────────────────────────

export const manifest: MiniAppManifest = {
  id: 'terminal',
  name: 'Terminal',
  icon: '🖥️',
  version: '0.1.0',
  description: 'Terminal emulator with multi-tab support and command safety analysis',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface PtySession {
  tab: TerminalTab;
  pty: import('node-pty').IPty;
  scrollback: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_SCROLLBACK_LINES = 5000;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

function resolveCwd(root: string, cwd?: string): string {
  if (!cwd || cwd === '.') {
    return root;
  }

  return isAbsolute(cwd) ? cwd : join(root, cwd);
}

function generateId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function detectShell(): string {
  return process.env.SHELL || '/bin/bash';
}

// ─── Activate ────────────────────────────────────────────────────────────────

export function activate(ctx: MiniAppContext): MiniAppBackendActivation {
  ctx.logger.info('Terminal MiniApp activated');

  const sessions = new Map<string, PtySession>();
  const pendingConfirms = new Map<string, { command: string; tabId: string }>();

  /** Load node-pty dynamically (it's a native module). */
  let ptyModule: typeof import('node-pty') | null = null;
  async function loadPty(): Promise<typeof import('node-pty')> {
    if (!ptyModule) {
      ptyModule = await import('node-pty');
    }
    return ptyModule;
  }

  /** Append data to a session's scrollback buffer. */
  function appendScrollback(session: PtySession, data: string): void {
    const lines = data.split('\n');
    session.scrollback.push(...lines);
    // Trim to max
    if (session.scrollback.length > MAX_SCROLLBACK_LINES) {
      session.scrollback.splice(0, session.scrollback.length - MAX_SCROLLBACK_LINES);
    }
  }

  /** Get the last N lines from scrollback. */
  function getScrollbackLines(session: PtySession, lines: number): string {
    const start = Math.max(0, session.scrollback.length - lines);
    return session.scrollback.slice(start).join('\n');
  }

  // ─── terminal.create ────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ label?: string; cwd?: string }, { tabId: string }>(
    'terminal.create',
    async (req) => {
      const nodePty = await loadPty();
      const tabId = generateId();
      const shell = detectShell();
      const homeDir = ctx.paths.home || process.env.HOME || '/';
      const cwd = resolveCwd(homeDir, req.cwd);
      const label = req.label || shell.split('/').pop() || 'shell';

      const pty = nodePty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        cwd,
        env: { ...process.env } as Record<string, string>,
      });

      const tab: TerminalTab = {
        tabId,
        label,
        cwd,
        pid: pty.pid,
        running: true,
        createdAt: new Date().toISOString(),
      };

      const session: PtySession = { tab, pty, scrollback: [] };
      sessions.set(tabId, session);

      // Stream PTY output to frontend
      pty.onData((data: string) => {
        appendScrollback(session, data);
        const event: TerminalOutputEvent = { tabId, data };
        ctx.messaging.emit('terminal.output', event);
      });

      pty.onExit(({ exitCode }: { exitCode: number }) => {
        session.tab.running = false;
        const event: TerminalExitEvent = { tabId, exitCode };
        ctx.messaging.emit('terminal.exit', event);
        ctx.logger.info(`PTY exited: tabId=${tabId}, exitCode=${exitCode}`);
      });

      ctx.logger.info(`Created PTY: tabId=${tabId}, shell=${shell}, cwd=${cwd}, pid=${pty.pid}`);
      return { tabId };
    },
  );

  // ─── terminal.input ─────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ tabId: string; data: string }, void>('terminal.input', async (req) => {
    const session = sessions.get(req.tabId);
    if (!session) throw new Error(`Terminal tab not found: ${req.tabId}`);
    if (!session.tab.running) throw new Error(`Terminal tab is not running: ${req.tabId}`);
    session.pty.write(req.data);
  });

  // ─── terminal.resize ───────────────────────────────────────────────────

  ctx.messaging.onCommand<{ tabId: string; cols: number; rows: number }, void>(
    'terminal.resize',
    async (req) => {
      const session = sessions.get(req.tabId);
      if (!session) throw new Error(`Terminal tab not found: ${req.tabId}`);
      session.pty.resize(req.cols, req.rows);
    },
  );

  // ─── terminal.close ─────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ tabId: string }, void>('terminal.close', async (req) => {
    const session = sessions.get(req.tabId);
    if (!session) throw new Error(`Terminal tab not found: ${req.tabId}`);

    try {
      session.pty.kill();
    } catch {
      // Already dead — ignore
    }
    sessions.delete(req.tabId);
    ctx.logger.info(`Closed PTY: tabId=${req.tabId}`);
  });

  // ─── terminal.list ──────────────────────────────────────────────────────

  ctx.messaging.onCommand<void, TerminalTab[]>('terminal.list', async () => {
    return Array.from(sessions.values()).map((s) => s.tab);
  });

  // ─── terminal.getOutput ─────────────────────────────────────────────────

  ctx.messaging.onCommand<{ tabId: string; lines?: number }, { output: string }>(
    'terminal.getOutput',
    async (req) => {
      const session = sessions.get(req.tabId);
      if (!session) throw new Error(`Terminal tab not found: ${req.tabId}`);
      const lines = req.lines ?? 50;
      return { output: getScrollbackLines(session, lines) };
    },
  );

  // ─── terminal.execute ───────────────────────────────────────────────────

  ctx.messaging.onCommand<
    { tabId: string; command: string },
    { accepted: boolean; reason?: string }
  >('terminal.execute', async (req) => {
    const session = sessions.get(req.tabId);
    if (!session) throw new Error(`Terminal tab not found: ${req.tabId}`);
    if (!session.tab.running) throw new Error(`Terminal tab is not running: ${req.tabId}`);

    const analysis = analyzeCommand(req.command);
    ctx.logger.info(
      `Safety analysis: tabId=${req.tabId} command="${req.command}" level=${analysis.level}`,
    );

    if (analysis.level === 'block') {
      return { accepted: false, reason: analysis.reason };
    }

    if (analysis.level === 'warn') {
      // Emit a confirmation request to the frontend
      const requestId = generateId();
      pendingConfirms.set(requestId, { command: req.command, tabId: req.tabId });
      const event: TerminalConfirmEvent = {
        tabId: req.tabId,
        command: req.command,
        risk: analysis.reason || 'Potentially dangerous command',
        requestId,
      };
      ctx.messaging.emit('terminal.confirm', event);
      // Return accepted: true to indicate the command is pending user confirmation
      // The actual execution happens when the user confirms via terminal.confirmResponse
      return { accepted: true, reason: 'Awaiting user confirmation' };
    }

    // Safe — execute directly
    session.pty.write(req.command + '\n');
    return { accepted: true };
  });

  // ─── terminal.confirmResponse ───────────────────────────────────────────

  ctx.messaging.onCommand<{ requestId: string; confirmed: boolean }, void>(
    'terminal.confirmResponse',
    async (req) => {
      const pending = pendingConfirms.get(req.requestId);
      if (!pending) throw new Error(`No pending confirmation: ${req.requestId}`);
      pendingConfirms.delete(req.requestId);

      if (req.confirmed) {
        const session = sessions.get(pending.tabId);
        if (session && session.tab.running) {
          session.pty.write(pending.command + '\n');
          ctx.logger.info(
            `User confirmed dangerous command: tabId=${pending.tabId} command="${pending.command}"`,
          );
        }
      } else {
        ctx.logger.info(
          `User cancelled dangerous command: tabId=${pending.tabId} command="${pending.command}"`,
        );
      }
    },
  );

  return {};
}

export function deactivate(): void {
  // Child process cleanup — node-pty processes are killed when the
  // child process exits (handled by BackendProcessManager).
}
