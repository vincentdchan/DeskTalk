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
import { existsSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

const cwd = process.cwd();

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
await esbuild.build({
  entryPoints: [frontendEntry],
  outfile: 'dist/frontend.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  jsx: 'automatic',
  // React and the SDK are provided by the core shell — mark external
  external: ['react', 'react/jsx-runtime', 'react-dom', '@desktalk/sdk'],
});

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
