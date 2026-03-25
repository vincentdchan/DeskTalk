import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, context } from 'esbuild';

const packageDir = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(packageDir, 'dist');
const mainEntryPoint = resolve(packageDir, 'src/index.ts');
const chartEntryPoint = resolve(packageDir, 'src/chart-entry.ts');
const markedEntryPoint = resolve(packageDir, 'src/marked-entry.ts');
const milkdownEntryPoint = resolve(packageDir, 'src/milkdown-entry.ts');
const isWatch = process.argv.includes('--watch');

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
        pluginBuild.onResolve({ filter: /\.css\?raw$/ }, async (args) => {
          const resolved = await pluginBuild.resolve(args.path.replace(/\?raw$/, ''), {
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
          const css = await readFile(args.path, 'utf8');
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
