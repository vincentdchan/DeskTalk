import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build, type Plugin } from 'vite';
import { createLocalizeVitePlugin } from './localize';

interface BuildFrontendOptions {
  packageRoot: string;
  packageName: string;
  packageScope: string;
  frontendEntry: string;
}

interface GlobalModuleConfig {
  globalVar: string;
  namedExports: string[];
}

interface BuildAsset {
  type: 'asset';
  fileName: string;
  source: string | Uint8Array;
}

interface BuildChunk {
  type: 'chunk';
  fileName: string;
  code: string;
  isEntry: boolean;
}

interface BuildResult {
  output: Array<BuildAsset | BuildChunk>;
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

function createWindowGlobalsPlugin(): Plugin {
  const virtualPrefix = '\0desktalk-global:';
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
    enforce: 'pre',
    resolveId(source: string) {
      if (source in globals) {
        return `${virtualPrefix}${source}`;
      }

      return null;
    },
    load(id: string) {
      if (!id.startsWith(virtualPrefix)) {
        return null;
      }

      const modName = id.slice(virtualPrefix.length);
      const config = globals[modName];
      if (!config) {
        return null;
      }

      const lines = [`var _mod = window.${config.globalVar};`, 'export default _mod;'];
      for (const name of config.namedExports) {
        lines.push(`export var ${name} = _mod.${name};`);
      }

      return lines.join('\n');
    },
  };
}

function collectBuildOutputs(result: BuildResult | BuildResult[]): Array<BuildAsset | BuildChunk> {
  return (Array.isArray(result) ? result : [result]).flatMap((output) => output.output);
}

function isChunk(output: BuildAsset | BuildChunk): output is BuildChunk {
  return output.type === 'chunk';
}

function isAsset(output: BuildAsset | BuildChunk): output is BuildAsset {
  return output.type === 'asset';
}

export async function buildFrontendBundle(options: BuildFrontendOptions): Promise<void> {
  const result = await build({
    root: options.packageRoot,
    configFile: false,
    publicDir: false,
    plugins: [
      createWindowGlobalsPlugin(),
      createLocalizeVitePlugin(options.packageScope, join(options.packageRoot, 'src')),
    ],
    build: {
      write: false,
      outDir: join(options.packageRoot, 'dist'),
      emptyOutDir: false,
      sourcemap: false,
      target: 'es2022',
      minify: false,
      cssCodeSplit: false,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      lib: {
        entry: join(options.packageRoot, options.frontendEntry),
        formats: ['es'],
        fileName: () => 'frontend.js',
      },
      rollupOptions: {
        external: ['@desktalk/sdk'],
        output: {
          inlineDynamicImports: true,
        },
      },
    },
    resolve: {
      conditions: ['browser'],
    },
    esbuild: {
      jsx: 'automatic',
      target: 'es2022',
    },
  });

  const outputs = collectBuildOutputs(result as BuildResult | BuildResult[]);
  const entryChunk = outputs.find(
    (output): output is BuildChunk =>
      isChunk(output) && output.isEntry && output.fileName === 'frontend.js',
  );
  if (!entryChunk) {
    throw new Error('Vite frontend build did not emit dist/frontend.js');
  }

  const extraChunks = outputs.filter(
    (output): output is BuildChunk => isChunk(output) && output.fileName !== entryChunk.fileName,
  );
  if (extraChunks.length > 0) {
    throw new Error(
      `Vite frontend build emitted unexpected extra chunks: ${extraChunks
        .map((chunk) => chunk.fileName)
        .join(', ')}`,
    );
  }

  const cssAsset = outputs.find(
    (output): output is BuildAsset =>
      isAsset(output) && typeof output.fileName === 'string' && output.fileName.endsWith('.css'),
  );

  const distDir = join(options.packageRoot, 'dist');
  mkdirSync(distDir, { recursive: true });

  const injectedCode = `${
    cssAsset && typeof cssAsset.source === 'string'
      ? `${createCssInjectionBanner(cssAsset.source, options.packageName)}\n`
      : ''
  }${entryChunk.code}`;

  writeFileSync(join(distDir, 'frontend.js'), injectedCode);

  console.log(`[desktalk-build] Frontend bundle ready for ${options.packageName}`);
}
