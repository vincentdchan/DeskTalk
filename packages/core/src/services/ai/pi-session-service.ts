import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  readTool,
  writeTool,
  bashTool,
  grepTool,
  findTool,
  lsTool,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
  type CreateAgentSessionOptions,
  type SessionInfo,
  type ToolDefinition,
} from '@mariozechner/pi-coding-agent';
import type { OAuthLoginCallbacks } from '@mariozechner/pi-ai';
import { getOAuthProvider } from '@mariozechner/pi-ai/oauth';
import { createDesktopTool, type SendAiCommand } from './desktop-tool';
import { createLayoutTool } from './layout-tool';
import { createActionTool } from './action-tool';
import { createLiveAppTool } from './create-liveapp-tool';
import { createReadManualTool } from './manual-tool';
import { HtmlStreamCoordinator } from './html-stream-coordinator';
import { createEditTool } from './edit-tool';
import { createUndoEditTool } from './undo-edit-tool';
import { createRedoEditTool } from './redo-edit-tool';
import { ImageGenerationService } from './image-generation-service';
import { createGenerateIconTool } from './generate-icon-tool';
import { EditHistory, createManagedPathResolver } from './edit-history';
import type { AssistantMessage, ToolCall } from '@mariozechner/pi-ai';
import { randomUUID } from 'node:crypto';
import type pino from 'pino';
import {
  AI_PROVIDER_DEFINITIONS,
  getAiProviderPreferences,
  getAllAiProviderPreferences,
  getDefaultAiProvider,
  type AiProviderAuthType,
  type PreferenceReader,
} from './providers';
import type { WindowManagerService } from '../window-manager';
import { registry } from '../miniapp-registry';
import type { WorkspacePaths } from '../workspace';
import { getUserHomeDir } from '../workspace';
import { DESKTALK_SYSTEM_PROMPT } from './system-prompt';
import { listLiveApps } from '../liveapps';
import {
  createAskUserTool,
  formatAskUserWaitingMessage,
  isAskUserWaitingMessage,
  type AskUserQuestionType,
} from './ask-user-tool';
import { PendingQuestionStore, type PendingQuestionCheckpoint } from './pending-question-store';

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
  /** Chain-of-thought / extended thinking text from the model (if available). */
  thinkingContent?: string;
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
  resolvedModel: string;
  models: string[];
  authType: AiProviderAuthType;
  authenticated?: boolean;
}

export interface ChatSessionSummary {
  id: string;
  label: string;
  createdAt: number;
  updatedAt: number;
}

interface MessageMetadata {
  source?: ChatSource;
}

interface MessageMetadataStore {
  byKey: Record<string, MessageMetadata>;
}

interface PromptEventSinkRef {
  current: ((event: Record<string, unknown>) => void) | null;
}

interface SessionRef {
  current: AgentSession | null;
}

export interface PromptResult {
  status: 'completed' | 'suspended';
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
  | BasicToolResultMessage
  | { role: string; timestamp: number };

type BasicToolResultMessage = {
  role: 'toolResult';
  toolCallId: string;
  toolName: string;
  content: Array<{ type?: string; text?: string }>;
  timestamp: number;
};

const DESKTALK_PI_THINKING_LEVEL = 'off' as const;

function disableSessionThinking(session: Pick<AgentSession, 'setThinkingLevel'>): void {
  session.setThinkingLevel(DESKTALK_PI_THINKING_LEVEL);
}

async function createDeskTalkAgentSession(
  options: CreateAgentSessionOptions,
): Promise<AgentSession> {
  const { session } = await createAgentSession({
    ...options,
    thinkingLevel: DESKTALK_PI_THINKING_LEVEL,
  });
  disableSessionThinking(session);
  return session;
}

function isUserMessage(message: BasicAgentMessage): message is BasicUserMessage {
  return message.role === 'user';
}

function isAssistantMessage(message: BasicAgentMessage): message is BasicAssistantMessage {
  return message.role === 'assistant';
}

function isToolResultMessage(message: BasicAgentMessage): message is BasicToolResultMessage {
  return message.role === 'toolResult';
}

function getMessageKey(role: 'user' | 'assistant', timestamp: number): string {
  return `${role}:${timestamp}`;
}

/**
 * Strip the `[Desktop Context]...[/Desktop Context]` block that we prepend
 * to every user message before sending it to pi. The frontend should never
 * display this internal metadata.
 */
const DESKTOP_CONTEXT_RE =
  /\[Desktop (?:Context|Content)\][\s\S]*?\[\/Desktop (?:Context|Content)\]\s*/;

function stripSessionTitleMetadata(text: string): string {
  return stripDesktopContext(text)
    .replace(/^\[Desktop (?:Context|Content)\]\s*/i, '')
    .trim();
}

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
 * Scrub `create_liveapp` tool-call arguments in an assistant message so the
 * full HTML is not re-sent to the LLM on subsequent turns.
 *
 * Mutates `message.content` in-place — this must be called synchronously in
 * the `message_end` subscriber, **before** session persistence runs.
 */
export function scrubHtmlToolCallArgs(message: AssistantMessage): void {
  for (const block of message.content) {
    if (
      block.type === 'toolCall' &&
      (block as ToolCall).name === 'create_liveapp' &&
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

function getToolResultText(message: BasicToolResultMessage): string {
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

function normalizeAskUserType(value: unknown): AskUserQuestionType {
  if (value === 'select' || value === 'multi_select' || value === 'confirm') {
    return value;
  }

  return 'text';
}

function normalizeAskUserParams(
  params: Record<string, unknown>,
  answer?: string,
): Record<string, unknown> {
  const questionType = normalizeAskUserType(params.type);
  const options = Array.isArray(params.options)
    ? params.options.filter((option): option is string => typeof option === 'string')
    : undefined;

  return {
    question: typeof params.question === 'string' ? params.question : '',
    questionType,
    ...(options ? { options } : {}),
    ...(typeof answer === 'string' ? { answer } : {}),
  };
}

function formatToolCallParams(
  toolName: string,
  params: Record<string, unknown>,
  answer?: string,
): Record<string, unknown> {
  if (toolName === 'ask_user') {
    return normalizeAskUserParams(params, answer);
  }

  return params;
}

const AGENT_QUESTION_ANSWER_PREFIX = '[Agent Question Answer]';
const AGENT_QUESTION_ANSWER_SUFFIX = '[/Agent Question Answer]';

function formatPendingQuestionAnswerMessage(
  checkpoint: PendingQuestionCheckpoint,
  answer: string,
): string {
  return [
    AGENT_QUESTION_ANSWER_PREFIX,
    JSON.stringify({
      questionId: checkpoint.questionId,
      question: checkpoint.question,
      answer,
    }),
    AGENT_QUESTION_ANSWER_SUFFIX,
  ].join('\n');
}

function parsePendingQuestionAnswerMessage(
  text: string,
): { questionId: string; question: string; answer: string } | null {
  const trimmed = text.trim();
  if (
    !trimmed.startsWith(AGENT_QUESTION_ANSWER_PREFIX) ||
    !trimmed.endsWith(AGENT_QUESTION_ANSWER_SUFFIX)
  ) {
    return null;
  }

  const jsonStart = AGENT_QUESTION_ANSWER_PREFIX.length;
  const jsonEnd = trimmed.length - AGENT_QUESTION_ANSWER_SUFFIX.length;
  const rawJson = trimmed.slice(jsonStart, jsonEnd).trim();
  if (!rawJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawJson) as {
      questionId?: string;
      question?: string;
      answer?: string;
    };
    if (
      typeof parsed.questionId !== 'string' ||
      typeof parsed.question !== 'string' ||
      typeof parsed.answer !== 'string'
    ) {
      return null;
    }

    return parsed as { questionId: string; question: string; answer: string };
  } catch {
    return null;
  }
}

function normalizeAskUserAnswer(answer: string): string | undefined {
  const trimmed = answer.trim();
  if (!trimmed || isAskUserWaitingMessage(trimmed)) {
    return undefined;
  }

  return trimmed;
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

function normalizeSessionTitle(value: string): string {
  return stripSessionTitleMetadata(value)
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim();
}

function generateSessionTitle(prompt: string): string {
  const normalized = normalizeSessionTitle(prompt)
    .replace(/^[#>*\-\d.\s]+/, '')
    .replace(/`+/g, '');

  if (!normalized) {
    return 'New session';
  }

  if (normalized.length <= 48) {
    return normalized;
  }

  const truncated = normalized.slice(0, 48);
  const lastSpace = truncated.lastIndexOf(' ');
  const title = lastSpace >= 24 ? truncated.slice(0, lastSpace) : truncated;
  return `${title.trim()}...`;
}

function toSessionSummary(info: SessionInfo, isCurrent: boolean): ChatSessionSummary {
  const fallbackLabel = info.firstMessage.trim() || 'New session';
  return {
    id: info.id,
    label:
      normalizeSessionTitle(info.name ?? fallbackLabel) ||
      (isCurrent ? 'Current session' : 'New session'),
    createdAt: info.created.getTime(),
    updatedAt: info.modified.getTime(),
  };
}

export class PiSessionService {
  private readonly authStorage;
  private readonly modelRegistry;
  private readonly metadataFilePath: string;
  private readonly getPreference: PreferenceReader;
  private session: AgentSession;
  private readonly cwd: string;
  private readonly sessionDir: string;
  private readonly resourceLoader: DefaultResourceLoader;
  private readonly windowManager: WindowManagerService;
  private readonly htmlStreamCoordinator: HtmlStreamCoordinator;
  private readonly log: pino.Logger;
  private readonly customTools: ToolDefinition[];
  private readonly getCurrentUsername: () => string;
  private readonly pendingQuestionStore: PendingQuestionStore;
  private readonly promptEventSinkRef: PromptEventSinkRef;
  private readonly sessionRef: SessionRef;
  private isPrompting = false;
  private abortPromise: Promise<void> | null = null;

  private constructor(options: {
    session: AgentSession;
    authStorage: AuthStorage;
    modelRegistry: ModelRegistry;
    metadataFilePath: string;
    getPreference: PreferenceReader;
    cwd: string;
    sessionDir: string;
    resourceLoader: DefaultResourceLoader;
    windowManager: WindowManagerService;
    htmlStreamCoordinator: HtmlStreamCoordinator;
    logger: pino.Logger;
    customTools: ToolDefinition[];
    getCurrentUsername: () => string;
    pendingQuestionStore: PendingQuestionStore;
    promptEventSinkRef: PromptEventSinkRef;
    sessionRef: SessionRef;
  }) {
    this.session = options.session;
    this.authStorage = options.authStorage;
    this.modelRegistry = options.modelRegistry;
    this.metadataFilePath = options.metadataFilePath;
    this.getPreference = options.getPreference;
    this.cwd = options.cwd;
    this.sessionDir = options.sessionDir;
    this.resourceLoader = options.resourceLoader;
    this.windowManager = options.windowManager;
    this.htmlStreamCoordinator = options.htmlStreamCoordinator;
    this.log = options.logger;
    this.customTools = options.customTools;
    this.getCurrentUsername = options.getCurrentUsername;
    this.pendingQuestionStore = options.pendingQuestionStore;
    this.promptEventSinkRef = options.promptEventSinkRef;
    this.sessionRef = options.sessionRef;
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
      additionalSkillPaths: [join(workspacePaths.data, 'skills')],
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

    const resolveManagedPath = (inputPath: string) =>
      createManagedPathResolver([join(workspacePaths.data, 'home', getCurrentUsername())])(
        inputPath,
      );
    const editHistory = new EditHistory(resolveManagedPath);
    const imageGenerationService = new ImageGenerationService({
      modelRegistry,
      getPreference,
      logger: logger.child({ scope: 'image-generation' }),
    });
    const pendingQuestionStore = new PendingQuestionStore(
      join(workspacePaths.data, 'storage', 'ai-pending-questions.json'),
    );
    const promptEventSinkRef: PromptEventSinkRef = { current: null };
    const sessionRef: SessionRef = { current: null };

    const customTools = [
      createDesktopTool({
        windowManager,
        getMiniApps: () => registry.getManifests(),
        getLiveApps: () =>
          listLiveApps(getUserHomeDir(getCurrentUsername())).map((app) => ({
            id: app.id,
            name: app.name,
          })),
        activateMiniApp: (miniAppId: string) => {
          registry.activate(miniAppId, getCurrentUsername());
        },
        sendAiCommand,
      }),
      createLayoutTool({
        sendAiCommand,
      }),
      createActionTool({
        windowManager,
        invokeAction,
      }),
      createLiveAppTool({
        sendAiCommand,
        activateMiniApp: (miniAppId: string) => {
          registry.activate(miniAppId, getCurrentUsername());
        },
        getPreference,
        streamCoordinator: htmlStreamCoordinator,
      }),
      createGenerateIconTool({
        imageGenerationService,
        getCurrentUsername,
        workspaceDataDir: workspacePaths.data,
      }),
      createEditTool({
        editHistory,
        resolvePath: resolveManagedPath,
      }),
      createUndoEditTool({
        editHistory,
        resolvePath: resolveManagedPath,
      }),
      createRedoEditTool({
        editHistory,
        resolvePath: resolveManagedPath,
      }),
      createReadManualTool(),
      createAskUserTool({
        sendQuestion: async ({ toolCallId, question, questionType, options, signal }) => {
          if (!promptEventSinkRef.current) {
            throw new Error('ask_user is only available while a prompt is running.');
          }

          if (signal?.aborted) {
            throw new Error('Question cancelled before the user answered.');
          }

          if (pendingQuestionStore.getPending()) {
            throw new Error(
              'A user question is already pending. Wait for that answer before asking another one.',
            );
          }

          const activeSession = sessionRef.current;
          if (!activeSession) {
            throw new Error('No active AI session is available for ask_user.');
          }

          const questionId = randomUUID();
          pendingQuestionStore.save({
            questionId,
            sessionId: activeSession.sessionId,
            toolCallId,
            question,
            questionType,
            ...(options ? { options } : {}),
            status: 'pending',
            createdAt: Date.now(),
          });

          promptEventSinkRef.current?.({
            type: 'agent_question',
            questionId,
            question,
            questionType,
            ...(options ? { options } : {}),
          });

          return {
            questionId,
            waitingMessage: formatAskUserWaitingMessage(questionId),
          };
        },
      }),
    ];

    const session = await createDeskTalkAgentSession({
      cwd: process.cwd(),
      authStorage,
      modelRegistry,
      model: initialModel,
      sessionManager,
      tools: [readTool, writeTool, bashTool, grepTool, findTool, lsTool],
      customTools,
      resourceLoader,
    });
    sessionRef.current = session;
    pendingQuestionStore.cleanupStale(session.sessionId);

    return new PiSessionService({
      session,
      authStorage,
      modelRegistry,
      metadataFilePath: join(workspacePaths.data, 'storage', 'ai-message-metadata.json'),
      getPreference,
      cwd: process.cwd(),
      sessionDir,
      resourceLoader,
      windowManager,
      htmlStreamCoordinator,
      logger,
      customTools,
      getCurrentUsername,
      pendingQuestionStore,
      promptEventSinkRef,
      sessionRef,
    });
  }

  private async createSessionWithManager(sessionManager: SessionManager): Promise<AgentSession> {
    const session = await createDeskTalkAgentSession({
      cwd: this.cwd,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      model: this.session.model,
      sessionManager,
      tools: [readTool, writeTool, bashTool, grepTool, findTool, lsTool],
      customTools: this.customTools,
      resourceLoader: this.resourceLoader,
    });

    return session;
  }

  private async waitForAbortCompletion(): Promise<void> {
    if (!this.abortPromise) {
      return;
    }

    await this.abortPromise;
  }

  private getCurrentSessionPendingQuestion(): PendingQuestionCheckpoint | null {
    return this.pendingQuestionStore.getPending(this.getSessionId());
  }

  getSessionId(): string {
    return this.session.sessionId;
  }

  hasPendingQuestion(): boolean {
    return Boolean(this.getCurrentSessionPendingQuestion());
  }

  getPendingQuestion(): PendingQuestionCheckpoint | null {
    return this.getCurrentSessionPendingQuestion();
  }

  async listSessions(): Promise<ChatSessionSummary[]> {
    const sessions = await SessionManager.list(this.cwd, this.sessionDir);
    return sessions
      .sort((left, right) => right.modified.getTime() - left.modified.getTime())
      .map((info) => toSessionSummary(info, info.id === this.getSessionId()));
  }

  async createNewSession(): Promise<ChatSessionSummary> {
    await this.waitForAbortCompletion();
    if (this.isPrompting || this.hasPendingQuestion()) {
      throw new Error('Answer or cancel the pending AI work before creating a new session.');
    }

    this.session = await this.createSessionWithManager(
      SessionManager.create(this.cwd, this.sessionDir),
    );
    this.sessionRef.current = this.session;
    this.pendingQuestionStore.cleanupStale(this.session.sessionId);
    const summary = (await this.listSessions()).find(
      (session) => session.id === this.getSessionId(),
    );
    return (
      summary ?? {
        id: this.getSessionId(),
        label: 'New session',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    );
  }

  async switchSession(sessionId: string): Promise<boolean> {
    await this.waitForAbortCompletion();
    if (this.isPrompting || this.hasPendingQuestion()) {
      throw new Error('Answer or cancel the pending AI work before switching sessions.');
    }

    const sessions = await SessionManager.list(this.cwd, this.sessionDir);
    const target = sessions.find((entry) => entry.id === sessionId);
    if (!target) {
      return false;
    }

    this.session = await this.createSessionWithManager(
      SessionManager.open(target.path, this.sessionDir),
    );
    this.sessionRef.current = this.session;
    this.pendingQuestionStore.cleanupStale(this.session.sessionId);
    return true;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    await this.waitForAbortCompletion();
    if (this.isPrompting) {
      throw new Error('Wait for the current AI response to finish before deleting sessions.');
    }

    if (this.pendingQuestionStore.getPending(sessionId)) {
      throw new Error('Answer or cancel the pending AI work before deleting this session.');
    }

    const sessions = await SessionManager.list(this.cwd, this.sessionDir);
    const target = sessions.find((entry) => entry.id === sessionId);
    if (!target) {
      return false;
    }

    if (sessionId === this.getSessionId()) {
      const nextSession = sessions
        .filter((entry) => entry.id !== sessionId)
        .sort((left, right) => right.modified.getTime() - left.modified.getTime())[0];

      this.session = await this.createSessionWithManager(
        nextSession
          ? SessionManager.open(nextSession.path, this.sessionDir)
          : SessionManager.create(this.cwd, this.sessionDir),
      );
      this.sessionRef.current = this.session;
      this.pendingQuestionStore.cleanupStale(this.session.sessionId);
    }

    unlinkSync(target.path);
    this.pendingQuestionStore.removeSession(sessionId);
    return true;
  }

  async renameCurrentSession(title: string): Promise<ChatSessionSummary> {
    const nextTitle = normalizeSessionTitle(title) || 'New session';
    this.session.sessionManager.appendSessionInfo(nextTitle);

    const summary = (await this.listSessions()).find(
      (session) => session.id === this.getSessionId(),
    );

    return (
      summary ?? {
        id: this.getSessionId(),
        label: nextTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    );
  }

  cancelPendingQuestion(): boolean {
    const pending = this.getCurrentSessionPendingQuestion();
    if (!pending) {
      return false;
    }

    if (this.isPrompting) {
      return false;
    }

    this.pendingQuestionStore.markCancelled(pending.questionId);
    return true;
  }

  async abort(): Promise<void> {
    const pending = this.getCurrentSessionPendingQuestion();
    if (pending) {
      this.pendingQuestionStore.markCancelled(pending.questionId);
    }

    if (!this.isPrompting) {
      return;
    }

    if (this.abortPromise) {
      await this.abortPromise;
      return;
    }

    const abortPromise = this.session.abort().finally(() => {
      if (this.abortPromise === abortPromise) {
        this.abortPromise = null;
      }
    });
    this.abortPromise = abortPromise;
    await abortPromise;
  }

  async resumeWithAnswer(input: {
    questionId: string;
    answer: string;
    callbacks: PromptCallbacks;
  }): Promise<PromptResult> {
    await this.waitForAbortCompletion();
    if (this.isPrompting) {
      throw new Error('Another AI request is already running. Wait for it to finish.');
    }

    const checkpoint = this.pendingQuestionStore.get(input.questionId);
    if (!checkpoint || checkpoint.status !== 'pending') {
      throw new Error('The pending question could not be found.');
    }
    if (checkpoint.sessionId !== this.getSessionId()) {
      throw new Error('That pending question belongs to a different session.');
    }

    const nextAnswer = input.answer.trim();
    if (!nextAnswer) {
      throw new Error('A non-empty answer is required.');
    }

    this.pendingQuestionStore.markAnswered(input.questionId, nextAnswer);
    return this.prompt(
      {
        text: formatPendingQuestionAnswerMessage(checkpoint, nextAnswer),
        source: 'text',
      },
      input.callbacks,
    );
  }

  private maybeAssignSessionTitle(inputText: string): void {
    if (this.session.sessionManager.getSessionName()) {
      return;
    }

    const hasHistory = this.session.messages.some((message) => message.role === 'user');
    if (hasHistory) {
      return;
    }

    const title = generateSessionTitle(inputText);
    if (title) {
      this.session.sessionManager.appendSessionInfo(title);
    }
  }

  async getProviderOptions(): Promise<{ defaultProvider: string; providers: AiProviderOption[] }> {
    await this.syncProviderCredentials();

    const defaultProvider = await getDefaultAiProvider(this.getPreference);
    const modelsByProvider = new Map<string, string[]>();
    const availableModels = this.modelRegistry.getAvailable();
    const availableByProvider = new Set(availableModels.map((model) => model.provider));
    for (const model of this.modelRegistry.getAll()) {
      const current = modelsByProvider.get(model.provider) ?? [];
      if (!current.includes(model.id)) {
        current.push(model.id);
        modelsByProvider.set(model.provider, current);
      }
    }
    const configuredProviders = await getAllAiProviderPreferences(this.getPreference);

    return {
      defaultProvider,
      providers: AI_PROVIDER_DEFINITIONS.map((provider) => {
        const config = configuredProviders.find((entry) => entry.provider === provider.id);
        const configuredModel = config?.model.trim() ?? '';
        const isSubscription = provider.authType === 'subscription';
        const hasOAuth = isSubscription && this.authStorage.hasAuth(provider.id);
        const resolvedModel = configuredModel
          ? (this.modelRegistry.find(provider.id, configuredModel)?.id ?? '')
          : (availableModels.find((model) => model.provider === provider.id)?.id ?? '');

        return {
          id: provider.id,
          label: provider.label,
          authType: provider.authType,
          configured:
            hasOAuth ||
            availableByProvider.has(provider.id) ||
            Boolean(config?.model.trim()) ||
            Boolean(config?.apiKey.trim()) ||
            Boolean(config?.baseUrl.trim()),
          model: config?.model ?? '',
          resolvedModel,
          models: modelsByProvider.get(provider.id) ?? [],
          ...(isSubscription ? { authenticated: hasOAuth } : {}),
        };
      }),
    };
  }

  /**
   * Start an OAuth device-code login flow for a subscription provider.
   *
   * The caller supplies `OAuthLoginCallbacks` so the UI can display the
   * verification URL / user code and react to progress events.
   */
  async loginProvider(providerId: string, callbacks: OAuthLoginCallbacks): Promise<void> {
    await this.authStorage.login(providerId, callbacks);
  }

  /**
   * Log out of a subscription provider (removes persisted OAuth credentials).
   */
  logoutProvider(providerId: string): void {
    this.authStorage.logout(providerId);
  }

  /**
   * Check whether a subscription provider currently has valid auth credentials.
   */
  getProviderAuthStatus(providerId: string): boolean {
    return this.authStorage.hasAuth(providerId);
  }

  /**
   * Check whether a subscription provider uses a local callback server for
   * OAuth login (as opposed to a device-code flow). Providers that use a
   * callback server support manual code input as a fallback when the redirect
   * cannot reach the backend (e.g. when running remotely).
   */
  getProviderUsesCallbackServer(providerId: string): boolean {
    return getOAuthProvider(providerId)?.usesCallbackServer === true;
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

    disableSessionThinking(this.session);
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
    const toolResults = new Map<string, string>();
    const answeredQuestions = new Map<string, string>();

    for (const checkpoint of this.pendingQuestionStore.list(this.getSessionId())) {
      if (checkpoint.status !== 'answered' || typeof checkpoint.answer !== 'string') {
        continue;
      }

      answeredQuestions.set(checkpoint.toolCallId, checkpoint.answer);
    }

    for (const message of this.session.messages) {
      const typedMessage = message as BasicAgentMessage;
      if (!isToolResultMessage(typedMessage) || typedMessage.toolName !== 'ask_user') {
        continue;
      }

      const answer = normalizeAskUserAnswer(getToolResultText(typedMessage));
      if (answer) {
        toolResults.set(typedMessage.toolCallId, answer);
      }
    }

    for (const message of this.session.messages) {
      if (message.role !== 'user' && message.role !== 'assistant') {
        continue;
      }

      const typedMessage = message as BasicAgentMessage;
      const role = typedMessage.role as 'user' | 'assistant';
      const metadata = this.getMessageMetadata(role, typedMessage.timestamp);

      if (isUserMessage(typedMessage)) {
        const content = stripDesktopContext(getMessageText(typedMessage));
        if (parsePendingQuestionAnswerMessage(content)) {
          continue;
        }

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
        let thinkingAccumulator = '';
        let blockIndex = 0;

        for (const block of typedMessage.content) {
          if (block.type === 'thinking') {
            const thinkingBlock = block as { type: string; thinking: string };
            if (typeof thinkingBlock.thinking === 'string') {
              thinkingAccumulator += thinkingBlock.thinking;
            }
          } else if (block.type === 'text' && typeof block.text === 'string') {
            textAccumulator += block.text;
          } else if (block.type === 'toolCall') {
            // Flush accumulated text before the tool call
            const trimmedText = textAccumulator.trim();
            const trimmedThinking = thinkingAccumulator.trim();
            if (trimmedText || trimmedThinking) {
              result.push({
                id: `${baseId}:text-${blockIndex}`,
                role,
                content: trimmedText,
                timestamp: typedMessage.timestamp,
                ...assistantFields,
                ...(trimmedThinking ? { thinkingContent: trimmedThinking } : {}),
              });
              blockIndex += 1;
            }
            textAccumulator = '';
            thinkingAccumulator = '';

            // Emit tool call as a standalone message
            const toolBlock = block as {
              type: string;
              id: string;
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
                params: formatToolCallParams(
                  toolBlock.name,
                  toolBlock.arguments ?? {},
                  toolResults.get(toolBlock.id) ?? answeredQuestions.get(toolBlock.id),
                ),
              },
            });
            blockIndex += 1;
          }
        }

        // Flush any remaining text after the last tool call
        const trimmedText = textAccumulator.trim();
        const trimmedThinking = thinkingAccumulator.trim();
        if (trimmedText || trimmedThinking) {
          result.push({
            id: blockIndex > 0 ? `${baseId}:text-${blockIndex}` : baseId,
            role,
            content: trimmedText,
            timestamp: typedMessage.timestamp,
            ...assistantFields,
            ...(trimmedThinking ? { thinkingContent: trimmedThinking } : {}),
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

  async prompt(input: PromptInput, callbacks: PromptCallbacks): Promise<PromptResult> {
    await this.waitForAbortCompletion();
    if (this.isPrompting) {
      throw new Error('Another AI request is already running. Wait for it to finish.');
    }
    if (this.hasPendingQuestion()) {
      throw new Error('Answer the pending question before sending another message.');
    }

    await this.syncPreferences(input.provider);
    this.maybeAssignSessionTitle(input.text);

    const { onEvent } = callbacks;
    this.isPrompting = true;
    this.promptEventSinkRef.current = onEvent;
    let pendingUserSource: ChatSource | null = input.source;
    let currentAssistantText = '';
    let currentThinkingText = '';

    const unsubscribe = this.session.subscribe((event: AgentSessionEvent) => {
      if (
        event.type === 'message_start' &&
        isAssistantMessage(event.message as BasicAgentMessage)
      ) {
        const message = event.message as unknown as BasicAssistantMessage;
        currentAssistantText = '';
        currentThinkingText = '';
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

        if (msgEvent.type === 'thinking_delta') {
          currentThinkingText += msgEvent.delta;
          onEvent({
            type: 'thinking_update',
            thinkingText: currentThinkingText,
            provider: message.provider,
            model: message.model,
          });
        }

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
            toolContent.name === 'create_liveapp'
          ) {
            this.log.debug('detected create_liveapp — calling onToolcallStart()');
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

            // Skip emitting tool_call for ask_user — it has its own dedicated
            // agent_question event and pendingQuestion UI path.  Emitting
            // tool_call here would create a duplicate question in the frontend
            // because toolcall_end fires before execute() runs (i.e. before
            // the agent_question event is sent).
            if (toolCall.name !== 'ask_user') {
              onEvent({
                type: 'tool_call',
                toolCall: {
                  toolName: toolCall.name,
                  params: formatToolCallParams(toolCall.name, toolCall.arguments ?? {}),
                },
              });
            }
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

          // Scrub large HTML content from create_liveapp tool calls so it
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
      const userHomeDir = getUserHomeDir(this.getCurrentUsername());
      const desktopContext = this.windowManager.getDesktopContext(
        registry.getManifests(),
        listLiveApps(userHomeDir).map((app) => ({
          id: app.id,
          name: app.name,
        })),
        userHomeDir,
      );
      const augmentedText = `${desktopContext}\n\n${input.text}`;
      await this.session.prompt(augmentedText);
      return this.getCurrentSessionPendingQuestion()
        ? { status: 'suspended' }
        : { status: 'completed' };
    } finally {
      this.isPrompting = false;
      this.promptEventSinkRef.current = null;
      unsubscribe();
    }
  }
}
