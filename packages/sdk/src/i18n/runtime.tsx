import React, { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { LocalizeParam, Localizer } from '../types/context';

export type LocaleMessages = Record<string, Record<string, string>>;

export interface LocalizeCall {
  scope: string;
  key: string;
  defaultText: string;
  params?: Record<string, LocalizeParam>;
}

export interface I18nRuntimeValue {
  locale: string;
  messages: LocaleMessages;
}

const I18nContext = createContext<I18nRuntimeValue>({
  locale: 'en',
  messages: {},
});

const ScopeContext = createContext<string | null>(null);

let activeRuntime: I18nRuntimeValue = {
  locale: 'en',
  messages: {},
};

function formatMessage(message: string, params?: Record<string, LocalizeParam>): string {
  if (!params) {
    return message;
  }

  return message.replace(/\{([A-Za-z_$][\w$]*)\}/g, (_match, name: string) => {
    const value = params[name];
    return value == null ? '' : String(value);
  });
}

function resolveMessage(
  runtime: I18nRuntimeValue,
  scope: string,
  key: string,
  defaultText: string,
  params?: Record<string, LocalizeParam>,
): string {
  const template = runtime.messages[scope]?.[key] ?? defaultText;
  return formatMessage(template, params);
}

export function __dtLocalize(call: LocalizeCall): string {
  return resolveMessage(activeRuntime, call.scope, call.key, call.defaultText, call.params);
}

export function $localize(_strings: TemplateStringsArray, ..._values: unknown[]): string {
  throw new Error('$localize must be transformed at build time');
}

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: LocaleMessages;
  children: ReactNode;
}) {
  const value = useMemo<I18nRuntimeValue>(() => ({ locale, messages }), [locale, messages]);
  activeRuntime = value;
  return React.createElement(I18nContext.Provider, { value }, children);
}

export function I18nScopeProvider({ scope, children }: { scope: string; children: ReactNode }) {
  return React.createElement(ScopeContext.Provider, { value: scope }, children);
}

export function useLocalize(): Localizer & {
  tInScope(
    scope: string,
    key: string,
    defaultText: string,
    params?: Record<string, LocalizeParam>,
  ): string;
} {
  const runtime = useContext(I18nContext);
  const defaultScope = useContext(ScopeContext);

  const tInScope = useCallback(
    (scope: string, key: string, defaultText: string, params?: Record<string, LocalizeParam>) => {
      return resolveMessage(runtime, scope, key, defaultText, params);
    },
    [runtime],
  );

  const t = useCallback(
    (key: string, defaultText: string, params?: Record<string, LocalizeParam>) => {
      if (!defaultScope) {
        throw new Error('useLocalize().t requires an <I18nScopeProvider>');
      }

      return resolveMessage(runtime, defaultScope, key, defaultText, params);
    },
    [defaultScope, runtime],
  );

  const locale = useCallback(() => runtime.locale, [runtime.locale]);

  return {
    t,
    tInScope,
    locale,
  };
}

export function createLocalizer(options: {
  locale: string;
  messages: LocaleMessages;
  defaultScope: string;
}): Localizer {
  return {
    t(key, defaultText, params) {
      return resolveMessage(options, options.defaultScope, key, defaultText, params);
    },
    locale() {
      return options.locale;
    },
  };
}
