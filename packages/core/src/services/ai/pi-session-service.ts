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
import { createWindowControlTool } from './window-tools.js';
import type { WindowManagerService } from '../window-manager.js';
import { registry } from '../miniapp-registry.js';
import type { WorkspacePaths } from '../workspace.js';

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

  private constructor(options: {
    session: AgentSession;
    authStorage: AuthStorage;
    modelRegistry: ModelRegistry;
    sessionManager: SessionManager;
    metadataFilePath: string;
    getPreference: PreferenceReader;
    resourceLoader: DefaultResourceLoader;
  }) {
    this.session = options.session;
    this.authStorage = options.authStorage;
    this.modelRegistry = options.modelRegistry;
    this.sessionManager = options.sessionManager;
    this.metadataFilePath = options.metadataFilePath;
    this.getPreference = options.getPreference;
    this.resourceLoader = options.resourceLoader;
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
      appendSystemPromptOverride: (base) => [
        ...base,
        windowManager.getSystemPromptContext(registry.getManifests()),
      ],
    });
    await resourceLoader.reload();

    const customTools = [
      createWindowControlTool({
        windowManager,
        getMiniApps: () => registry.getManifests(),
        activateMiniApp: (miniAppId) => {
          registry.activate(miniAppId);
        },
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

        return {
          id: getMessageKey(role, typedMessage.timestamp),
          role,
          content: getMessageText(
            typedMessage as unknown as BasicUserMessage | BasicAssistantMessage,
          ),
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
      await this.session.prompt(input.text);
    } finally {
      unsubscribe();
    }
  }
}
