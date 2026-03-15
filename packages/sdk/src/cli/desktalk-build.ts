#!/usr/bin/env node

/**
 * desktalk-build — Standard build CLI for DeskTalk MiniApps.
 *
 * Produces two ESM bundles from a MiniApp package root:
 *   dist/backend.js  — Node target, all deps external
 *   dist/frontend.js — Browser target, deps bundled (except @desktalk/sdk)
 *
 * React/ReactDOM are resolved to window globals provided by the core shell.
 *
 * Also generates TypeScript declaration files via tsc.
 */

import * as esbuild from 'esbuild';
import { execSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { buildFrontendBundle } from './build-frontend';
import {
  createLocalizeEsbuildPlugin,
  type ExtractedMessage,
  transformLocalizedSource,
} from './localize';

const cwd = process.cwd();

interface PackageI18nManifest {
  packageName: string;
  packageScope: string;
  locales: string[];
  messages: Array<Pick<ExtractedMessage, 'key' | 'defaultText' | 'placeholders'>>;
}

function findEntry(base: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const full = join(cwd, base, candidate);
    if (existsSync(full)) {
      return join(base, candidate);
    }
  }
  return null;
}

function inferPackageScope(packageName: string): string {
  if (packageName === '@desktalk/core') {
    return 'core';
  }

  const miniAppMatch = packageName.match(/^@desktalk\/miniapp-(.+)$/);
  if (miniAppMatch) {
    return miniAppMatch[1];
  }

  const scopedMatch = packageName.match(/^@[^/]+\/(.+)$/);
  return scopedMatch?.[1] ?? packageName;
}

function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractPlaceholders(text: string): string[] {
  const matches = text.match(/\{([A-Za-z_$][\w$]*)\}/g) ?? [];
  return Array.from(new Set(matches.map((match) => match.slice(1, -1))));
}

function isValidLocaleTag(locale: string): boolean {
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale);
}

function readLocaleFiles(packageRoot: string): Array<{ locale: string; filePath: string }> {
  const dir = join(packageRoot, 'src', 'i18n');
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ locale: basename(name, '.json'), filePath: join(dir, name) }));
}

function validateAndCollectI18n(options: {
  packageRoot: string;
  packageName: string;
  packageScope: string;
}): { manifest: PackageI18nManifest; localeFiles: Array<{ locale: string; filePath: string }> } {
  const sourceFiles = collectSourceFiles(join(options.packageRoot, 'src'));
  const packageMessages = new Map<string, ExtractedMessage>();

  for (const filePath of sourceFiles) {
    const source = readFileSync(filePath, 'utf8');
    const transformed = transformLocalizedSource(source, options.packageScope);
    for (const message of transformed.messages) {
      if (message.scope !== options.packageScope) {
        continue;
      }

      const existing = packageMessages.get(message.key);
      if (
        existing &&
        (existing.defaultText !== message.defaultText ||
          JSON.stringify(existing.placeholders) !== JSON.stringify(message.placeholders))
      ) {
        throw new Error(`Conflicting $localize definitions for key "${message.key}"`);
      }

      packageMessages.set(message.key, message);
    }
  }

  const localeFiles = readLocaleFiles(options.packageRoot);
  for (const localeFile of localeFiles) {
    if (!isValidLocaleTag(localeFile.locale)) {
      throw new Error(`Invalid locale tag: ${localeFile.locale}`);
    }

    const parsed = JSON.parse(readFileSync(localeFile.filePath, 'utf8')) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') {
        throw new Error(`Locale values must be strings (${localeFile.locale}:${key})`);
      }

      const sourceMessage = packageMessages.get(key);
      if (!sourceMessage) {
        continue;
      }

      const localizedPlaceholders = extractPlaceholders(value);
      const expectedPlaceholders = sourceMessage.placeholders;
      if (
        JSON.stringify(localizedPlaceholders.sort()) !==
        JSON.stringify([...expectedPlaceholders].sort())
      ) {
        throw new Error(`Placeholder mismatch in ${localeFile.locale}.json for key "${key}"`);
      }
    }
  }

  return {
    manifest: {
      packageName: options.packageName,
      packageScope: options.packageScope,
      locales: localeFiles.map((file) => file.locale).sort(),
      messages: Array.from(packageMessages.values())
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((message) => ({
          key: message.key,
          defaultText: message.defaultText,
          placeholders: message.placeholders,
        })),
    },
    localeFiles,
  };
}

function emitI18nAssets(options: {
  packageRoot: string;
  manifest: PackageI18nManifest;
  localeFiles: Array<{ locale: string; filePath: string }>;
}): void {
  const outDir = join(options.packageRoot, 'dist', 'i18n');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(options.manifest, null, 2));

  for (const localeFile of options.localeFiles) {
    copyFileSync(localeFile.filePath, join(outDir, `${localeFile.locale}.json`));
  }
}

const packageJsonPath = join(cwd, 'package.json');
const packageName = existsSync(packageJsonPath)
  ? ((JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: string }).name ?? 'miniapp')
  : 'miniapp';
const packageScope = inferPackageScope(packageName);

const backendEntry = findEntry('src', ['backend.ts', 'backend.js', 'backend.mjs']);
const frontendEntry = findEntry('src', [
  'frontend.tsx',
  'frontend.ts',
  'frontend.jsx',
  'frontend.js',
]);

if (!backendEntry) {
  console.error('[desktalk-build] No backend entry found (expected src/backend.ts)');
  process.exit(1);
}

if (!frontendEntry) {
  console.error('[desktalk-build] No frontend entry found (expected src/frontend.tsx)');
  process.exit(1);
}

const distDir = join(cwd, 'dist');
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}

const i18nAssets = validateAndCollectI18n({
  packageRoot: cwd,
  packageName,
  packageScope,
});

console.log('[desktalk-build] Building backend...');
await esbuild.build({
  entryPoints: [backendEntry],
  outfile: 'dist/backend.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  sourcemap: true,
  packages: 'external',
  plugins: [createLocalizeEsbuildPlugin(packageScope, join(cwd, 'src'))],
});

console.log('[desktalk-build] Building frontend...');
await buildFrontendBundle({
  packageRoot: cwd,
  packageName,
  packageScope,
  frontendEntry,
});

emitI18nAssets({
  packageRoot: cwd,
  manifest: i18nAssets.manifest,
  localeFiles: i18nAssets.localeFiles,
});

console.log('[desktalk-build] Generating type declarations...');
const tsconfigPath = existsSync(join(cwd, 'tsconfig.build.json'))
  ? 'tsconfig.build.json'
  : 'tsconfig.json';

try {
  execSync(`npx tsc -p ${tsconfigPath} --emitDeclarationOnly --declaration --outDir dist`, {
    cwd,
    stdio: 'inherit',
  });
} catch {
  console.warn('[desktalk-build] Type declaration generation had errors (non-fatal)');
}

console.log('[desktalk-build] Done.');
