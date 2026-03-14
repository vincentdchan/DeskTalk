import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageScope = 'core';

// ─── $localize transform plugin ────────────────────────────────────────────
// Mirrors the esbuild `createLocalizeTransformPlugin` from scripts/build-frontend.js.
// Transforms `$localize`key:default text`` into `__dtLocalize(...)` calls at
// dev-time so the i18n runtime in @desktalk/sdk works correctly in Vite.

function parseTemplateExpression(source: string, start: number) {
  let index = start;
  let depth = 1;

  while (index < source.length) {
    const char = source[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return { expression: source.slice(start, index).trim(), end: index + 1 };
      }
    }
    index += 1;
  }

  throw new Error('Unterminated ${...} expression in $localize template');
}

function parseLocalizedTemplate(source: string, templateStart: number, scope: string) {
  const quasis: string[] = [];
  const expressions: string[] = [];
  let current = '';
  let index = templateStart;

  while (index < source.length) {
    const char = source[index];

    if (char === '\\') {
      current += source.slice(index, index + 2);
      index += 2;
      continue;
    }

    if (char === '`') {
      quasis.push(current);
      index += 1;
      break;
    }

    if (char === '$' && source[index + 1] === '{') {
      quasis.push(current);
      current = '';
      const parsed = parseTemplateExpression(source, index + 2);
      expressions.push(parsed.expression);
      index = parsed.end;
      continue;
    }

    current += char;
    index += 1;
  }

  const separatorIndex = quasis[0]?.indexOf(':') ?? -1;
  if (separatorIndex === -1) throw new Error('Missing ":" in $localize template');

  const head = quasis[0].slice(0, separatorIndex).trim();
  const defaultSegments = [quasis[0].slice(separatorIndex + 1), ...quasis.slice(1)];
  const headMatch = head.match(/^(?:@([A-Za-z0-9_-]+)\/)?([A-Za-z0-9_.-]+)$/);
  if (!headMatch) throw new Error(`Invalid $localize key header: ${head}`);

  const resolvedScope = headMatch[1] ?? scope;
  const key = headMatch[2];
  const placeholders: string[] = [];
  let defaultText = defaultSegments[0] ?? '';

  for (let i = 0; i < expressions.length; i += 1) {
    const expression = expressions[i];
    if (!/^[A-Za-z_$][\w$]*$/.test(expression)) {
      throw new Error(
        `Only simple identifiers are allowed in $localize expressions, got: ${expression}`,
      );
    }
    placeholders.push(expression);
    defaultText += `{${expression}}${defaultSegments[i + 1] ?? ''}`;
  }

  const params = placeholders.length > 0 ? `, params: { ${placeholders.join(', ')} }` : '';
  const replacement = `__dtLocalize({ scope: ${JSON.stringify(resolvedScope)}, key: ${JSON.stringify(key)}, defaultText: ${JSON.stringify(defaultText)}${params} })`;

  return { end: index, replacement };
}

function transformLocalizedSource(source: string, scope: string) {
  const marker = '$localize`';
  const replacements: { start: number; end: number; code: string }[] = [];
  let searchIndex = 0;

  while (searchIndex < source.length) {
    const start = source.indexOf(marker, searchIndex);
    if (start === -1) break;
    const parsed = parseLocalizedTemplate(source, start + marker.length, scope);
    replacements.push({ start, end: parsed.end, code: parsed.replacement });
    searchIndex = parsed.end;
  }

  if (replacements.length === 0) return null;

  let code = source;
  for (let i = replacements.length - 1; i >= 0; i -= 1) {
    const r = replacements[i];
    code = `${code.slice(0, r.start)}${r.code}${code.slice(r.end)}`;
  }

  if (!code.includes("import { __dtLocalize } from '@desktalk/sdk';")) {
    code = `import { __dtLocalize } from '@desktalk/sdk';\n${code}`;
  }

  return code;
}

function localizePlugin(): Plugin {
  const srcRoot = join(__dirname, 'src');

  return {
    name: 'desktalk-localize-transform',
    enforce: 'pre',
    transform(code, id) {
      if (!id.startsWith(srcRoot)) return null;
      if (!/\.(?:ts|tsx|js|jsx|mjs)$/.test(id)) return null;
      if (!code.includes('$localize`')) return null;

      const transformed = transformLocalizedSource(code, packageScope);
      if (!transformed) return null;

      return { code: transformed, map: null };
    },
  };
}

// ─── CSS module HMR fix ────────────────────────────────────────────────────
// Vite's built-in CSS modules transform does NOT add `import.meta.hot.accept()`
// because exported class-name mappings may change.  Instead the HMR update
// propagates to the importing React component via React Fast Refresh.  However,
// Fast Refresh re-renders the component *without* re-executing the CSS module's
// top-level `__vite__updateStyle(...)` call, so the <style> tag is never
// updated.
//
// This plugin runs after `vite:css-post` and appends a self-accept call so that
// CSS-value edits (by far the most common change during development) are
// reflected instantly.  If class names are added or removed the component will
// still need a full reload, but React Fast Refresh already handles that via
// invalidation.

function cssModuleHmrPlugin(): Plugin {
  return {
    name: 'desktalk-css-module-hmr',
    enforce: 'post',
    transform(code, id) {
      // Only act on CSS modules in dev mode
      if (!id.includes('.module.')) return null;
      if (!/\.(?:css|scss|sass|less|styl|stylus)(?:\?|$)/.test(id)) return null;
      // Only patch when Vite has already injected its HMR scaffolding but
      // omitted a self-accept (i.e. `import.meta.hot.accept()` is absent).
      if (!code.includes('import.meta.hot')) return null;
      if (code.includes('import.meta.hot.accept(')) return null;

      return { code: `${code}\nimport.meta.hot.accept();`, map: null };
    },
  };
}

/**
 * Serves `audio-worklet-processor.js` at `/pcm-capture-processor.js` during
 * dev so the AudioWorklet can load it.  The production esbuild script copies
 * the file separately into dist/frontend/.
 */
function audioWorkletPlugin(): Plugin {
  const workletPath = join(__dirname, 'src', 'frontend', 'audio-worklet-processor.js');

  return {
    name: 'desktalk-audio-worklet',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/pcm-capture-processor.js') {
          res.setHeader('Content-Type', 'application/javascript');
          res.end(readFileSync(workletPath, 'utf-8'));
          return;
        }
        next();
      });
    },
  };
}

// ─── Vite config ───────────────────────────────────────────────────────────

export default defineConfig({
  root: join(__dirname, 'src', 'frontend'),

  plugins: [localizePlugin(), audioWorkletPlugin(), react(), cssModuleHmrPlugin()],

  server: {
    port: 5173,
    // Proxy API and WebSocket requests to the Fastify backend
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },

  resolve: {
    // Vite with moduleResolution:"bundler" already handles .js → .ts, but
    // let's be explicit for clarity.
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },

  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
});
