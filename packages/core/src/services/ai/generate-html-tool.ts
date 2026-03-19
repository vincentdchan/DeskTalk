import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import type { SendAiCommand } from './desktop-tool';
import { broadcastEvent } from '../messaging';
import { randomUUID } from 'node:crypto';
import {
  generateThemeCSS,
  HTML_BASE_STYLESHEET,
  DEFAULT_THEME_PREFERENCES,
  type ThemePreferences,
} from '../theme-css';
import { createHtmlBridgeScript } from './html-bridge-script';

const generateHtmlSchema = Type.Object({
  title: Type.String({ description: 'Window title for the generated HTML preview' }),
  content: Type.String({
    description: 'Complete HTML content to display. Must be a self-contained HTML document.',
  }),
});

type GenerateHtmlParams = {
  title: string;
  content: string;
};

type PreferenceValue = string | number | boolean;
type PreferenceReader = (
  key: string,
) => PreferenceValue | undefined | Promise<PreferenceValue | undefined>;

interface GenerateHtmlToolOptions {
  sendAiCommand: SendAiCommand;
  activateMiniApp: (miniAppId: string) => void;
  getPreference: PreferenceReader;
}

let streamCounter = 0;

function nextStreamId(): string {
  return `html-stream-${++streamCounter}-${Date.now()}`;
}

/**
 * Read the current theme preferences from the preference store.
 */
async function readThemePreferences(getPreference: PreferenceReader): Promise<ThemePreferences> {
  const accentColor = await getPreference('general.accentColor');
  const theme = await getPreference('general.theme');

  return {
    accentColor:
      typeof accentColor === 'string' && accentColor
        ? accentColor
        : DEFAULT_THEME_PREFERENCES.accentColor,
    theme: theme === 'dark' ? 'dark' : 'light',
  };
}

/**
 * Inject the DeskTalk theme tokens and base stylesheet into AI-generated HTML.
 *
 * Strategy: insert a `<style>` block right after the opening `<head>` tag.
 * If there is no `<head>`, prepend it before the content.
 */
function injectThemeIntoHtml(html: string, themePreferences: ThemePreferences): string {
  const themeCSS = generateThemeCSS(themePreferences);
  const injectedStyle = `<style data-dt-theme>\n${themeCSS}\n${HTML_BASE_STYLESHEET}\n</style>`;

  // Try to inject after <head> or <head ...>
  const headMatch = html.match(/<head(\s[^>]*)?>|<head>/i);
  if (headMatch && headMatch.index !== undefined) {
    const insertPos = headMatch.index + headMatch[0].length;
    return html.slice(0, insertPos) + '\n' + injectedStyle + '\n' + html.slice(insertPos);
  }

  // No <head> tag found — prepend the style block before the entire content
  return injectedStyle + '\n' + html;
}

function injectIntoHtmlHead(html: string, snippet: string): string {
  const headMatch = html.match(/<head(\s[^>]*)?>|<head>/i);
  if (headMatch && headMatch.index !== undefined) {
    const insertPos = headMatch.index + headMatch[0].length;
    return html.slice(0, insertPos) + '\n' + snippet + '\n' + html.slice(insertPos);
  }

  return snippet + '\n' + html;
}

export function createGenerateHtmlTool(options: GenerateHtmlToolOptions): ToolDefinition {
  const { sendAiCommand, activateMiniApp, getPreference } = options;

  return {
    name: 'generate_html',
    label: 'Generate HTML',
    description:
      'Generate visual HTML content and display it in a Preview window. Use this when the user asks to show something visually — charts, diagrams, styled layouts, interactive widgets, etc.',
    promptSnippet: 'Generate and display HTML content in a Preview window.',
    promptGuidelines: [
      'Use this tool when the user asks you to show, visualize, display, or render something visually.',
      'Provide a complete, self-contained HTML document including <html>, <head>, and <body> tags.',
      'Generated previews automatically receive a `window.DeskTalk` bridge for reading safe desktop state and running constrained commands.',
      'Before using custom styling, call read_html_guidelines if you need the full DeskTalk token and class reference.',
    ],
    parameters: generateHtmlSchema,
    async execute(_toolCallId, params) {
      const input = params as GenerateHtmlParams;
      const streamId = nextStreamId();
      const bridgeToken = randomUUID();

      // Read current theme preferences and inject into the HTML
      const themePreferences = await readThemePreferences(getPreference);
      const themedHtml = injectThemeIntoHtml(input.content, themePreferences);
      const bridgedHtml = injectIntoHtmlHead(
        themedHtml,
        createHtmlBridgeScript(streamId, bridgeToken),
      );

      // Ensure the preview MiniApp is activated
      activateMiniApp('preview');

      // Open a Preview window in stream mode
      const commandResult = await sendAiCommand({
        action: 'open',
        miniAppId: 'preview',
        title: input.title,
        args: { streamId, title: input.title, bridgeToken },
      });

      if (!commandResult.ok) {
        throw new Error(commandResult.error ?? 'Failed to open Preview window');
      }

      // Small delay to let the frontend mount and register event listeners
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Broadcast the themed HTML content as a single chunk
      broadcastEvent('preview', 'preview.html-chunk', {
        streamId,
        chunk: bridgedHtml,
      });

      // Signal that streaming is complete
      broadcastEvent('preview', 'preview.html-done', { streamId });

      const result = {
        ok: true,
        windowId: commandResult.windowId,
        title: input.title,
        streamId,
        contentLength: bridgedHtml.length,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
