import * as esbuild from 'esbuild';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');
const sourceRoot = join(root, 'src');
const outdir = join(root, 'dist', 'frontend');

function collectSourceFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

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

function extractPlaceholders(text) {
  const matches = text.match(/\{([A-Za-z_$][\w$]*)\}/g) ?? [];
  return Array.from(new Set(matches.map((match) => match.slice(1, -1))));
}

function isValidLocaleTag(locale) {
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale);
}

function parseTemplateExpression(source, start) {
  let index = start;
  let depth = 1;

  while (index < source.length) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          expression: source.slice(start, index).trim(),
          end: index + 1,
        };
      }
    }
    index += 1;
  }

  throw new Error('Unterminated ${...} expression in $localize template');
}

function parseLocalizedTemplate(source, templateStart, packageScope) {
  const quasis = [];
  const expressions = [];
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
  if (separatorIndex === -1) {
    throw new Error('Missing ":" in $localize template');
  }

  const head = quasis[0].slice(0, separatorIndex).trim();
  const defaultSegments = [quasis[0].slice(separatorIndex + 1), ...quasis.slice(1)];
  const headMatch = head.match(/^(?:@([A-Za-z0-9_-]+)\/)?([A-Za-z0-9_.-]+)$/);
  if (!headMatch) {
    throw new Error(`Invalid $localize key header: ${head}`);
  }

  const scope = headMatch[1] ?? packageScope;
  const key = headMatch[2];
  const placeholders = [];
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
  const replacement = `__dtLocalize({ scope: ${JSON.stringify(scope)}, key: ${JSON.stringify(
    key,
  )}, defaultText: ${JSON.stringify(defaultText)}${params} })`;

  return {
    end: index,
    replacement,
    message: {
      scope,
      key,
      defaultText,
      placeholders: Array.from(new Set(placeholders)),
    },
  };
}

function transformLocalizedSource(source, packageScope) {
  const marker = '$localize`';
  const replacements = [];
  const messages = [];
  let searchIndex = 0;

  while (searchIndex < source.length) {
    const start = source.indexOf(marker, searchIndex);
    if (start === -1) {
      break;
    }

    const parsed = parseLocalizedTemplate(source, start + marker.length, packageScope);
    replacements.push({ start, end: parsed.end, code: parsed.replacement });
    messages.push(parsed.message);
    searchIndex = parsed.end;
  }

  if (replacements.length === 0) {
    return { code: source, messages: [] };
  }

  let code = source;
  for (let i = replacements.length - 1; i >= 0; i -= 1) {
    const replacement = replacements[i];
    code = `${code.slice(0, replacement.start)}${replacement.code}${code.slice(replacement.end)}`;
  }

  if (!code.includes("import { __dtLocalize } from '@desktalk/sdk';")) {
    code = `import { __dtLocalize } from '@desktalk/sdk';\n${code}`;
  }

  return { code, messages };
}

function readLocaleFiles(packageRoot) {
  const dir = join(packageRoot, 'src', 'i18n');
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ locale: basename(name, '.json'), filePath: join(dir, name) }));
}

function buildI18nAssets(packageRoot, packageName, packageScope) {
  const sourceFiles = collectSourceFiles(join(packageRoot, 'src'));
  const packageMessages = new Map();

  for (const filePath of sourceFiles) {
    const source = readFileSync(filePath, 'utf8');
    const transformed = transformLocalizedSource(source, packageScope);
    for (const message of transformed.messages) {
      if (message.scope !== packageScope) {
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

  const localeFiles = readLocaleFiles(packageRoot);
  for (const localeFile of localeFiles) {
    if (!isValidLocaleTag(localeFile.locale)) {
      throw new Error(`Invalid locale tag: ${localeFile.locale}`);
    }

    const parsed = JSON.parse(readFileSync(localeFile.filePath, 'utf8'));
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
      packageName,
      packageScope,
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

function createLocalizeTransformPlugin(packageScope, rootDir) {
  return {
    name: 'desktalk-localize-transform',
    setup(build) {
      build.onLoad({ filter: /\.(?:ts|tsx|js|jsx|mjs)$/ }, async (args) => {
        if (!args.path.startsWith(rootDir)) {
          return null;
        }

        const source = readFileSync(args.path, 'utf8');
        const transformed = transformLocalizedSource(source, packageScope);
        const extension = args.path.split('.').pop() ?? 'ts';
        const loaderMap = {
          ts: 'ts',
          tsx: 'tsx',
          js: 'js',
          jsx: 'jsx',
          mjs: 'js',
        };

        return {
          contents: transformed.code,
          loader: loaderMap[extension] ?? 'ts',
        };
      });
    },
  };
}

function emitI18nAssets(packageRoot, manifest, localeFiles) {
  const outDir = join(packageRoot, 'dist', 'i18n');
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  for (const localeFile of localeFiles) {
    copyFileSync(localeFile.filePath, join(outDir, `${localeFile.locale}.json`));
  }
}

if (!existsSync(outdir)) {
  mkdirSync(outdir, { recursive: true });
}

const packageName = '@desktalk/core';
const packageScope = 'core';
const i18nAssets = buildI18nAssets(root, packageName, packageScope);

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
  plugins: [createLocalizeTransformPlugin(packageScope, sourceRoot)],
});

// Generate production index.html (the source index.html points to ./main.tsx
// for Vite dev, so we produce a production variant referencing the bundled assets).
const indexHtmlDest = join(outdir, 'index.html');
const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DeskTalk</title>
    <link rel="stylesheet" href="/app.css" />
    <style>
      /* Prevent flash of unstyled content */
      html, body { background: #1e1e2e; margin: 0; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/app.js"></script>
  </body>
</html>
`;
writeFileSync(indexHtmlDest, indexHtml);

const workletSrc = join(root, 'src', 'frontend', 'audio-worklet-processor.js');
const workletDest = join(outdir, 'pcm-capture-processor.js');
copyFileSync(workletSrc, workletDest);

emitI18nAssets(root, i18nAssets.manifest, i18nAssets.localeFiles);

console.log('Frontend build complete -> dist/frontend/');
