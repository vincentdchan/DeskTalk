import { parse as parsePartialJson, Allow } from 'partial-json';
import { randomUUID } from 'node:crypto';
import type pino from 'pino';
import { broadcastEvent } from '../messaging';
import { DEFAULT_THEME_PREFERENCES, type ThemePreferences } from '../theme-css';
import { createHtmlBridgeScript } from './html-bridge-script';
import { createThemeLinkTag } from './html-theme-link';
import { UI_BUNDLE_SCRIPT_TAG } from './html-ui-script';
import type { SendAiCommand } from './desktop-tool';

// ─── Types ───────────────────────────────────────────────────────────────────

type PreferenceValue = string | number | boolean;
type PreferenceReader = (
  key: string,
) => PreferenceValue | undefined | Promise<PreferenceValue | undefined>;

export type HtmlStreamState = 'idle' | 'streaming' | 'done' | 'failed';

export interface HtmlStreamSession {
  /** Unique stream identifier shared between coordinator and preview window. */
  streamId: string;
  /** Bridge authentication token. */
  bridgeToken: string;
  /** Current state of this streaming session. */
  state: HtmlStreamState;
  /** How much of the parsed `content` we've already sent to the preview. */
  streamedContentLength: number;
  /** Accumulated raw JSON argument string from toolcall_delta events. */
  accumulatedJson: string;
  /** The title extracted from partial JSON (used to open the window). */
  title: string | null;
  /** Whether the preview window has been opened. */
  windowOpened: boolean;
  /** Whether the synthetic preamble (theme + bridge) has been sent. */
  preambleSent: boolean;
  /** The window ID returned by sendAiCommand, if available. */
  windowId: string | null;
  /**
   * Offset into the LLM `content` string where actual streamable content
   * begins (right after the opening `<head…>` tag). Everything before this
   * is structural markup (`<!DOCTYPE html><html><head>`) that the preamble
   * already provides. Set to 0 if no `<head>` tag is found.
   */
  contentStartOffset: number;
}

// ─── Coordinator ─────────────────────────────────────────────────────────────

let streamCounter = 0;

function nextStreamId(): string {
  return `html-stream-${++streamCounter}-${Date.now()}`;
}

export class HtmlStreamCoordinator {
  /** The currently active streaming session, or null. */
  private activeSession: HtmlStreamSession | null = null;

  /**
   * A promise chain that serializes all async operations (opening the window,
   * sending the preamble, broadcasting chunks). Every call to `onToolcallDelta`
   * appends to this chain so that operations execute in order without races.
   */
  private pendingWork: Promise<void> = Promise.resolve();

  private readonly sendAiCommand: SendAiCommand;
  private readonly activateMiniApp: (miniAppId: string) => void;
  private readonly getPreference: PreferenceReader;
  private readonly log: pino.Logger;

  constructor(options: {
    sendAiCommand: SendAiCommand;
    activateMiniApp: (miniAppId: string) => void;
    getPreference: PreferenceReader;
    logger: pino.Logger;
  }) {
    this.sendAiCommand = options.sendAiCommand;
    this.activateMiniApp = options.activateMiniApp;
    this.getPreference = options.getPreference;
    this.log = options.logger;
  }

  /**
   * Returns the active session, if any.
   */
  getActiveSession(): HtmlStreamSession | null {
    return this.activeSession;
  }

  /**
   * Called when a `toolcall_start` event is detected for `generate_html`.
   * Creates a new streaming session.
   */
  onToolcallStart(): void {
    this.pendingWork = Promise.resolve();
    const streamId = nextStreamId();
    this.log.debug({ streamId }, 'onToolcallStart — new session');
    this.activeSession = {
      streamId,
      bridgeToken: randomUUID(),
      state: 'streaming',
      streamedContentLength: 0,
      accumulatedJson: '',
      title: null,
      windowOpened: false,
      preambleSent: false,
      windowId: null,
      contentStartOffset: -1,
    };
  }

  /**
   * Called on each `toolcall_delta` event while a session is active.
   *
   * This method is synchronous — it accumulates the JSON fragment immediately,
   * then queues any async work (window open, preamble, chunk broadcast) onto
   * the serialized `pendingWork` chain so operations never race.
   */
  onToolcallDelta(delta: string): void {
    const session = this.activeSession;
    if (!session || session.state !== 'streaming') return;

    // Skip empty deltas (OpenAI sometimes sends these on the first chunk)
    if (!delta) return;

    session.accumulatedJson += delta;

    // Attempt to parse partial JSON from the accumulated argument string
    let parsed: { title?: string; content?: string } | null = null;
    try {
      parsed = parsePartialJson(session.accumulatedJson, Allow.ALL) as {
        title?: string;
        content?: string;
      };
    } catch {
      // Partial JSON not parseable yet — that's fine, wait for more data
      return;
    }

    if (!parsed) return;

    // Extract title as soon as it's available
    if (!session.title && typeof parsed.title === 'string' && parsed.title.length > 0) {
      session.title = parsed.title;
      this.log.debug({ title: session.title }, 'title extracted');
    }

    // Capture the parsed content value for the queued async work
    const parsedTitle = session.title;
    const parsedContent = typeof parsed.content === 'string' ? parsed.content : null;
    const contentLen = parsedContent?.length ?? 0;
    const alreadyStreamed = session.streamedContentLength;

    // Only queue work if there's something new to do
    const needsWindowOpen = parsedTitle && !session.windowOpened;
    const hasNewContent = parsedContent !== null && contentLen > alreadyStreamed;

    if (!needsWindowOpen && !hasNewContent) return;

    // Queue async work onto the serialized chain
    this.pendingWork = this.pendingWork
      .then(async () => {
        // Re-check state — a previous step may have failed
        if (session.state !== 'streaming') return;

        // Open the preview window once we have a title
        if (parsedTitle && !session.windowOpened) {
          this.log.debug({ title: parsedTitle }, 'opening preview window');
          await this.openPreviewWindow(session);
          if (session.state !== 'streaming') {
            this.log.debug({ state: session.state }, 'openPreviewWindow failed');
            return; // failed to open
          }
          this.log.debug({ windowId: session.windowId }, 'preview window opened');
        }

        // Stream new HTML content
        if (parsedContent !== null && session.windowOpened) {
          // Send the preamble (theme + bridge script) before any content
          if (!session.preambleSent) {
            this.log.debug('sending preamble');
            await this.sendPreamble(session);
            this.log.debug('preamble sent');
          }

          // The preamble already provides `<!DOCTYPE html><html><head>`.
          // Detect the same structural prefix in the LLM content so we
          // can skip it and avoid the browser seeing duplicate tags.
          if (session.contentStartOffset < 0) {
            const headMatch = parsedContent.match(/<head(\s[^>]*)?>|<head>/i);
            if (headMatch && headMatch.index !== undefined) {
              session.contentStartOffset = headMatch.index + headMatch[0].length;
              this.log.debug(
                { contentStartOffset: session.contentStartOffset },
                'structural prefix detected — skipping',
              );
            } else if (parsedContent.length > 200) {
              // Content is long enough that <head> would have appeared by now.
              // Assume there is no <head> and stream from the beginning.
              session.contentStartOffset = 0;
              this.log.debug('no <head> found after 200 chars — streaming from start');
            } else {
              // Not enough content yet to decide; wait for more data.
              return;
            }
            // Jump our cursor past the structural prefix
            session.streamedContentLength = Math.max(
              session.streamedContentLength,
              session.contentStartOffset,
            );
          }

          const newContent = parsedContent.slice(session.streamedContentLength);
          if (newContent.length > 0) {
            this.log.debug(
              {
                chunkLength: newContent.length,
                totalStreamed: session.streamedContentLength + newContent.length,
              },
              'broadcasting chunk',
            );
            broadcastEvent('preview', 'preview.html-chunk', {
              streamId: session.streamId,
              chunk: newContent,
            });
            session.streamedContentLength = parsedContent.length;
          }
        }
      })
      .catch((err) => {
        // If any step in the chain fails, mark the session as failed
        this.log.error({ err }, 'error in streaming chain');
        if (session.state === 'streaming') {
          session.state = 'failed';
        }
      });
  }

  /**
   * Called when the `toolcall_end` event fires. The tool's `execute()` will run
   * next with the complete params, so we just mark the LLM streaming as done.
   */
  onToolcallEnd(): void {
    // Don't finalize here — execute() will handle the final flush + done signal.
  }

  /**
   * Called by `generate-html-tool.ts` execute() to finalize the stream.
   *
   * Waits for all pending async work (window open, preamble, chunk sends) to
   * complete, then sends any remaining content and the done signal.
   *
   * Returns the session info so execute() can build its result, or null if
   * no streaming session was active (fallback to non-streaming path).
   */
  async finalize(finalContent: string): Promise<HtmlStreamSession | null> {
    const session = this.activeSession;
    this.log.debug(
      {
        hasSession: !!session,
        state: session?.state,
        windowOpened: session?.windowOpened,
        streamedContentLength: session?.streamedContentLength,
        finalContentLength: finalContent.length,
      },
      'finalize() called',
    );
    if (!session || (session.state !== 'streaming' && session.state !== 'failed')) {
      this.log.debug('finalize() — no active session or wrong state, returning null');
      return null;
    }

    // Wait for all queued async work to finish
    await this.pendingWork;

    if (session.state === 'failed' || !session.windowOpened) {
      this.log.debug('finalize() — session failed or window not opened, returning null');
      this.activeSession = null;
      return null;
    }

    // Send any remaining content that wasn't streamed during deltas.
    // The `finalContent` here is the raw HTML content (not yet theme-injected),
    // because theme/bridge were sent as a preamble.
    if (session.preambleSent) {
      // If contentStartOffset was never determined during streaming (e.g. very
      // short content), detect it now from the final content.
      if (session.contentStartOffset < 0) {
        const headMatch = finalContent.match(/<head(\s[^>]*)?>|<head>/i);
        session.contentStartOffset =
          headMatch && headMatch.index !== undefined ? headMatch.index + headMatch[0].length : 0;
        session.streamedContentLength = Math.max(
          session.streamedContentLength,
          session.contentStartOffset,
        );
      }

      const remaining = finalContent.slice(session.streamedContentLength);
      if (remaining.length > 0) {
        this.log.debug(
          { remainingLength: remaining.length },
          'finalize() — sending remaining content',
        );
        broadcastEvent('preview', 'preview.html-chunk', {
          streamId: session.streamId,
          chunk: remaining,
        });
      }
    }

    // Signal that streaming is complete
    this.log.debug({ streamId: session.streamId }, 'finalize() — sending html-done');
    broadcastEvent('preview', 'preview.html-done', { streamId: session.streamId });

    session.state = 'done';
    const result = { ...session };
    this.activeSession = null;
    return result;
  }

  /**
   * Abort the current session (e.g. on error).
   */
  abort(): void {
    const session = this.activeSession;
    if (session && session.windowOpened) {
      broadcastEvent('preview', 'preview.html-done', { streamId: session.streamId });
    }
    if (session) {
      session.state = 'failed';
    }
    this.activeSession = null;
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private async openPreviewWindow(session: HtmlStreamSession): Promise<void> {
    this.activateMiniApp('preview');

    const commandResult = await this.sendAiCommand({
      action: 'open',
      miniAppId: 'preview',
      title: session.title ?? 'HTML Preview',
      args: {
        streamId: session.streamId,
        title: session.title ?? 'HTML Preview',
        bridgeToken: session.bridgeToken,
      },
    });

    if (!commandResult.ok) {
      session.state = 'failed';
      return;
    }

    session.windowId = commandResult.windowId ?? null;
    session.windowOpened = true;
  }

  private async sendPreamble(session: HtmlStreamSession): Promise<void> {
    const themePreferences = await readThemePreferences(this.getPreference);
    const themeLink = createThemeLinkTag(themePreferences.accentColor, themePreferences.theme);
    const bridgeScript = createHtmlBridgeScript(session.streamId, session.bridgeToken);

    // We send the preamble as the very first chunk, *before* the LLM's HTML.
    // The LLM content typically starts with `<!DOCTYPE html><html><head>…`.
    // To avoid the browser's parser creating implicit structure around our
    // preamble (which would clash with the LLM's structural tags), we wrap
    // the preamble in a structure the browser can merge cleanly:
    //
    //   <!DOCTYPE html><html><head>
    //     <link rel="stylesheet" href="/api/ui/desktalk-theme.css?…">
    //     <script>…bridge…</script>
    //   <!-- preamble end -->
    //
    // Then, when the LLM's `<!DOCTYPE html><html><head>` arrives, the parser
    // sees duplicate structural tags and simply ignores them (per the HTML
    // spec, duplicate <html>/<head> tags are dropped). The LLM's <head>
    // children (like <title>, <meta>, additional <style>) are adopted into
    // the already-open <head>.
    const preamble =
      '<!DOCTYPE html><html><head>\n' +
      themeLink +
      '\n' +
      UI_BUNDLE_SCRIPT_TAG +
      '\n' +
      bridgeScript +
      '\n';

    broadcastEvent('preview', 'preview.html-chunk', {
      streamId: session.streamId,
      chunk: preamble,
    });

    session.preambleSent = true;
  }
}

// ─── Utility (shared with generate-html-tool) ────────────────────────────────

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
