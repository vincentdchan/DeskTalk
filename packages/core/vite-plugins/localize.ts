/**
 * Vite plugins for $localize transformation and i18n asset generation.
 *
 * - `localizePlugin()` transforms `$localize`key:text`` tagged templates into
 *   `__dtLocalize(...)` calls at dev-time and during production build.
 * - `i18nAssetPlugin()` runs only during `vite build` to scan sources, extract
 *   messages, validate locale files, and emit `dist/i18n/` assets.
 */

import type { Plugin } from 'vite';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';

// ─── Types ─────────────────────────────────────────────────────────────────

interface LocalizeMessage {
  scope: string;
  key: string;
  defaultText: string;
  placeholders: string[];
}

// ─── Core transform helpers ────────────────────────────────────────────────

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

  return {
    end: index,
    replacement,
    message: {
      scope: resolvedScope,
      key,
      defaultText,
      placeholders: Array.from(new Set(placeholders)),
    } satisfies LocalizeMessage,
  };
}

function transformLocalizedSource(source: string, scope: string) {
  const marker = '$localize`';
  const replacements: { start: number; end: number; code: string }[] = [];
  const messages: LocalizeMessage[] = [];
  let searchIndex = 0;

  while (searchIndex < source.length) {
    const start = source.indexOf(marker, searchIndex);
    if (start === -1) break;
    const parsed = parseLocalizedTemplate(source, start + marker.length, scope);
    replacements.push({ start, end: parsed.end, code: parsed.replacement });
    messages.push(parsed.message);
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

  return { code, messages };
}

// ─── Localize transform plugin ─────────────────────────────────────────────

export function localizePlugin(options: { packageScope: string; srcRoot: string }): Plugin {
  return {
    name: 'desktalk-localize-transform',
    enforce: 'pre',
    transform(code, id) {
      if (!id.startsWith(options.srcRoot)) return null;
      if (!/\.(?:ts|tsx|js|jsx|mjs)$/.test(id)) return null;
      if (!code.includes('$localize`')) return null;

      const transformed = transformLocalizedSource(code, options.packageScope);
      if (!transformed) return null;

      return { code: transformed.code, map: null };
    },
  };
}

// ─── i18n asset generation plugin ──────────────────────────────────────────

function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
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

function readLocaleFiles(packageRoot: string) {
  const dir = join(packageRoot, 'src', 'i18n');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ locale: basename(name, '.json'), filePath: join(dir, name) }));
}

export function i18nAssetPlugin(options: {
  packageName: string;
  packageScope: string;
  packageRoot: string;
}): Plugin {
  return {
    name: 'desktalk-i18n-assets',
    apply: 'build',
    closeBundle() {
      const sourceFiles = collectSourceFiles(join(options.packageRoot, 'src'));
      const packageMessages = new Map<string, LocalizeMessage>();

      for (const filePath of sourceFiles) {
        const source = readFileSync(filePath, 'utf8');
        const transformed = transformLocalizedSource(source, options.packageScope);
        if (!transformed) continue;
        for (const message of transformed.messages) {
          if (message.scope !== options.packageScope) continue;
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
        const parsed = JSON.parse(readFileSync(localeFile.filePath, 'utf8'));
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value !== 'string') {
            throw new Error(`Locale values must be strings (${localeFile.locale}:${key})`);
          }
          const sourceMessage = packageMessages.get(key);
          if (!sourceMessage) continue;
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

      const manifest = {
        packageName: options.packageName,
        packageScope: options.packageScope,
        locales: localeFiles.map((f) => f.locale).sort(),
        messages: Array.from(packageMessages.values())
          .sort((a, b) => a.key.localeCompare(b.key))
          .map((m) => ({
            key: m.key,
            defaultText: m.defaultText,
            placeholders: m.placeholders,
          })),
      };

      const i18nOutDir = join(options.packageRoot, 'dist', 'i18n');
      if (existsSync(i18nOutDir)) {
        rmSync(i18nOutDir, { recursive: true, force: true });
      }
      mkdirSync(i18nOutDir, { recursive: true });
      writeFileSync(join(i18nOutDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      for (const localeFile of localeFiles) {
        copyFileSync(localeFile.filePath, join(i18nOutDir, `${localeFile.locale}.json`));
      }
    },
  };
}
