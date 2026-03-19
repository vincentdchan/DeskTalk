import { describe, expect, it } from 'vitest';
import { analyzeProgram, formatCommand } from './bridge-safety';

describe('formatCommand', () => {
  it('quotes args as JSON strings', () => {
    expect(formatCommand('git', ['status', '--short'])).toBe('git "status" "--short"');
  });
});

describe('analyzeProgram', () => {
  it('marks ordinary commands as safe', () => {
    expect(analyzeProgram('git', ['status'])).toEqual({ level: 'safe' });
  });

  it('blocks known destructive programs', () => {
    const result = analyzeProgram('mkfs.ext4', ['/dev/disk1']);

    expect(result.level).toBe('block');
    expect(result.reason).toContain('mkfs.ext4');
  });

  it('blocks rm against root with recursive flags', () => {
    const result = analyzeProgram('rm', ['-rf', '/']);

    expect(result.level).toBe('block');
    expect(result.reason).toContain('filesystem root');
  });

  it('warns on non-root rm commands', () => {
    const result = analyzeProgram('rm', ['-rf', 'tmp/cache']);

    expect(result.level).toBe('warn');
    expect(result.reason).toContain('rm');
  });

  it('blocks dd writes to devices', () => {
    const result = analyzeProgram('dd', ['if=/dev/zero', 'of=/dev/disk3']);

    expect(result.level).toBe('block');
    expect(result.reason).toContain('block device');
  });

  it('warns on dangerous base programs', () => {
    const result = analyzeProgram('sudo', ['whoami']);

    expect(result.level).toBe('warn');
    expect(result.reason).toContain('privileges');
  });

  it('warns on git reset/restore/clean', () => {
    expect(analyzeProgram('git', ['reset', '--hard']).level).toBe('warn');
    expect(analyzeProgram('git', ['restore', '.']).level).toBe('warn');
    expect(analyzeProgram('git', ['clean', '-fd']).level).toBe('warn');
  });

  it('normalizes absolute program paths by basename', () => {
    const result = analyzeProgram('/bin/rm', ['file.txt']);

    expect(result.level).toBe('warn');
    expect(result.reason).toContain('rm');
  });
});
