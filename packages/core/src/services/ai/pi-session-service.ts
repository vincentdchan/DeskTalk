import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent';
import { createDesktopTool, type SendAiCommand } from './desktop-tool';
import { createActionTool } from './action-tool';
import type { WindowManagerService } from '../window-manager';
import { registry } from '../miniapp-registry';
import type { WorkspacePaths } from '../workspace';

/**
 * Static system prompt — fully cacheable, never changes between prompts.
 *
 * Describes the DeskTalk environment, the two tools (`desktop` and `action`),
 * and how the dynamic `[Desktop Context]` block works.
 */
const DESKTALK_SYSTEM_PROMPT = [
  'You are an AI assistant running inside DeskTalk, a browser-based OS-like desktop environment.',
  'DeskTalk has MiniApp windows (Notes, Todos, File Explorer, Preferences, etc.) that users interact with.',
  '',
  '## Tools',
  '',
  'You have two tools:',
  '',
  '### desktop',
  'Manage windows on the desktop.',
  '- action="list": get the latest window IDs, focused window actions, and available MiniApps.',
  '- action="open": launch a MiniApp by miniAppId.',
  '- action="focus" / "minimize" / "maximize" / "close": operate on a window by windowId.',
  '',
  '### action',
  'Invoke a MiniApp action by name with JSON parameters.',
  '- name: the action name (from the Desktop Context block).',
  '- params: a JSON object matching the parameter schema described in the Desktop Context.',
  '- windowId: optional, defaults to the focused window.',
  '',
  '## Desktop Context',
  '',
  'Every user message begins with a `[Desktop Context]` block that shows:',
  '- Which window is focused and its ID.',
  '- All open windows.',
  '- Available MiniApps that can be opened.',
  '- Actions registered on the focused window, with parameter schemas.',
  '',
  'Use this block to decide which actions are available and what parameters they accept.',
  'If you need fresher state mid-conversation (e.g., after opening a new window), call desktop action="list".',
  '',
  '## Guidelines',
  '',
  '- Read the [Desktop Context] block before invoking actions — it tells you exactly what is available.',
  '- Provide all required params as a JSON object when invoking an action.',
  '- If you need to act on a different window, either focus it first or pass its windowId explicitly.',
  '- Prefer completing user requests in as few tool calls as possible.',
].join('\n');

export type ChatSource = 'text' | 'voice';

export interface HistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  source?: ChatSource;
  provider?: string;
  model?: string;
  totalTokens?: number;
}

export interface PromptInput {
  text: string;
  source: ChatSource;
}

export interface PromptCallbacks {
  onEvent: (event: Record<string, unknown>) => void;
}

interface MessageMetadata {
  source?: ChatSource;
}

interface MessageMetadataStore {
  byKey: Record<string, MessageMetadata>;
}

interface PreferenceReader {
  (key: string): Promise<string | number | boolean | undefined>;
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

export class PiSessionService {
  private readonly authStorage;
  private readonly modelRegistry;
  private readonly sessionManager;
  private readonly metadataFilePath: string;
  private readonly getPreference: PreferenceReader;
  private readonly session: AgentSession;
  private readonly resourceLoader: DefaultResourceLoader;
  private readonly windowManager: WindowManagerService;

  private constructor(options: {
    session: AgentSession;
    authStorage: AuthStorage;
    modelRegistry: ModelRegistry;
    sessionManager: SessionManager;
    metadataFilePath: string;
    getPreference: PreferenceReader;
    resourceLoader: DefaultResourceLoader;
    windowManager: WindowManagerService;
  }) {
    this.session = options.session;
    this.authStorage = options.authStorage;
    this.modelRegistry = options.modelRegistry;
    this.sessionManager = options.sessionManager;
    this.metadataFilePath = options.metadataFilePath;
    this.getPreference = options.getPreference;
    this.resourceLoader = options.resourceLoader;
    this.windowManager = options.windowManager;
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
  ): Promise<PiSessionService> {
    const authStorage = AuthStorage.create(join(workspacePaths.config, 'pi-auth.json'));
    const modelRegistry = new ModelRegistry(authStorage);
    const sessionDir = join(workspacePaths.data, 'ai-sessions');
    mkdirSync(sessionDir, { recursive: true });

    const sessionManager = SessionManager.continueRecent(process.cwd(), sessionDir);

    const provider = ((await getPreference('ai.provider')) as string) ?? 'openai';
    const configuredModel = ((await getPreference('ai.model')) as string) ?? '';
    const apiKey = ((await getPreference('ai.apiKey')) as string) ?? '';
    const baseUrl = ((await getPreference('ai.baseUrl')) as string) ?? '';

    if (apiKey) {
      authStorage.setRuntimeApiKey(provider, apiKey);
    }

    if (baseUrl && ['openai', 'openrouter', 'xai', 'mistral', 'ollama'].includes(provider)) {
      modelRegistry.registerProvider(provider, {
        baseUrl,
        ...(apiKey ? { apiKey } : {}),
        authHeader: provider !== 'ollama',
      });
    }

    const initialModel = configuredModel
      ? modelRegistry.find(provider, configuredModel)
      : undefined;

    const resourceLoader = new DefaultResourceLoader({
      cwd: process.cwd(),
      appendSystemPromptOverride: (base) => [...base, DESKTALK_SYSTEM_PROMPT],
    });
    await resourceLoader.reload();

    const customTools = [
      createDesktopTool({
        windowManager,
        getMiniApps: () => registry.getManifests(),
        activateMiniApp: (miniAppId: string) => {
          registry.activate(miniAppId);
        },
        sendAiCommand,
      }),
      createActionTool({
        windowManager,
        invokeAction,
      }),
    ];

    const { session } = await createAgentSession({
      cwd: process.cwd(),
      authStorage,
      modelRegistry,
      model: initialModel,
      sessionManager,
      tools: [],
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
    });
  }

  getSessionId(): string {
    return this.session.sessionId;
  }

  private async syncPreferences(): Promise<void> {
    await this.resourceLoader.reload();

    const configuredProvider = ((await this.getPreference('ai.provider')) as string) ?? 'openai';
    const configuredModel = ((await this.getPreference('ai.model')) as string) ?? '';
    const configuredApiKey = ((await this.getPreference('ai.apiKey')) as string) ?? '';
    const configuredBaseUrl = ((await this.getPreference('ai.baseUrl')) as string) ?? '';

    if (configuredApiKey) {
      this.authStorage.setRuntimeApiKey(configuredProvider, configuredApiKey);
    } else {
      this.authStorage.removeRuntimeApiKey(configuredProvider);
    }

    if (
      configuredBaseUrl &&
      ['openai', 'openrouter', 'xai', 'mistral', 'ollama'].includes(configuredProvider)
    ) {
      this.modelRegistry.registerProvider(configuredProvider, {
        baseUrl: configuredBaseUrl,
        ...(configuredApiKey ? { apiKey: configuredApiKey } : {}),
        authHeader: configuredProvider !== 'ollama',
      });
    } else {
      this.modelRegistry.unregisterProvider(configuredProvider);
    }

    if (!configuredModel) {
      return;
    }

    const targetModel = this.modelRegistry.find(configuredProvider, configuredModel);
    if (!targetModel) {
      throw new Error(`Configured model not found: ${configuredProvider}/${configuredModel}`);
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
    return this.session.messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => {
        const typedMessage = message as BasicAgentMessage;
        const role = typedMessage.role as 'user' | 'assistant';
        const metadata = this.getMessageMetadata(role, typedMessage.timestamp);

        let content = getMessageText(
          typedMessage as unknown as BasicUserMessage | BasicAssistantMessage,
        );
        // Strip injected desktop context from user messages before sending to frontend
        if (role === 'user') {
          content = stripDesktopContext(content);
        }

        return {
          id: getMessageKey(role, typedMessage.timestamp),
          role,
          content,
          timestamp: typedMessage.timestamp,
          ...(role === 'user' ? { source: metadata?.source ?? 'text' } : {}),
          ...(isAssistantMessage(typedMessage)
            ? {
                provider: typedMessage.provider,
                model: typedMessage.model,
                totalTokens: typedMessage.usage.total,
              }
            : {}),
        };
      });
  }

  async prompt(input: PromptInput, callbacks: PromptCallbacks): Promise<void> {
    await this.syncPreferences();

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
        if (event.assistantMessageEvent.type === 'text_delta') {
          currentAssistantText += event.assistantMessageEvent.delta;
          onEvent({
            type: 'message_update',
            text: currentAssistantText,
            provider: message.provider,
            model: message.model,
          });
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
