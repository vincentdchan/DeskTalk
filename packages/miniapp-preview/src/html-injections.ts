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
    UI_BUNDLE_SCRIPT_TAG,
    createHtmlBridgeScript(options.streamId, options.bridgeToken),
  ].join('\n');
  return injectIntoHtmlHead(cleanHtml, snippet);
}
