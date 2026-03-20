import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  readTool,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent';
import { createDesktopTool, type SendAiCommand } from './desktop-tool';
import { createActionTool } from './action-tool';
import { createGenerateHtmlTool } from './generate-html-tool';
import { createReadHtmlGuidelinesTool } from './html-guidelines-tool';
import { HtmlStreamCoordinator } from './html-stream-coordinator';
import type { AssistantMessage, ToolCall } from '@mariozechner/pi-ai';
import type pino from 'pino';
import {
  AI_PROVIDER_DEFINITIONS,
  getAiProviderPreferences,
  getAllAiProviderPreferences,
  getDefaultAiProvider,
  type PreferenceReader,
} from './providers';
import type { WindowManagerService } from '../window-manager';
import { registry } from '../miniapp-registry';
import type { WorkspacePaths } from '../workspace';
import { DESKTALK_SYSTEM_PROMPT } from './system-prompt';

export type ChatSource = 'text' | 'voice';

export interface ToolCallInfo {
  toolName: string;
  params: Record<string, unknown>;
}

export interface HistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  source?: ChatSource;
  provider?: string;
  model?: string;
  totalTokens?: number;
  /** When present, this message represents a tool call (rendered as a standalone row). */
  toolCall?: ToolCallInfo;
}

export interface PromptInput {
  text: string;
  source: ChatSource;
  provider?: string;
}

export interface PromptCallbacks {
  onEvent: (event: Record<string, unknown>) => void;
}

export interface AiProviderOption {
  id: string;
  label: string;
  configured: boolean;
  model: string;
}

interface MessageMetadata {
  source?: ChatSource;
}

interface MessageMetadataStore {
  byKey: Record<string, MessageMetadata>;
}

type BasicUserMessage = {
  role: 'user';
  content: string | Array<{ text?: string }>;
  timestamp: number;
};

type BasicAssistantMessage = {
  role: 'assistant';
  content: Array<{ type?: string; text?: string }>;
  provider: string;
  model: string;
  usage: { total: number };
  timestamp: number;
};

type BasicAgentMessage =
  | BasicUserMessage
  | BasicAssistantMessage
  | { role: string; timestamp: number };

function isUserMessage(message: BasicAgentMessage): message is BasicUserMessage {
  return message.role === 'user';
}

function isAssistantMessage(message: BasicAgentMessage): message is BasicAssistantMessage {
  return message.role === 'assistant';
}

function getMessageKey(role: 'user' | 'assistant', timestamp: number): string {
  return `${role}:${timestamp}`;
}

/**
 * Strip the `[Desktop Context]...[/Desktop Context]` block that we prepend
 * to every user message before sending it to pi. The frontend should never
 * display this internal metadata.
 */
const DESKTOP_CONTEXT_RE = /\[Desktop Context\][\s\S]*?\[\/Desktop Context\]\s*/;

function stripDesktopContext(text: string): string {
  return text.replace(DESKTOP_CONTEXT_RE, '').trim();
}

/**
 * Build a short summary of generated HTML content for the conversation history.
 *
 * This replaces the full HTML string in `ToolCall.arguments.content` so that:
 * 1. The LLM doesn't re-read (and anchor on) its own previous output.
 * 2. We save tokens on every subsequent round-trip.
 *
 * The summary preserves the document structure (headings, dt-card titles,
 * tag counts) so the LLM still knows *what* it generated, just not the
 * exact markup.
 */
export function summarizeHtml(html: string): string {
  const lines: string[] = [];

  // Byte length
  const bytes = Buffer.byteLength(html, 'utf-8');
  const sizeLabel = bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
  lines.push(`[HTML content removed from context to save tokens — ${sizeLabel}]`);

  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    lines.push(`Title: ${titleMatch[1].trim()}`);
  }

  // Count dt-card elements
  const cardMatches = html.match(/<dt-card[\s>]/gi);
  if (cardMatches) {
    lines.push(`Sections: ${cardMatches.length} dt-card(s)`);
  }

  // Extract headings (h1–h6 text, up to 8)
  const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headings: string[] = [];
  let hMatch: RegExpExecArray | null;
  while ((hMatch = headingRe.exec(html)) !== null && headings.length < 8) {
    const text = hMatch[2].replace(/<[^>]+>/g, '').trim();
    if (text) headings.push(`  h${hMatch[1]}: ${text}`);
  }
  if (headings.length > 0) {
    lines.push(`Headings:\n${headings.join('\n')}`);
  }

  return lines.join('\n');
}

/**
 * Scrub `generate_html` tool-call arguments in an assistant message so the
 * full HTML is not re-sent to the LLM on subsequent turns.
 *
 * Mutates `message.content` in-place — this must be called synchronously in
 * the `message_end` subscriber, **before** session persistence runs.
 */
export function scrubHtmlToolCallArgs(message: AssistantMessage): void {
  for (const block of message.content) {
    if (
      block.type === 'toolCall' &&
      (block as ToolCall).name === 'generate_html' &&
      typeof (block as ToolCall).arguments?.content === 'string'
    ) {
      const toolCall = block as ToolCall;
      const originalHtml: string = toolCall.arguments.content;
      toolCall.arguments.content = summarizeHtml(originalHtml);
    }
  }
}

function getMessageText(message: BasicUserMessage | BasicAssistantMessage): string {
  if (message.role === 'user') {
    if (typeof message.content === 'string') {
      return message.content.trim();
    }
    return message.content
      .map((part: { text?: string }) => (typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  }

  if (message.role === 'assistant') {
    return message.content
      .map((part: { type?: string; text?: string }) => {
        if (part.type === 'text' && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('')
      .trim();
  }

  return '';
}

function readMetadata(filePath: string): MessageMetadataStore {
  if (!existsSync(filePath)) {
    return { byKey: {} };
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as MessageMetadataStore;
  } catch {
    return { byKey: {} };
  }
}

function writeMetadata(filePath: string, store: MessageMetadataStore): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

function shouldRegisterProviderBaseUrl(provider: string, baseUrl: string): boolean {
  return (
    Boolean(baseUrl) &&
    [
      'azure-openai-responses',
      'openai',
      'mistral',
      'groq',
      'cerebras',
      'xai',
      'openrouter',
      'vercel-ai-gateway',
      'huggingface',
      'ollama',
    ].includes(provider)
  );
}

export class PiSessionService {
  private readonly authStorage;
  private readonly modelRegistry;
  private readonly sessionManager;
  private readonly metadataFilePath: string;
  private readonly getPreference: PreferenceReader;
  private readonly session: AgentSession;
  private readonly resourceLoader: DefaultResourceLoader;
  private readonly windowManager: WindowManagerService;
  private readonly htmlStreamCoordinator: HtmlStreamCoordinator;
  private readonly log: pino.Logger;

  private constructor(options: {
    session: AgentSession;
    authStorage: AuthStorage;
    modelRegistry: ModelRegistry;
    sessionManager: SessionManager;
    metadataFilePath: string;
    getPreference: PreferenceReader;
    resourceLoader: DefaultResourceLoader;
    windowManager: WindowManagerService;
    htmlStreamCoordinator: HtmlStreamCoordinator;
    logger: pino.Logger;
  }) {
    this.session = options.session;
    this.authStorage = options.authStorage;
    this.modelRegistry = options.modelRegistry;
    this.sessionManager = options.sessionManager;
    this.metadataFilePath = options.metadataFilePath;
    this.getPreference = options.getPreference;
    this.resourceLoader = options.resourceLoader;
    this.windowManager = options.windowManager;
    this.htmlStreamCoordinator = options.htmlStreamCoordinator;
    this.log = options.logger;
  }

  static async create(
    workspacePaths: WorkspacePaths,
    getPreference: PreferenceReader,
    windowManager: WindowManagerService,
    invokeAction: (
      windowId: string,
      actionName: string,
      actionParams?: Record<string, unknown>,
    ) => Promise<unknown>,
    sendAiCommand: SendAiCommand,
    getCurrentUsername: () => string,
    logger: pino.Logger,
  ): Promise<PiSessionService> {
    const authStorage = AuthStorage.create(join(workspacePaths.config, 'pi-auth.json'));
    const modelRegistry = new ModelRegistry(authStorage);
    const sessionDir = join(workspacePaths.data, 'ai-sessions');
    mkdirSync(sessionDir, { recursive: true });

    const sessionManager = SessionManager.continueRecent(process.cwd(), sessionDir);

    const allProviderPreferences = await getAllAiProviderPreferences(getPreference);
    for (const config of allProviderPreferences) {
      if (config.apiKey) {
        authStorage.setRuntimeApiKey(config.provider, config.apiKey);
      }

      if (shouldRegisterProviderBaseUrl(config.provider, config.baseUrl)) {
        modelRegistry.registerProvider(config.provider, {
          baseUrl: config.baseUrl,
          ...(config.apiKey ? { apiKey: config.apiKey } : {}),
          authHeader: config.provider !== 'ollama',
        });
      }
    }

    const defaultProvider = await getDefaultAiProvider(getPreference);
    const defaultProviderPreferences = await getAiProviderPreferences(
      getPreference,
      defaultProvider,
    );
    const initialModel = defaultProviderPreferences.model
      ? modelRegistry.find(defaultProvider, defaultProviderPreferences.model)
      : modelRegistry.getAvailable().find((model) => model.provider === defaultProvider);

    const resourceLoader = new DefaultResourceLoader({
      cwd: process.cwd(),
      appendSystemPromptOverride: (base) => [...base, DESKTALK_SYSTEM_PROMPT],
    });
    await resourceLoader.reload();

    const htmlStreamCoordinator = new HtmlStreamCoordinator({
      sendAiCommand,
      activateMiniApp: (miniAppId: string) => {
        registry.activate(miniAppId, getCurrentUsername());
      },
      getPreference,
      logger: logger.child({ scope: 'html-stream' }),
    });

    const customTools = [
      createDesktopTool({
        windowManager,
        getMiniApps: () => registry.getManifests(),
        activateMiniApp: (miniAppId: string) => {
          registry.activate(miniAppId, getCurrentUsername());
        },
        sendAiCommand,
      }),
      createActionTool({
        windowManager,
        invokeAction,
      }),
      createGenerateHtmlTool({
        sendAiCommand,
        activateMiniApp: (miniAppId: string) => {
          registry.activate(miniAppId, getCurrentUsername());
        },
        getPreference,
        streamCoordinator: htmlStreamCoordinator,
      }),
      createReadHtmlGuidelinesTool(),
    ];

    const { session } = await createAgentSession({
      cwd: process.cwd(),
      authStorage,
      modelRegistry,
      model: initialModel,
      sessionManager,
      tools: [readTool],
      customTools,
      resourceLoader,
    });

    return new PiSessionService({
      session,
      authStorage,
      modelRegistry,
      sessionManager,
      metadataFilePath: join(workspacePaths.data, 'storage', 'ai-message-metadata.json'),
      getPreference,
      resourceLoader,
      windowManager,
      htmlStreamCoordinator,
      logger,
    });
  }

  getSessionId(): string {
    return this.session.sessionId;
  }

  async getProviderOptions(): Promise<{ defaultProvider: string; providers: AiProviderOption[] }> {
    await this.syncProviderCredentials();

    const defaultProvider = await getDefaultAiProvider(this.getPreference);
    const availableByProvider = new Set(
      this.modelRegistry.getAvailable().map((model) => model.provider),
    );
    const configuredProviders = await getAllAiProviderPreferences(this.getPreference);

    return {
      defaultProvider,
      providers: AI_PROVIDER_DEFINITIONS.map((provider) => {
        const config = configuredProviders.find((entry) => entry.provider === provider.id);
        return {
          id: provider.id,
          label: provider.label,
          configured:
            availableByProvider.has(provider.id) ||
            Boolean(config?.model.trim()) ||
            Boolean(config?.apiKey.trim()) ||
            Boolean(config?.baseUrl.trim()),
          model: config?.model ?? '',
        };
      }),
    };
  }

  private async syncProviderCredentials(): Promise<void> {
    const configuredProviders = await getAllAiProviderPreferences(this.getPreference);

    for (const config of configuredProviders) {
      if (config.apiKey) {
        this.authStorage.setRuntimeApiKey(config.provider, config.apiKey);
      } else {
        this.authStorage.removeRuntimeApiKey(config.provider);
      }

      if (shouldRegisterProviderBaseUrl(config.provider, config.baseUrl)) {
        this.modelRegistry.registerProvider(config.provider, {
          baseUrl: config.baseUrl,
          ...(config.apiKey ? { apiKey: config.apiKey } : {}),
          authHeader: config.provider !== 'ollama',
        });
      } else {
        this.modelRegistry.unregisterProvider(config.provider);
      }
    }
  }

  private async syncPreferences(providerOverride?: string): Promise<void> {
    await this.resourceLoader.reload();
    await this.syncProviderCredentials();

    const configuredProvider = providerOverride ?? (await getDefaultAiProvider(this.getPreference));
    const configuredModel = (await getAiProviderPreferences(this.getPreference, configuredProvider))
      .model;
    const targetModel = configuredModel
      ? this.modelRegistry.find(configuredProvider, configuredModel)
      : this.modelRegistry.getAvailable().find((model) => model.provider === configuredProvider);

    if (!targetModel) {
      throw new Error(
        configuredModel
          ? `Configured model not found: ${configuredProvider}/${configuredModel}`
          : `No model available for ${configuredProvider}. Configure a model in Preferences -> AI.`,
      );
    }

    if (
      !this.session.model ||
      this.session.model.provider !== targetModel.provider ||
      this.session.model.id !== targetModel.id
    ) {
      await this.session.setModel(targetModel);
    }
  }

  private saveMessageMetadata(
    role: 'user' | 'assistant',
    timestamp: number,
    metadata: MessageMetadata,
  ) {
    const store = readMetadata(this.metadataFilePath);
    store.byKey[getMessageKey(role, timestamp)] = metadata;
    writeMetadata(this.metadataFilePath, store);
  }

  private getMessageMetadata(
    role: 'user' | 'assistant',
    timestamp: number,
  ): MessageMetadata | undefined {
    return readMetadata(this.metadataFilePath).byKey[getMessageKey(role, timestamp)];
  }

  getHistory(): HistoryMessage[] {
    const result: HistoryMessage[] = [];

    for (const message of this.session.messages) {
      if (message.role !== 'user' && message.role !== 'assistant') {
        continue;
      }

      const typedMessage = message as BasicAgentMessage;
      const role = typedMessage.role as 'user' | 'assistant';
      const metadata = this.getMessageMetadata(role, typedMessage.timestamp);

      if (isUserMessage(typedMessage)) {
        const content = stripDesktopContext(getMessageText(typedMessage));
        result.push({
          id: getMessageKey(role, typedMessage.timestamp),
          role,
          content,
          timestamp: typedMessage.timestamp,
          source: metadata?.source ?? 'text',
        });
        continue;
      }

      if (isAssistantMessage(typedMessage)) {
        const baseId = getMessageKey(role, typedMessage.timestamp);
        const assistantFields = {
          provider: typedMessage.provider,
          model: typedMessage.model,
          totalTokens: typedMessage.usage.total,
        };

        // Walk through content blocks and emit separate entries for text vs tool calls
        let textAccumulator = '';
        let blockIndex = 0;

        for (const block of typedMessage.content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            textAccumulator += block.text;
          } else if (block.type === 'toolCall') {
            // Flush accumulated text before the tool call
            const trimmedText = textAccumulator.trim();
            if (trimmedText) {
              result.push({
                id: `${baseId}:text-${blockIndex}`,
                role,
                content: trimmedText,
                timestamp: typedMessage.timestamp,
                ...assistantFields,
              });
              blockIndex += 1;
            }
            textAccumulator = '';

            // Emit tool call as a standalone message
            const toolBlock = block as {
              type: string;
              name: string;
              arguments: Record<string, unknown>;
            };
            result.push({
              id: `${baseId}:tool-${blockIndex}`,
              role,
              content: '',
              timestamp: typedMessage.timestamp,
              ...assistantFields,
              toolCall: {
                toolName: toolBlock.name,
                params: toolBlock.arguments ?? {},
              },
            });
            blockIndex += 1;
          }
        }

        // Flush any remaining text after the last tool call
        const trimmedText = textAccumulator.trim();
        if (trimmedText) {
          result.push({
            id: blockIndex > 0 ? `${baseId}:text-${blockIndex}` : baseId,
            role,
            content: trimmedText,
            timestamp: typedMessage.timestamp,
            ...assistantFields,
          });
        } else if (blockIndex === 0) {
          // No content blocks produced anything — emit empty message so the UI
          // can show a placeholder if needed
          result.push({
            id: baseId,
            role,
            content: '',
            timestamp: typedMessage.timestamp,
            ...assistantFields,
          });
        }
      }
    }

    return result;
  }

  async prompt(input: PromptInput, callbacks: PromptCallbacks): Promise<void> {
    await this.syncPreferences(input.provider);

    const { onEvent } = callbacks;
    let pendingUserSource: ChatSource | null = input.source;
    let currentAssistantText = '';

    const unsubscribe = this.session.subscribe((event: AgentSessionEvent) => {
      if (
        event.type === 'message_start' &&
        isAssistantMessage(event.message as BasicAgentMessage)
      ) {
        const message = event.message as unknown as BasicAssistantMessage;
        currentAssistantText = '';
        onEvent({
          type: 'message_start',
          provider: message.provider,
          model: message.model,
        });
        return;
      }

      if (
        event.type === 'message_update' &&
        isAssistantMessage(event.message as BasicAgentMessage)
      ) {
        const message = event.message as unknown as BasicAssistantMessage;
        const msgEvent = event.assistantMessageEvent;

        if (msgEvent.type === 'text_delta') {
          currentAssistantText += msgEvent.delta;
          onEvent({
            type: 'message_update',
            text: currentAssistantText,
            provider: message.provider,
            model: message.model,
          });
        }

        // ── HTML streaming via toolcall events ──────────────────────
        if (msgEvent.type === 'toolcall_start') {
          const partialMsg = msgEvent.partial as AssistantMessage;
          const toolContent = partialMsg.content[msgEvent.contentIndex] as ToolCall | undefined;
          this.log.debug(
            {
              toolName: toolContent?.name,
              toolType: toolContent?.type,
              contentIndex: msgEvent.contentIndex,
            },
            'toolcall_start received',
          );
          if (
            toolContent &&
            toolContent.type === 'toolCall' &&
            toolContent.name === 'generate_html'
          ) {
            this.log.debug('detected generate_html — calling onToolcallStart()');
            this.htmlStreamCoordinator.onToolcallStart();
          }
        }

        if (msgEvent.type === 'toolcall_delta') {
          const session = this.htmlStreamCoordinator.getActiveSession();
          if (session && session.state === 'streaming') {
            this.htmlStreamCoordinator.onToolcallDelta(msgEvent.delta);
          }
        }

        // Emit structured tool_call event so the frontend can render it as a standalone row
        if (msgEvent.type === 'toolcall_end') {
          const toolCall = msgEvent.toolCall as ToolCall;
          if (toolCall) {
            // Reset accumulated text — the text before this tool call is already sent;
            // any text after will start fresh.
            currentAssistantText = '';
            onEvent({
              type: 'tool_call',
              toolCall: {
                toolName: toolCall.name,
                params: toolCall.arguments ?? {},
              },
            });
          }
        }

        return;
      }

      if (event.type === 'message_end') {
        if (isUserMessage(event.message as BasicAgentMessage) && pendingUserSource) {
          this.saveMessageMetadata('user', (event.message as BasicUserMessage).timestamp, {
            source: pendingUserSource,
          });
          pendingUserSource = null;
          return;
        }

        if (isAssistantMessage(event.message as BasicAgentMessage)) {
          const message = event.message as unknown as BasicAssistantMessage;

          // Scrub large HTML content from generate_html tool calls so it
          // is not re-sent on every subsequent LLM round-trip.  This runs
          // synchronously before session persistence (step 8c in the event
          // pipeline) so both in-memory state and the session file reflect
          // the summarised version.
          // scrubHtmlToolCallArgs(event.message as unknown as AssistantMessage);

          onEvent({
            type: 'message_end',
            text: getMessageText(message),
            provider: message.provider,
            model: message.model,
            usage: {
              totalTokens: message.usage.total,
            },
          });
        }
      }
    });

    try {
      // Prepend the dynamic desktop context to the user's message so the AI
      // always sees the current windows, MiniApps, and available actions
      // without requiring an extra tool call.
      const desktopContext = this.windowManager.getDesktopContext(registry.getManifests());
      const augmentedText = `${desktopContext}\n\n${input.text}`;
      await this.session.prompt(augmentedText);
    } finally {
      unsubscribe();
    }
  }
}
