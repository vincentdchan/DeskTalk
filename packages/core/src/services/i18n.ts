import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type LocaleMessages = Record<string, Record<string, string>>;
export interface Localizer {
  t(
    key: string,
    defaultText: string,
    params?: Record<string, string | number | boolean | null | undefined>,
  ): string;
  locale(): string;
}

export interface PackageI18nManifest {
  packageName: string;
  packageScope: string;
  locales: string[];
  messages: Array<{
    key: string;
    defaultText: string;
    placeholders: string[];
  }>;
}

export interface PackageI18nSource {
  packageRoot: string;
  packageScope: string;
}

function formatMessage(
  message: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!params) {
    return message;
  }

  return message.replace(/\{([A-Za-z_$][\w$]*)\}/g, (_match, name: string) => {
    const value = params[name];
    return value == null ? '' : String(value);
  });
}

function getManifestPath(packageRoot: string): string {
  return join(packageRoot, 'dist', 'i18n', 'manifest.json');
}

function getLocalePath(packageRoot: string, locale: string): string {
  return join(packageRoot, 'dist', 'i18n', `${locale}.json`);
}

export function readPackageI18nManifest(packageRoot: string): PackageI18nManifest | null {
  const manifestPath = getManifestPath(packageRoot);
  if (!existsSync(manifestPath)) {
    return null;
  }

  return JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageI18nManifest;
}

function readLocaleFile(packageRoot: string, locale: string): Record<string, string> {
  const localePath = getLocalePath(packageRoot, locale);
  if (!existsSync(localePath)) {
    return {};
  }

  return JSON.parse(readFileSync(localePath, 'utf8')) as Record<string, string>;
}

function getLocaleChain(locale: string): string[] {
  const trimmed = locale.trim();
  if (!trimmed) {
    return [];
  }

  const normalized = trimmed.split('_').join('-');
  const segments = normalized.split('-');
  if (segments.length <= 1) {
    return [normalized];
  }

  return [segments[0], normalized];
}

export function loadPackageLocaleMessages(
  packageRoot: string,
  packageScope: string,
  locale: string,
): LocaleMessages {
  const scopeMessages: Record<string, string> = {};

  for (const candidate of getLocaleChain(locale)) {
    Object.assign(scopeMessages, readLocaleFile(packageRoot, candidate));
  }

  return Object.keys(scopeMessages).length > 0 ? { [packageScope]: scopeMessages } : {};
}

export function loadMergedLocaleMessages(
  packages: PackageI18nSource[],
  locale: string,
): LocaleMessages {
  const merged: LocaleMessages = {};

  for (const pkg of packages) {
    const scopedMessages = loadPackageLocaleMessages(pkg.packageRoot, pkg.packageScope, locale);
    if (scopedMessages[pkg.packageScope]) {
      merged[pkg.packageScope] = {
        ...(merged[pkg.packageScope] ?? {}),
        ...scopedMessages[pkg.packageScope],
      };
    }
  }

  return merged;
}

export function createPackageLocalizer(options: {
  packageRoot: string;
  defaultScope: string;
  locale: string;
}): Localizer {
  const messages = loadPackageLocaleMessages(
    options.packageRoot,
    options.defaultScope,
    options.locale,
  );

  return {
    t(key, defaultText, params) {
      const template = messages[options.defaultScope]?.[key] ?? defaultText;
      return formatMessage(template, params);
    },
    locale() {
      return options.locale;
    },
  };
}
