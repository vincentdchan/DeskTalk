/**
 * Manages one child process per MiniApp backend.
 *
 * Each process is spawned via `child_process.fork()` and runs
 * `backend-host.js`, which imports the actual MiniApp backend module,
 * creates its context, and handles commands/events via Node IPC.
 *
 * The main process routes incoming WebSocket commands to the correct
 * child and relays events from children back to connected clients.
 */

import { fork, type ChildProcess } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { MiniAppPaths } from '@desktalk/sdk';
import type pino from 'pino';
import type { MainToChildMessage, ChildToMainMessage } from './backend-ipc';
import type { LoggerConfig } from './logger';
import { broadcastEvent } from './messaging';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Internal bookkeeping for a running child process. */
interface ManagedProcess {
  child: ChildProcess;
  miniAppId: string;
  ready: boolean;
  readyPromise: Promise<void>;
}

/** Tracks an in-flight command:invoke waiting for the child's response. */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const COMMAND_TIMEOUT_MS = 30_000;
const DEACTIVATE_TIMEOUT_MS = 5_000;

/**
 * Singleton manager that owns every backend child process.
 */
class BackendProcessManager {
  private processes = new Map<string, ManagedProcess>();
  private pendingRequests = new Map<string, PendingRequest>();
  /** Absolute path to the compiled backend-host entry file. */
  private readonly hostPath: string;
  private logger: pino.Logger | null = null;
  private loggerConfig: LoggerConfig | null = null;

  constructor() {
    this.hostPath = join(__dirname, 'backend-host.js');
  }

  /**
   * Inject the logger and its serializable config.
   * Must be called once before any spawn().
   */
  init(logger: pino.Logger, loggerConfig: LoggerConfig): void {
    this.logger = logger;
    this.loggerConfig = loggerConfig;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Spawn an isolated child process for `miniAppId` and wait until it
   * reports "ready" (i.e. the backend's activate() has returned).
   */
  async spawn(
    miniAppId: string,
    backendPath: string,
    packageRoot: string,
    paths: MiniAppPaths,
    locale: string,
  ): Promise<void> {
    if (this.processes.has(miniAppId)) {
      return; // already running
    }

    const child = fork(this.hostPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    let resolveReady!: () => void;
    let rejectReady!: (err: Error) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const managed: ManagedProcess = {
      child,
      miniAppId,
      ready: false,
      readyPromise,
    };

    this.processes.set(miniAppId, managed);

    // Relay messages from child
    child.on('message', (msg: ChildToMainMessage) => {
      this.handleChildMessage(miniAppId, msg);
      if (msg.type === 'ready') {
        managed.ready = true;
        resolveReady();
      }
    });

    child.on('exit', (code, signal) => {
      this.logger?.info({ miniAppId, code, signal }, 'child process exited');
      this.processes.delete(miniAppId);
    });

    child.on('error', (err) => {
      this.logger?.error({ miniAppId, err: err.message }, 'child process error');
      rejectReady(err);
    });

    // Forward child stdout / stderr so operator can see backend logs
    child.stdout?.on('data', (data: Buffer) => {
      process.stdout.write(`[${miniAppId}] ${data.toString()}`);
    });
    child.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`[${miniAppId}] ${data.toString()}`);
    });

    // Ask the child to activate
    const activateMsg: MainToChildMessage = {
      type: 'activate',
      miniAppId,
      backendPath,
      packageRoot,
      paths,
      locale,
      loggerConfig: this.loggerConfig!,
    };
    child.send(activateMsg);

    await readyPromise;
  }

  // ─── Command routing ────────────────────────────────────────────────────

  /**
   * Send a command to the child process that owns `miniAppId` and
   * return the result (or throw on error / timeout).
   */
  async sendCommand(miniAppId: string, command: string, data: unknown): Promise<unknown> {
    const managed = this.processes.get(miniAppId);
    if (!managed) {
      throw new Error(`No running process for miniApp: ${miniAppId}`);
    }

    if (!managed.ready) {
      await managed.readyPromise;
    }

    const requestId = `cmd-${randomUUID()}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Command timed out: ${command} (miniApp: ${miniAppId})`));
      }, COMMAND_TIMEOUT_MS);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      const msg: MainToChildMessage = {
        type: 'command:invoke',
        requestId,
        command,
        data,
      };
      managed.child.send(msg);
    });
  }

  // ─── Teardown ───────────────────────────────────────────────────────────

  /**
   * Gracefully deactivate and stop the child process for `miniAppId`.
   */
  async kill(miniAppId: string): Promise<void> {
    const managed = this.processes.get(miniAppId);
    if (!managed) {
      return;
    }

    managed.child.send({ type: 'deactivate' } as MainToChildMessage);

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        managed.child.kill();
        resolve();
      }, DEACTIVATE_TIMEOUT_MS);

      managed.child.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.processes.delete(miniAppId);
  }

  /** Check whether a child process is running for `miniAppId`. */
  isRunning(miniAppId: string): boolean {
    return this.processes.has(miniAppId);
  }

  /** Gracefully shut down every child process. */
  async killAll(): Promise<void> {
    const ids = Array.from(this.processes.keys());
    await Promise.all(ids.map((id) => this.kill(id)));
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private handleChildMessage(miniAppId: string, msg: ChildToMainMessage): void {
    switch (msg.type) {
      case 'command:response': {
        const pending = this.pendingRequests.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(msg.requestId);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.data);
          }
        }
        break;
      }
      case 'event':
        broadcastEvent(msg.miniAppId, msg.event, msg.data);
        break;
      case 'error':
        this.logger?.error({ miniAppId, err: msg.message }, 'child process reported error');
        break;
      case 'ready':
        // Handled inline in spawn()
        break;
    }
  }
}

/** Singleton process manager instance. */
export const processManager = new BackendProcessManager();
