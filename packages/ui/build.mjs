import { createRequire } from 'node:module';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, context } from 'esbuild';

const packageDir = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(packageDir, 'dist');
const mainEntryPoint = resolve(packageDir, 'src/index.ts');
const themeCssEntryPoint = resolve(packageDir, 'src/theme-css.ts');
const chartEntryPoint = resolve(packageDir, 'src/chart-entry.ts');
const markedEntryPoint = resolve(packageDir, 'src/marked-entry.ts');
const milkdownEntryPoint = resolve(packageDir, 'src/milkdown-entry.ts');
const isWatch = process.argv.includes('--watch');

const cssImportRe = /^@import\s+['"]([^'"]+)['"]\s*;/gm;

/**
 * Resolve a bare CSS import specifier (e.g. `@milkdown/prose/view/style/prosemirror.css`)
 * to an absolute file-system path using Node module resolution from `fromDir`.
 */
function resolveCssSpecifier(specifier, fromDir) {
  const require = createRequire(resolve(fromDir, '__placeholder__.css'));
  return require.resolve(specifier);
}

/**
 * Read a CSS file and recursively inline any `@import` statements whose
 * specifiers are bare package paths (not URLs).  This is needed because the
 * raw-css namespace bypasses normal CSS bundling, so `@import` directives
 * would end up as unresolvable text inside a `<style>` tag at runtime.
 */
async function inlineCssImports(filePath, seen = new Set()) {
  if (seen.has(filePath)) return '';
  seen.add(filePath);

  let css = await readFile(filePath, 'utf8');

  const replacements = [];
  for (const match of css.matchAll(cssImportRe)) {
    const specifier = match[1];

    // Skip URL imports — the browser can handle those.
    if (/^https?:\/\//.test(specifier)) continue;

    // Skip relative paths that are actually relative file imports —
    // resolve them the same way we resolve bare specifiers.
    let resolvedPath;
    try {
      resolvedPath = specifier.startsWith('.')
        ? resolve(dirname(filePath), specifier)
        : resolveCssSpecifier(specifier, dirname(filePath));
    } catch {
      // Leave the @import as-is if resolution fails.
      continue;
    }

    const inlined = await inlineCssImports(resolvedPath, seen);
    replacements.push({ original: match[0], inlined });
  }

  for (const { original, inlined } of replacements) {
    css = css.replace(original, inlined);
  }

  return css;
}

const sharedOptions = {
  bundle: true,
  minify: !isWatch,
  platform: 'browser',
  sourcemap: true,
  target: 'es2022',
  logLevel: 'info',
  plugins: [
    {
      name: 'raw-css-loader',
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /\.css\?(raw|inline)$/ }, async (args) => {
          const resolved = await pluginBuild.resolve(args.path.replace(/\?(raw|inline)$/, ''), {
            kind: args.kind,
            importer: args.importer,
            resolveDir: args.resolveDir,
          });

          if (resolved.errors.length > 0) {
            return { errors: resolved.errors };
          }

          return {
            path: resolved.path,
            namespace: 'raw-css',
          };
        });

        pluginBuild.onLoad({ filter: /\.css$/, namespace: 'raw-css' }, async (args) => {
          const css = await inlineCssImports(args.path);
          return {
            contents: `export default ${JSON.stringify(css)};`,
            loader: 'js',
          };
        });
      },
    },
  ],
};

const outputConfigs = [
  {
    entryPoints: [mainEntryPoint],
    format: 'esm',
    outfile: resolve(distDir, 'index.js'),
  },
  {
    entryPoints: [themeCssEntryPoint],
    format: 'esm',
    outfile: resolve(distDir, 'theme-css.js'),
  },
  {
    entryPoints: [mainEntryPoint],
    format: 'iife',
    globalName: 'DeskTalkUI',
    outfile: resolve(distDir, 'desktalk-ui.js'),
  },
  {
    entryPoints: [chartEntryPoint],
    format: 'iife',
    globalName: '__DtChartBundle',
    outfile: resolve(distDir, 'chart.umd.js'),
  },
  {
    entryPoints: [markedEntryPoint],
    format: 'iife',
    globalName: '__DtMarkedBundle',
    outfile: resolve(distDir, 'marked.umd.js'),
  },
  {
    entryPoints: [milkdownEntryPoint],
    format: 'iife',
    globalName: '__DtMilkdownBundle',
    outfile: resolve(distDir, 'milkdown.umd.js'),
  },
];

async function resetDist() {
  await rm(distDir, { force: true, recursive: true });
  await mkdir(distDir, { recursive: true });
}

async function runBuild() {
  await resetDist();

  if (isWatch) {
    await Promise.all(
      outputConfigs.map(async (outputConfig) => {
        const buildContext = await context({
          ...sharedOptions,
          ...outputConfig,
        });

        await buildContext.watch();
      }),
    );

    return;
  }

  await Promise.all(
    outputConfigs.map((outputConfig) =>
      build({
        ...sharedOptions,
        ...outputConfig,
      }),
    ),
  );
}

runBuild().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
