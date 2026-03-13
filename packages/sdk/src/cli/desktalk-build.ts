#!/usr/bin/env node

/**
 * desktalk-build — Standard build CLI for DeskTalk MiniApps.
 *
 * Produces two ESM bundles from a MiniApp package root:
 *   dist/backend.js  — Node target, all deps external
 *   dist/frontend.js — Browser target, deps bundled (except react & @desktalk/sdk)
 *
 * Also generates TypeScript declaration files via tsc.
 */

import * as esbuild from 'esbuild';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.cwd();

function sanitizeForDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function createCssInjectionBanner(css: string, packageName: string): string {
  const styleId = `desktalk-style-${sanitizeForDomId(packageName)}-${hashString(css)}`;
  return `(() => {
  if (typeof document === 'undefined') return;
  const styleId = ${JSON.stringify(styleId)};
  if (document.getElementById(styleId)) return;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = ${JSON.stringify(css)};
  document.head.appendChild(style);
})();`;
}

// ─── Resolve entry points ────────────────────────────────────────────────────

function findEntry(base: string, candidates: string[]): string | null {
  for (const c of candidates) {
    const full = join(cwd, base, c);
    if (existsSync(full)) return join(base, c);
  }
  return null;
}

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

// ─── Clean ───────────────────────────────────────────────────────────────────

const distDir = join(cwd, 'dist');
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}

const tempDir = join(cwd, '.desktalk-build');
if (existsSync(tempDir)) {
  rmSync(tempDir, { recursive: true, force: true });
}

// ─── Build backend ───────────────────────────────────────────────────────────

console.log('[desktalk-build] Building backend…');
await esbuild.build({
  entryPoints: [backendEntry],
  outfile: 'dist/backend.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  sourcemap: true,
  // All dependencies are external — resolved at runtime by Node
  packages: 'external',
});

// ─── Build frontend ─────────────────────────────────────────────────────────

console.log('[desktalk-build] Building frontend…');
try {
  await esbuild.build({
    entryPoints: [frontendEntry],
    outfile: join(tempDir, 'frontend.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    jsx: 'automatic',
    loader: {
      '.css': 'css',
      '.module.css': 'local-css',
      '.woff2': 'empty',
      '.woff': 'empty',
      '.ttf': 'empty',
      '.eot': 'empty',
    },
    external: ['react', 'react/jsx-runtime', 'react-dom', '@desktalk/sdk'],
  });

  const packageJsonPath = join(cwd, 'package.json');
  const packageName = existsSync(packageJsonPath)
    ? ((JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: string }).name ?? 'miniapp')
    : 'miniapp';
  const tempCssPath = join(tempDir, 'frontend.css');
  const injectedCssBanner = existsSync(tempCssPath)
    ? createCssInjectionBanner(readFileSync(tempCssPath, 'utf8'), packageName)
    : undefined;

  await esbuild.build({
    entryPoints: [frontendEntry],
    outfile: 'dist/frontend.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    jsx: 'automatic',
    loader: {
      '.css': 'css',
      '.module.css': 'local-css',
      '.woff2': 'empty',
      '.woff': 'empty',
      '.ttf': 'empty',
      '.eot': 'empty',
    },
    banner: injectedCssBanner ? { js: injectedCssBanner } : undefined,
    external: ['react', 'react/jsx-runtime', 'react-dom', '@desktalk/sdk'],
  });

  for (const extraFile of ['frontend.css', 'frontend.css.map']) {
    const extraPath = join(distDir, extraFile);
    if (existsSync(extraPath)) {
      rmSync(extraPath, { force: true });
    }
  }
} finally {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

// ─── Generate declarations ──────────────────────────────────────────────────

console.log('[desktalk-build] Generating type declarations…');
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
