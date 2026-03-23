import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import type { SendAiCommand } from './desktop-tool';
import { broadcastEvent } from '../messaging';
import { randomUUID } from 'node:crypto';
import { DEFAULT_THEME_PREFERENCES, type ThemePreferences } from '../theme-css';
import { createHtmlBridgeScript } from './html-bridge-script';
import { createThemeLinkTag } from './html-theme-link';
import { UI_BUNDLE_SCRIPT_TAG } from './html-ui-script';
import type { HtmlStreamCoordinator } from './html-stream-coordinator';

const createLiveAppSchema = Type.Object({
  title: Type.String({ description: 'Window title for the generated LiveApp' }),
  content: Type.String({
    description: 'Complete HTML content for the LiveApp. Must be a self-contained HTML document.',
  }),
});

type CreateLiveAppParams = {
  title: string;
  content: string;
};

type PreferenceValue = string | number | boolean;
type PreferenceReader = (
  key: string,
) => PreferenceValue | undefined | Promise<PreferenceValue | undefined>;

interface CreateLiveAppToolOptions {
  sendAiCommand: SendAiCommand;
  activateMiniApp: (miniAppId: string) => void;
  getPreference: PreferenceReader;
  /** Shared coordinator for streaming HTML content from toolcall_delta events. */
  streamCoordinator: HtmlStreamCoordinator;
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
    theme: theme === 'light' ? 'light' : DEFAULT_THEME_PREFERENCES.theme,
  };
}

/**
 * Inject the DeskTalk theme CSS `<link>` tag into AI-generated HTML.
 *
 * Strategy: insert a `<link>` right after the opening `<head>` tag.
 * If there is no `<head>`, prepend it before the content.
 */
function injectThemeIntoHtml(html: string, themePreferences: ThemePreferences): string {
  const themeLink = createThemeLinkTag(themePreferences.accentColor, themePreferences.theme);

  // Try to inject after <head> or <head ...>
  const headMatch = html.match(/<head(\s[^>]*)?>|<head>/i);
  if (headMatch && headMatch.index !== undefined) {
    const insertPos = headMatch.index + headMatch[0].length;
    return html.slice(0, insertPos) + '\n' + themeLink + '\n' + html.slice(insertPos);
  }

  // No <head> tag found — prepend the link before the entire content
  return themeLink + '\n' + html;
}

function injectIntoHtmlHead(html: string, snippet: string): string {
  const headMatch = html.match(/<head(\s[^>]*)?>|<head>/i);
  if (headMatch && headMatch.index !== undefined) {
    const insertPos = headMatch.index + headMatch[0].length;
    return html.slice(0, insertPos) + '\n' + snippet + '\n' + html.slice(insertPos);
  }

  return snippet + '\n' + html;
}

export function createLiveAppTool(options: CreateLiveAppToolOptions): ToolDefinition {
  const { sendAiCommand, activateMiniApp, getPreference, streamCoordinator } = options;

  return {
    name: 'create_liveapp',
    label: 'Create LiveApp',
    description:
      'Create a persistent LiveApp and display it in a Preview window. Use this when the user asks to show something visually — charts, diagrams, styled layouts, interactive widgets, dashboards, or tools.',
    promptSnippet: 'Create and display a persistent LiveApp in a Preview window.',
    promptGuidelines: [
      'Use this tool when the user asks you to show, visualize, display, or render something visually.',
      'Provide a complete, self-contained HTML document including <html>, <head>, and <body> tags.',
      'Follow DeskTalk HTML manual guidance for `<dt-card>` usage, layout rules, and pre-styled typography.',
      'Created LiveApps automatically receive a `window.DeskTalk` bridge for reading safe desktop state, persisting app data, and running constrained commands.',
      'Use `window.DeskTalk.storage` for persistent app data. Prefer KV storage for settings and `storage.collection(name)` for user-editable records such as tasks, rows, or bookmarks.',
      'The bridge also exposes `exec` / `execute` — both accept either a shell string (`window.DeskTalk.exec("ls -la")`) or explicit arguments (`window.DeskTalk.exec("ls", ["-la"])`).',
      'Call `read_manual` with pages such as `html/tokens`, `html/components`, `html/layouts`, `html/bridge`, `html/storage`, or `html/examples` when you need the full DeskTalk reference.',
    ],
    parameters: createLiveAppSchema,
    async execute(_toolCallId, params) {
      const input = params as CreateLiveAppParams;

      // ── Streaming path ──────────────────────────────────────────────
      // If the coordinator already streamed content via toolcall_delta,
      // finalize the stream with any remaining content.
      const activeSession = streamCoordinator.getActiveSession();
      if (activeSession && activeSession.state === 'streaming' && activeSession.windowOpened) {
        const session = await streamCoordinator.finalize(input.content);
        if (session) {
          const result = {
            ok: true,
            windowId: session.windowId,
            title: input.title,
            streamId: session.streamId,
            contentLength: input.content.length,
            streamed: true,
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            details: result,
          };
        }
      }

      // ── Fallback: non-streaming path ────────────────────────────────
      // Abort any partially-started session that didn't fully open.
      streamCoordinator.abort();

      const streamId = nextStreamId();
      const bridgeToken = randomUUID();

      // Read current theme preferences and inject into the HTML
      const themePreferences = await readThemePreferences(getPreference);
      const themedHtml = injectThemeIntoHtml(input.content, themePreferences);
      const bridgedHtml = injectIntoHtmlHead(
        themedHtml,
        UI_BUNDLE_SCRIPT_TAG + '\n' + createHtmlBridgeScript(streamId, bridgeToken),
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
      broadcastEvent('preview', 'preview.html-done', { streamId, html: input.content });

      const result = {
        ok: true,
        windowId: commandResult.windowId,
        title: input.title,
        streamId,
        contentLength: bridgedHtml.length,
        streamed: false,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
