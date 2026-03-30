import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function getDefaultPromptsDir(): string {
  return fileURLToPath(new URL('../default-prompts/', import.meta.url));
}

export function seedDefaultPrompts(userHomeDir: string): void {
  const promptsDir = getDefaultPromptsDir();

  if (!existsSync(promptsDir)) {
    return;
  }

  for (const entry of readdirSync(promptsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }

    const sourcePath = join(promptsDir, entry.name);
    const targetPath = join(userHomeDir, entry.name);

    if (existsSync(targetPath)) {
      continue;
    }

    copyFileSync(sourcePath, targetPath);
  }
}
