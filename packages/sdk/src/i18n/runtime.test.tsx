import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  __dtLocalize,
  $localize,
  I18nProvider,
  I18nScopeProvider,
  createLocalizer,
  useLocalize,
  type LocaleMessages,
} from './runtime.js';

const messages: LocaleMessages = {
  core: {
    close: '关闭',
    greeting: '你好，{name}！',
  },
  note: {
    close: '关闭笔记',
  },
};

function renderWithProviders(children: React.ReactNode, scope = 'core'): string {
  return renderToStaticMarkup(
    <I18nProvider locale="zh-CN" messages={messages}>
      <I18nScopeProvider scope={scope}>{children}</I18nScopeProvider>
    </I18nProvider>,
  );
}

describe('i18n runtime', () => {
  it('uses the active provider catalog in __dtLocalize', () => {
    renderWithProviders(<div />);

    expect(
      __dtLocalize({
        scope: 'core',
        key: 'close',
        defaultText: 'Close',
      }),
    ).toBe('关闭');
  });

  it('falls back to default English when no localized message exists', () => {
    renderWithProviders(<div />);

    expect(
      __dtLocalize({
        scope: 'core',
        key: 'missing',
        defaultText: 'Missing text',
      }),
    ).toBe('Missing text');
  });

  it('replaces named placeholders from params', () => {
    renderWithProviders(<div />);

    expect(
      __dtLocalize({
        scope: 'core',
        key: 'greeting',
        defaultText: 'Hello, {name}!',
        params: { name: 'DeskTalk' },
      }),
    ).toBe('你好，DeskTalk！');
  });

  it('useLocalize resolves messages from the default scope', () => {
    function Example() {
      const localize = useLocalize();
      return <span>{localize.t('close', 'Close')}</span>;
    }

    expect(renderWithProviders(<Example />)).toContain('关闭');
  });

  it('useLocalize.tInScope resolves another scope explicitly', () => {
    function Example() {
      const localize = useLocalize();
      return <span>{localize.tInScope('note', 'close', 'Close')}</span>;
    }

    expect(renderWithProviders(<Example />)).toContain('关闭笔记');
  });

  it('useLocalize exposes the current locale', () => {
    function Example() {
      const localize = useLocalize();
      return <span>{localize.locale()}</span>;
    }

    expect(renderWithProviders(<Example />)).toContain('zh-CN');
  });

  it('throws when useLocalize.t is used without a scope provider', () => {
    function Example() {
      const localize = useLocalize();
      return <span>{localize.t('close', 'Close')}</span>;
    }

    expect(() => {
      renderToStaticMarkup(
        <I18nProvider locale="zh-CN" messages={messages}>
          <Example />
        </I18nProvider>,
      );
    }).toThrow('useLocalize().t requires an <I18nScopeProvider>');
  });

  it('createLocalizer binds a default scope and locale', () => {
    const localizer = createLocalizer({
      locale: 'zh-CN',
      messages,
      defaultScope: 'core',
    });

    expect(localizer.t('close', 'Close')).toBe('关闭');
    expect(localizer.t('greeting', 'Hello, {name}!', { name: 'DeskTalk' })).toBe(
      '你好，DeskTalk！',
    );
    expect(localizer.locale()).toBe('zh-CN');
  });

  it('throws if $localize is called without build-time transform', () => {
    expect(() => $localize(['close:Close'] as unknown as TemplateStringsArray)).toThrow(
      '$localize must be transformed at build time',
    );
  });
});
