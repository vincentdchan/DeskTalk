import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

export interface ExtractedMessage {
  scope: string;
  key: string;
  defaultText: string;
  placeholders: string[];
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

export function transformLocalizedSource(
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

export function createLocalizeEsbuildPlugin(
  packageScope: string,
  sourceRoot: string,
): esbuild.Plugin {
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

export function createLocalizeVitePlugin(packageScope: string, sourceRoot: string): Plugin {
  return {
    name: 'desktalk-localize-transform',
    enforce: 'pre',
    transform(source: string, id: string) {
      const cleanId = id.split('?')[0];
      if (!cleanId.startsWith(sourceRoot) || !/\.(?:ts|tsx|js|jsx|mjs)$/.test(cleanId)) {
        return null;
      }

      return {
        code: transformLocalizedSource(source, packageScope).code,
        map: null,
      };
    },
  };
}
