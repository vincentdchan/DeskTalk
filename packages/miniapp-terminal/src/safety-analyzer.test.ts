import { describe, it, expect } from 'vitest';
import { analyzeCommand, tokenize, extractProgram } from './safety-analyzer';

// ─── Tokenizer ──────────────────────────────────────────────────────────────

describe('tokenize', () => {
  it('splits on semicolons', () => {
    expect(tokenize('ls; pwd')).toEqual(['ls', 'pwd']);
  });

  it('splits on &&', () => {
    expect(tokenize('ls && pwd')).toEqual(['ls', 'pwd']);
  });

  it('splits on ||', () => {
    expect(tokenize('ls || pwd')).toEqual(['ls', 'pwd']);
  });

  it('splits on pipe', () => {
    expect(tokenize('ls | grep foo')).toEqual(['ls', 'grep foo']);
  });

  it('splits on newlines', () => {
    expect(tokenize('ls\npwd')).toEqual(['ls', 'pwd']);
  });

  it('handles mixed operators', () => {
    expect(tokenize('ls; pwd && echo ok')).toEqual(['ls', 'pwd', 'echo ok']);
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('  ')).toEqual([]);
  });

  it('handles single command', () => {
    expect(tokenize('ls -la')).toEqual(['ls -la']);
  });
});

// ─── extractProgram ─────────────────────────────────────────────────────────

describe('extractProgram', () => {
  it('extracts simple program name', () => {
    expect(extractProgram('ls -la')).toBe('ls');
  });

  it('handles env var prefix', () => {
    expect(extractProgram('FOO=bar cmd arg')).toBe('cmd');
  });

  it('handles sudo prefix', () => {
    expect(extractProgram('sudo rm -rf /tmp')).toBe('rm');
  });

  it('handles env prefix', () => {
    expect(extractProgram('env VAR=1 node app.js')).toBe('node');
  });

  it('handles sudo + env prefix', () => {
    expect(extractProgram('sudo env rm -rf /tmp')).toBe('rm');
  });

  it('returns empty for empty input', () => {
    expect(extractProgram('')).toBe('');
  });
});

// ─── analyzeCommand — safe commands ─────────────────────────────────────────

describe('analyzeCommand — safe commands', () => {
  it('classifies ls as safe', () => {
    const result = analyzeCommand('ls -la');
    expect(result.level).toBe('safe');
  });

  it('classifies echo as safe', () => {
    const result = analyzeCommand('echo hello world');
    expect(result.level).toBe('safe');
  });

  it('classifies cd as safe', () => {
    const result = analyzeCommand('cd /tmp');
    expect(result.level).toBe('safe');
  });

  it('classifies cat as safe', () => {
    const result = analyzeCommand('cat /etc/hostname');
    expect(result.level).toBe('safe');
  });

  it('classifies npm install as safe', () => {
    const result = analyzeCommand('npm install lodash');
    expect(result.level).toBe('safe');
  });

  it('classifies empty input as safe', () => {
    const result = analyzeCommand('');
    expect(result.level).toBe('safe');
  });

  it('classifies git commands as safe', () => {
    const result = analyzeCommand('git status && git diff');
    expect(result.level).toBe('safe');
  });
});

// ─── analyzeCommand — warn commands ─────────────────────────────────────────

describe('analyzeCommand — warn commands', () => {
  it('warns on rm', () => {
    const result = analyzeCommand('rm file.txt');
    expect(result.level).toBe('warn');
    expect(result.reason).toContain('rm');
  });

  it('warns on rm -rf', () => {
    const result = analyzeCommand('rm -rf /tmp/cache');
    expect(result.level).toBe('warn');
  });

  it('warns on sudo rm', () => {
    const result = analyzeCommand('sudo rm -rf /tmp/old');
    expect(result.level).toBe('warn');
  });

  it('warns on chmod 777', () => {
    const result = analyzeCommand('chmod 777 /tmp/mydir');
    expect(result.level).toBe('warn');
    expect(result.reason).toContain('chmod');
  });

  it('warns on mkfs', () => {
    const result = analyzeCommand('mkfs.ext4 /dev/sdb1');
    expect(result.level).toBe('warn');
    expect(result.reason).toContain('mkfs');
  });

  it('warns on dd to device', () => {
    const result = analyzeCommand('dd if=/dev/zero of=/dev/sdb');
    expect(result.level).toBe('warn');
    expect(result.reason).toContain('dd');
  });

  it('detects rm in a pipeline and warns', () => {
    const result = analyzeCommand('ls | xargs rm');
    expect(result.level).toBe('warn');
  });

  it('detects rm after && and warns', () => {
    const result = analyzeCommand('echo ok && rm -rf /tmp/old');
    expect(result.level).toBe('warn');
  });
});

// ─── analyzeCommand — block commands ────────────────────────────────────────

describe('analyzeCommand — block commands', () => {
  it('blocks rm -rf /', () => {
    const result = analyzeCommand('rm -rf /');
    expect(result.level).toBe('block');
    expect(result.reason).toContain('root');
  });

  it('blocks rm -rf /*', () => {
    const result = analyzeCommand('rm -rf /*');
    expect(result.level).toBe('block');
  });

  it('blocks rm -fr /', () => {
    const result = analyzeCommand('rm -fr /');
    expect(result.level).toBe('block');
  });

  it('blocks fork bomb pattern', () => {
    const result = analyzeCommand(':(){ :|: & };:');
    expect(result.level).toBe('block');
    expect(result.reason).toContain('Fork bomb');
  });

  it('blocks write to /dev/sda', () => {
    const result = analyzeCommand('> /dev/sda');
    expect(result.level).toBe('block');
    expect(result.reason).toContain('block device');
  });

  it('blocks write to /dev/nvme device', () => {
    const result = analyzeCommand('echo x > /dev/nvme0n1');
    expect(result.level).toBe('block');
  });
});

// ─── analyzeCommand — segments ──────────────────────────────────────────────

describe('analyzeCommand — segments', () => {
  it('returns per-segment analysis', () => {
    const result = analyzeCommand('echo hello; rm file.txt');
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].level).toBe('safe');
    expect(result.segments[0].program).toBe('echo');
    expect(result.segments[1].level).toBe('warn');
    expect(result.segments[1].program).toBe('rm');
  });

  it('overall level is the worst across segments', () => {
    const result = analyzeCommand('echo hello; rm file.txt');
    expect(result.level).toBe('warn');
  });

  it('block overrides warn', () => {
    const result = analyzeCommand('rm file.txt; rm -rf /');
    expect(result.level).toBe('block');
  });
});
