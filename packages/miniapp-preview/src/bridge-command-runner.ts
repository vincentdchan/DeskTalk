import { spawn } from 'node:child_process';
import { relative, resolve, sep } from 'node:path';
import type { PreviewBridgeExecResult } from './types';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_ARGS = 64;
const MAX_ARG_LENGTH = 2_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

export interface RunBridgeCommandInput {
  program: string;
  args: string[];
  cwd?: string;
  workspaceRoot: string;
}

function assertText(value: string, label: string): string {
  if (!value || typeof value !== 'string') {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} contains unsupported control characters.`);
  }
  return value;
}

function resolveSafeCwd(workspaceRoot: string, cwd?: string): string {
  if (!cwd) return workspaceRoot;
  const requested = assertText(cwd, 'cwd');
  const resolved = resolve(workspaceRoot, requested);
  const rel = relative(workspaceRoot, resolved);
  if (rel.startsWith('..') || rel === '..' || rel.includes(`..${sep}`)) {
    throw new Error('cwd must stay inside the workspace root.');
  }
  return resolved;
}

export function validateExecInput(input: {
  program: string;
  args?: string[];
  timeoutMs?: number;
  cwd?: string;
}): { program: string; args: string[]; timeoutMs: number; cwd?: string } {
  const program = assertText(input.program, 'program');
  if (/\s/.test(program)) {
    throw new Error('program must not contain whitespace; pass parameters via args.');
  }
  if (program.startsWith('/')) {
    throw new Error('absolute program paths are not allowed.');
  }

  const args = Array.isArray(input.args) ? input.args : [];
  if (args.length > MAX_ARGS) {
    throw new Error(`Too many args; maximum is ${MAX_ARGS}.`);
  }

  for (const arg of args) {
    assertText(arg, 'arg');
    if (arg.length > MAX_ARG_LENGTH) {
      throw new Error(`Args must be ${MAX_ARG_LENGTH} characters or shorter.`);
    }
  }

  const timeoutMs = Math.min(
    MAX_TIMEOUT_MS,
    Math.max(
      1_000,
      typeof input.timeoutMs === 'number' ? Math.floor(input.timeoutMs) : DEFAULT_TIMEOUT_MS,
    ),
  );

  return {
    program,
    args,
    timeoutMs,
    cwd: input.cwd,
  };
}

export async function runBridgeCommand(
  input: RunBridgeCommandInput,
  timeoutMs: number,
): Promise<PreviewBridgeExecResult> {
  const cwd = resolveSafeCwd(input.workspaceRoot, input.cwd);

  return new Promise((resolvePromise, reject) => {
    const child = spawn(input.program, input.args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        LANG: process.env.LANG ?? 'en_US.UTF-8',
      },
    });

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const finish = (result: PreviewBridgeExecResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    const append = (
      chunk: Buffer,
      current: string,
      currentBytes: number,
    ): { text: string; bytes: number } => {
      if (currentBytes >= MAX_OUTPUT_BYTES) {
        truncated = true;
        return { text: current, bytes: currentBytes };
      }

      const remaining = MAX_OUTPUT_BYTES - currentBytes;
      const nextChunk = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
      if (nextChunk.byteLength !== chunk.byteLength) {
        truncated = true;
      }
      return {
        text: current + nextChunk.toString('utf8'),
        bytes: currentBytes + nextChunk.byteLength,
      };
    };

    child.stdout.on('data', (chunk: Buffer) => {
      const next = append(chunk, stdout, stdoutBytes);
      stdout = next.text;
      stdoutBytes = next.bytes;
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const next = append(chunk, stderr, stderrBytes);
      stderr = next.text;
      stderrBytes = next.bytes;
    });

    child.on('error', (error) => {
      fail(error);
    });

    child.on('close', (exitCode) => {
      finish({
        ok: !timedOut && exitCode === 0,
        exitCode,
        stdout,
        stderr,
        timedOut,
        truncated,
        command: {
          program: input.program,
          args: input.args,
          cwd,
        },
      });
    });

    const timer = setTimeout(() => {
      timedOut = true;
      truncated = true;
      child.kill('SIGTERM');
    }, timeoutMs);
  });
}
