import { createHtmlBridgeScript } from '@desktalk/sdk';
import { stripDtInjections } from './strip-dt-injections';

export interface PreviewThemeRuntime {
  accentColor: string;
  mode: 'light' | 'dark';
}

const UI_BUNDLE_SCRIPT_TAG = '<script src="/api/ui/desktalk-ui.js" data-dt-ui></script>';

function createThemeLinkTag(accentColor: string, mode: 'light' | 'dark'): string {
  const params = new URLSearchParams({ accent: accentColor, theme: mode });
  return `<link rel="stylesheet" href="/api/ui/desktalk-theme.css?${params.toString()}" data-dt-theme>`;
}

function createThemeSyncScript(accentColor: string, mode: 'light' | 'dark'): string {
  return `<script data-dt-theme-sync>
(() => {
  const THEME_MESSAGE = 'desktalk:theme-update';
  const THEME_SELECTOR = 'link[data-dt-theme]';
  const updateTheme = (nextAccent, nextMode) => {
    const params = new URLSearchParams({ accent: nextAccent, theme: nextMode });
    const href = '/api/ui/desktalk-theme.css?' + params.toString();
    let link = document.querySelector(THEME_SELECTOR);
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.setAttribute('data-dt-theme', '');
      document.head.prepend(link);
    }
    link.href = href;
    document.documentElement.dataset.theme = nextMode;
    document.documentElement.style.colorScheme = nextMode;
    document.documentElement.style.backgroundColor = nextMode === 'dark' ? '#101114' : '#f7f7fa';
    document.body?.style.setProperty('background-color', nextMode === 'dark' ? '#101114' : '#f7f7fa');
  };
  updateTheme(${JSON.stringify(accentColor)}, ${JSON.stringify(mode)});
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== THEME_MESSAGE) return;
    updateTheme(data.accentColor, data.mode === 'light' ? 'light' : 'dark');
  });
})();
</script>`;
}

function injectIntoHtmlHead(html: string, snippet: string): string {
  const headMatch = html.match(/<head(\s[^>]*)?>|<head>/i);
  if (headMatch && headMatch.index !== undefined) {
    const insertPos = headMatch.index + headMatch[0].length;
    return html.slice(0, insertPos) + '\n' + snippet + '\n' + html.slice(insertPos);
  }

  return snippet + '\n' + html;
}

export function injectDtRuntime(
  html: string,
  options: {
    theme: PreviewThemeRuntime;
    streamId: string;
    bridgeToken: string;
  },
): string {
  const cleanHtml = stripDtInjections(html);
  const snippet = [
    createThemeLinkTag(options.theme.accentColor, options.theme.mode),
    createThemeSyncScript(options.theme.accentColor, options.theme.mode),
    UI_BUNDLE_SCRIPT_TAG,
    createHtmlBridgeScript(options.streamId, options.bridgeToken),
  ].join('\n');
  return injectIntoHtmlHead(cleanHtml, snippet);
}
