import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = join(process.cwd(), 'src', 'default-prompts');
const destDir = join(process.cwd(), 'dist', 'default-prompts');

function copyMarkdownFiles(sourceDir, targetDir) {
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyMarkdownFiles(sourcePath, targetPath);
      continue;
    }

    if (!entry.name.endsWith('.md')) {
      continue;
    }

    mkdirSync(targetDir, { recursive: true });
    copyFileSync(sourcePath, targetPath);
  }
}

if (!existsSync(srcDir)) {
  process.exit(0);
}

copyMarkdownFiles(srcDir, destDir);
