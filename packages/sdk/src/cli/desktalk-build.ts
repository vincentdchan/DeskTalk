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
import { basename, dirname, join, normalize } from 'node:path';

const cwd = process.cwd();

interface ExtractedMessage {
  scope: string;
  key: string;
  defaultText: string;
  placeholders: string[];
}

interface PackageI18nManifest {
  packageName: string;
  packageScope: string;
  locales: string[];
  messages: Array<Pick<ExtractedMessage, 'key' | 'defaultText' | 'placeholders'>>;
}

interface MiniAppBuildMetadata {
  iconFile?: string;
}

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

function appendCssInjectionToBundle(js: string, css: string, packageName: string): string {
  const injection = createCssInjectionBanner(css, packageName);
  const sourceMapCommentMatch = js.match(/\n\/\/# sourceMappingURL=.*\s*$/);

  if (!sourceMapCommentMatch || sourceMapCommentMatch.index === undefined) {
    return `${js}\n${injection}\n`;
  }

  const sourceMapComment = sourceMapCommentMatch[0].trimStart();
  const withoutSourceMapComment = js.slice(0, sourceMapCommentMatch.index).replace(/\s*$/, '');
  return `${withoutSourceMapComment}\n${injection}\n${sourceMapComment}\n`;
}

async function minifyJavaScriptBundle(js: string): Promise<string> {
  const sourceMapCommentMatch = js.match(/\n\/\/# sourceMappingURL=.*\s*$/);
  const jsWithoutSourceMapComment = sourceMapCommentMatch
    ? js.slice(0, sourceMapCommentMatch.index).replace(/\s*$/, '')
    : js;

  const result = await esbuild.transform(jsWithoutSourceMapComment, {
    loader: 'js',
    format: 'esm',
    target: 'es2022',
    minify: true,
    sourcemap: false,
  });

  return result.code.trimEnd();
}

interface GlobalModuleConfig {
  globalVar: string;
  namedExports: string[];
}

function createWindowGlobalsPlugin(): esbuild.Plugin {
  const globals: Record<string, GlobalModuleConfig> = {
    react: {
      globalVar: 'React',
      namedExports: [
        'Children',
        'Component',
        'Fragment',
        'Profiler',
        'PureComponent',
        'StrictMode',
        'Suspense',
        'cloneElement',
        'createContext',
        'createElement',
        'createRef',
        'forwardRef',
        'isValidElement',
        'lazy',
        'memo',
        'startTransition',
        'useCallback',
        'useContext',
        'useDebugValue',
        'useDeferredValue',
        'useEffect',
        'useId',
        'useImperativeHandle',
        'useInsertionEffect',
        'useLayoutEffect',
        'useMemo',
        'useReducer',
        'useRef',
        'useState',
        'useSyncExternalStore',
        'useTransition',
        'version',
      ],
    },
    'react-dom': {
      globalVar: 'ReactDOM',
      namedExports: ['createPortal', 'flushSync', 'createRoot', 'hydrateRoot', 'version'],
    },
    'react-dom/client': {
      globalVar: 'ReactDOM',
      namedExports: ['createRoot', 'hydrateRoot'],
    },
    'react/jsx-runtime': {
      globalVar: '__desktalk_jsx_runtime',
      namedExports: ['jsx', 'jsxs', 'jsxDEV', 'Fragment'],
    },
  };

  return {
    name: 'desktalk-window-globals',
    setup(build) {
      for (const modName of Object.keys(globals)) {
        const escaped = modName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        build.onResolve({ filter: new RegExp(`^${escaped}$`) }, () => ({
          path: modName,
          namespace: 'desktalk-global',
        }));
      }

      build.onLoad({ filter: /.*/, namespace: 'desktalk-global' }, (args) => {
        const config = globals[args.path];
        if (!config) {
          return null;
        }

        const lines = [`var _mod = window.${config.globalVar};`, 'export default _mod;'];
        for (const name of config.namedExports) {
          lines.push(`export var ${name} = _mod.${name};`);
        }

        return {
          contents: lines.join('\n'),
          loader: 'js',
        };
      });
    },
  };
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

function parseTemplateExpression(
  source: string,
  start: number,
): { expression: string; end: number } {
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

function parseLocalizedTemplate(
  source: string,
  templateStart: number,
  packageScope: string,
): {
  end: number;
  replacement: string;
  message: ExtractedMessage;
} {
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

  if (quasis.length === 0) {
    throw new Error('Empty $localize template is not allowed');
  }

  const separatorIndex = quasis[0].indexOf(':');
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

function transformLocalizedSource(
  source: string,
  packageScope: string,
): {
  code: string;
  messages: ExtractedMessage[];
} {
  const marker = '$localize`';
  const replacements: Array<{ start: number; end: number; code: string }> = [];
  const messages: ExtractedMessage[] = [];
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

function createLocalizeTransformPlugin(packageScope: string, sourceRoot: string): esbuild.Plugin {
  return {
    name: 'desktalk-localize-transform',
    setup(build) {
      build.onLoad({ filter: /\.(?:ts|tsx|js|jsx|mjs)$/ }, async (args) => {
        if (!args.path.startsWith(sourceRoot)) {
          return null;
        }

        const source = readFileSync(args.path, 'utf8');
        const transformed = transformLocalizedSource(source, packageScope);
        const extension = args.path.split('.').pop() ?? 'ts';
        const loaderMap: Record<string, esbuild.Loader> = {
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

function copyMatchingFiles(options: {
  sourceDir: string;
  destDir: string;
  include: (filePath: string) => boolean;
}): void {
  if (!existsSync(options.sourceDir)) {
    return;
  }

  for (const entry of readdirSync(options.sourceDir, { withFileTypes: true })) {
    const sourcePath = join(options.sourceDir, entry.name);
    const destPath = join(options.destDir, entry.name);

    if (entry.isDirectory()) {
      copyMatchingFiles({
        sourceDir: sourcePath,
        destDir: destPath,
        include: options.include,
      });
      continue;
    }

    if (!options.include(sourcePath)) {
      continue;
    }

    mkdirSync(options.destDir, { recursive: true });
    copyFileSync(sourcePath, destPath);
  }
}

function createMarkdownCopyPlugin(sourceRoot: string, distRoot: string): esbuild.Plugin {
  return {
    name: 'desktalk-copy-markdown-assets',
    setup(build) {
      build.onEnd(() => {
        copyMatchingFiles({
          sourceDir: sourceRoot,
          destDir: distRoot,
          include: (filePath) => filePath.endsWith('.md'),
        });
      });
    },
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

function normalizeIconPath(filePath: string): string {
  return normalize(filePath).replace(/\\/g, '/');
}

function emitMiniAppMetadata(packageRoot: string, metadata: MiniAppBuildMetadata): void {
  const outDir = join(packageRoot, 'dist');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'meta.json'), JSON.stringify(metadata, null, 2));
}

function writeEsbuildOutputFiles(
  outputFiles: Array<Pick<esbuild.OutputFile, 'path' | 'contents'>>,
): void {
  for (const outputFile of outputFiles) {
    mkdirSync(dirname(outputFile.path), { recursive: true });
    writeFileSync(outputFile.path, outputFile.contents);
  }
}

const packageJsonPath = join(cwd, 'package.json');
const packageJson = existsSync(packageJsonPath)
  ? (JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: string; icon?: string })
  : {};
const packageName = packageJson.name ?? 'miniapp';
const packageScope = inferPackageScope(packageName);
const packageIconPath =
  typeof packageJson.icon === 'string' && packageJson.icon.endsWith('.png')
    ? join(cwd, packageJson.icon)
    : null;

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
  plugins: [
    createLocalizeTransformPlugin(packageScope, join(cwd, 'src')),
    createMarkdownCopyPlugin(join(cwd, 'src'), join(cwd, 'dist')),
  ],
});

console.log('[desktalk-build] Building frontend...');
const frontendBuildResult = await esbuild.build({
  entryPoints: [frontendEntry],
  outdir: distDir,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  jsx: 'automatic',
  write: false,
  loader: {
    '.css': 'css',
    '.module.css': 'local-css',
    '.woff2': 'empty',
    '.woff': 'empty',
    '.ttf': 'empty',
    '.eot': 'empty',
  },
  external: ['@desktalk/sdk'],
  plugins: [
    createWindowGlobalsPlugin(),
    createLocalizeTransformPlugin(packageScope, join(cwd, 'src')),
    createMarkdownCopyPlugin(join(cwd, 'src'), join(cwd, 'dist')),
  ],
});

const frontendJsPath = join(distDir, 'frontend.js');
const frontendCssPath = join(distDir, 'frontend.css');
const frontendCssMapPath = join(distDir, 'frontend.css.map');
const frontendCssFile = frontendBuildResult.outputFiles.find(
  (outputFile) => outputFile.path === frontendCssPath,
);

const frontendOutputFiles = frontendBuildResult.outputFiles
  .filter(
    (outputFile) => outputFile.path !== frontendCssPath && outputFile.path !== frontendCssMapPath,
  )
  .map(async (outputFile) => {
    if (outputFile.path !== frontendJsPath) {
      return outputFile;
    }

    const minifiedJs = await minifyJavaScriptBundle(outputFile.text);

    return {
      ...outputFile,
      contents: Buffer.from(
        frontendCssFile
          ? appendCssInjectionToBundle(minifiedJs, frontendCssFile.text, packageName)
          : minifiedJs,
      ),
    };
  });

writeEsbuildOutputFiles(await Promise.all(frontendOutputFiles));

emitI18nAssets({
  packageRoot: cwd,
  manifest: i18nAssets.manifest,
  localeFiles: i18nAssets.localeFiles,
});

emitMiniAppMetadata(cwd, {
  iconFile:
    typeof packageJson.icon === 'string' && packageIconPath && existsSync(packageIconPath)
      ? normalizeIconPath(packageJson.icon)
      : undefined,
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
