import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { seedDefaultPrompts } from './default-prompts';

describe('seedDefaultPrompts', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('copies bundled prompt files into a new user home', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'desktalk-default-prompts-'));

    seedDefaultPrompts(tempDir);

    expect(existsSync(join(tempDir, 'todo_app_prompt.md'))).toBe(true);
    expect(existsSync(join(tempDir, 'hackernews_app_prompt.md'))).toBe(true);
    expect(existsSync(join(tempDir, 'stock_app_prompt.md'))).toBe(true);
  });

  it('does not overwrite an existing prompt file', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'desktalk-default-prompts-'));
    const todoPromptPath = join(tempDir, 'todo_app_prompt.md');

    writeFileSync(todoPromptPath, 'custom prompt', 'utf8');

    seedDefaultPrompts(tempDir);

    expect(readFileSync(todoPromptPath, 'utf8')).toBe('custom prompt');
  });
});
