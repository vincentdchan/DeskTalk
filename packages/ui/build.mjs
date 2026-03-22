import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, context } from 'esbuild';

const packageDir = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(packageDir, 'dist');
const entryPoint = resolve(packageDir, 'src/index.ts');
const isWatch = process.argv.includes('--watch');

const sharedOptions = {
  bundle: true,
  entryPoints: [entryPoint],
  platform: 'browser',
  sourcemap: true,
  target: 'es2022',
  logLevel: 'info',
  plugins: [
    {
      name: 'raw-css-loader',
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /\.css\?raw$/ }, (args) => ({
          path: resolve(args.resolveDir, args.path.replace(/\?raw$/, '')),
          namespace: 'raw-css',
        }));

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
    format: 'esm',
    outfile: resolve(distDir, 'index.js'),
  },
  {
    format: 'iife',
    globalName: 'DeskTalkUI',
    outfile: resolve(distDir, 'index.umd.js'),
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
