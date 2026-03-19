import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runBridgeCommand, validateExecInput } from './bridge-command-runner';

describe('validateExecInput', () => {
  it('fills defaults and clamps timeout', () => {
    expect(validateExecInput({ program: 'git' })).toEqual({
      program: 'git',
      args: [],
      timeoutMs: 10_000,
      cwd: undefined,
    });

    expect(validateExecInput({ program: 'git', timeoutMs: 50 }).timeoutMs).toBe(1_000);
    expect(validateExecInput({ program: 'git', timeoutMs: 99_999 }).timeoutMs).toBe(30_000);
  });

  it('rejects invalid programs', () => {
    expect(() => validateExecInput({ program: '' })).toThrow('program must be a non-empty string');
    expect(() => validateExecInput({ program: 'git status' })).toThrow(
      'must not contain whitespace',
    );
    expect(() => validateExecInput({ program: '/bin/git' })).toThrow('absolute program paths');
    expect(() => validateExecInput({ program: 'git\n' })).toThrow('control characters');
  });

  it('rejects invalid args', () => {
    expect(() =>
      validateExecInput({
        program: 'git',
        args: Array.from({ length: 65 }, (_, index) => String(index)),
      }),
    ).toThrow('Too many args');

    expect(() => validateExecInput({ program: 'git', args: ['x'.repeat(2001)] })).toThrow(
      '2000 characters or shorter',
    );

    expect(() => validateExecInput({ program: 'git', args: ['bad\u0000arg'] })).toThrow(
      'control characters',
    );
  });
});

describe('runBridgeCommand', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'desktalk-preview-runner-'));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('executes a command inside the workspace root', async () => {
    const expectedCwd = await realpath(workspaceRoot);
    const result = await runBridgeCommand(
      {
        program: 'node',
        args: ['-e', 'process.stdout.write(process.cwd())'],
        workspaceRoot,
      },
      5_000,
    );

    expect(result.ok).toBe(true);
    expect(result.stdout).toBe(expectedCwd);
    expect(await realpath(result.command.cwd)).toBe(expectedCwd);
  });

  it('supports relative cwd inside the workspace', async () => {
    const nestedDir = join(workspaceRoot, 'nested');
    await mkdir(nestedDir);
    const expectedCwd = await realpath(nestedDir);

    const result = await runBridgeCommand(
      {
        program: 'node',
        args: ['-e', 'process.stdout.write(process.cwd())'],
        cwd: 'nested',
        workspaceRoot,
      },
      5_000,
    );

    expect(result.ok).toBe(true);
    expect(result.stdout).toBe(expectedCwd);
    expect(await realpath(result.command.cwd)).toBe(expectedCwd);
  });

  it('rejects cwd that escapes the workspace', async () => {
    await expect(
      runBridgeCommand(
        {
          program: 'node',
          args: ['-e', 'process.stdout.write("nope")'],
          cwd: '../outside',
          workspaceRoot,
        },
        5_000,
      ),
    ).rejects.toThrow('cwd must stay inside the workspace root');
  });

  it('captures stderr and non-zero exit codes', async () => {
    const result = await runBridgeCommand(
      {
        program: 'node',
        args: ['-e', 'process.stderr.write("boom"); process.exit(7)'],
        workspaceRoot,
      },
      5_000,
    );

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(7);
    expect(result.stderr).toBe('boom');
    expect(result.timedOut).toBe(false);
  });

  it('truncates oversized output', async () => {
    const result = await runBridgeCommand(
      {
        program: 'node',
        args: ['-e', 'process.stdout.write("a".repeat(70_000))'],
        workspaceRoot,
      },
      5_000,
    );

    expect(result.ok).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.stdout.length).toBe(64 * 1024);
  });

  it('times out long-running commands', async () => {
    const result = await runBridgeCommand(
      {
        program: 'node',
        args: ['-e', 'setTimeout(() => process.stdout.write("late"), 2000)'],
        workspaceRoot,
      },
      150,
    );

    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.truncated).toBe(true);
  });
});
