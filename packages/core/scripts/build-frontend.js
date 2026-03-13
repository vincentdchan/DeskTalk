import * as esbuild from 'esbuild';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

const outdir = join(root, 'dist', 'frontend');

// Ensure output directory exists
if (!existsSync(outdir)) {
  mkdirSync(outdir, { recursive: true });
}

// Bundle the frontend React app
await esbuild.build({
  entryPoints: [join(root, 'src', 'frontend', 'main.tsx')],
  bundle: true,
  outfile: join(outdir, 'app.js'),
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  minify: process.argv.includes('--minify'),
  sourcemap: true,
  loader: {
    '.css': 'css',
    '.module.css': 'local-css',
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
});

// Copy index.html to the output directory
const indexHtmlSrc = join(root, 'src', 'frontend', 'index.html');
const indexHtmlDest = join(outdir, 'index.html');
copyFileSync(indexHtmlSrc, indexHtmlDest);

// Copy AudioWorklet processor (must be served as a standalone JS file)
const workletSrc = join(root, 'src', 'frontend', 'audio-worklet-processor.js');
const workletDest = join(outdir, 'pcm-capture-processor.js');
copyFileSync(workletSrc, workletDest);

console.log('Frontend build complete → dist/frontend/');
