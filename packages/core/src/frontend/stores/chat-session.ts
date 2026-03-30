/**
 * Chat session Zustand store.
 *
 * Manages the AI chat lifecycle:
 * - Chat message history
 * - Active request tracking
 * - AI provider selection and configuration
 * - Streaming state and token usage
 */

import { create } from 'zustand';
import { httpClient } from '../http-client';
import type { AgentQuestionData, AgentQuestionType } from '../components/info-panel/AgentQuestion';

export interface ToolCallInfo {
  toolName: string;
  params: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  source?: 'text' | 'voice';
  timestamp?: number;
  cancelled?: boolean;
  /** When present, this message represents a tool call (rendered as a standalone row). */
  toolCall?: ToolCallInfo;
  /** Chain-of-thought / extended thinking text from the model (if available). */
  thinkingContent?: string;
}

export interface AiProviderOption {
  id: string;
  label: string;
  configured: boolean;
  model: string;
}

export interface ChatSessionOption {
  id: string;
  label: string;
  createdAt: number;
  updatedAt: number;
}

interface AiProviderResponse {
  defaultProvider: string;
  providers: AiProviderOption[];
}

export interface AiEventMessage {
  type:
    | 'history_sync'
    | 'sessions_sync'
    | 'message_start'
    | 'message_update'
    | 'thinking_update'
    | 'message_end'
    | 'tool_call'
    | 'agent_question'
    | 'error';
  requestId?: string;
  sessionId?: string;
  text?: string;
  thinkingText?: string;
  message?: string;
  model?: string;
  provider?: string;
  usage?: {
    totalTokens?: number;
  };
  cancelled?: boolean;
  messages?: ChatMessage[];
  toolCall?: ToolCallInfo;
  sessions?: ChatSessionOption[];
  questionId?: string;
  question?: string;
  questionType?: AgentQuestionType;
  options?: string[];
}

export interface ChatSessionState {
  /** Chat message history */
  messages: ChatMessage[];
  /** Local draft text shown in the command textarea. */
  draftInput: string;
  /** Whether an AI request is in progress */
  isAiRunning: boolean;
  /** ID of the active request (null when idle) */
  activeRequestId: string | null;
  /** Display label for the current model */
  modelLabel: string;
  /** Token count from the last completed request */
  tokenCount: number;
  /** Available AI provider options */
  providerOptions: AiProviderOption[];
  /** Provider ID resolved from current preferences */
  selectedProvider: string;
  /** Active persisted AI session */
  currentSessionId: string | null;
  /** Available persisted AI sessions */
  sessions: ChatSessionOption[];
  /** Question currently blocking the agent, if any. */
  pendingQuestion: AgentQuestionData | null;

  // Actions
  loadProviders: () => Promise<void>;
  loadSessions: (socket: WebSocket) => boolean;
  switchSession: (sessionId: string, socket: WebSocket) => boolean;
  createSession: (socket: WebSocket) => boolean;
  cancelAiRequest: (socket: WebSocket) => boolean;
  answerQuestion: (questionId: string, answer: string, socket: WebSocket) => boolean;
  submitPrompt: (text: string, source: 'text' | 'voice', socket: WebSocket) => boolean;
  setDraftInput: (value: string) => void;
  clearDraftInput: () => void;
  handleAiEvent: (event: AiEventMessage) => void;
  /** Clear all messages in the current session (client-side only). */
  clearMessages: () => void;
  /** Inject a local-only system message into the chat history. */
  addSystemMessage: (text: string) => void;
}

function getProviderStatusLabel(providerId: string, providers: AiProviderOption[]): string {
  const provider = providers.find((entry) => entry.id === providerId);
  if (!provider || !provider.model) {
    return 'not configured';
  }

  return `${provider.id}/${provider.model}`;
}

export const useChatSession = create<ChatSessionState>((set, get) => ({
  messages: [],
  draftInput: '',
  isAiRunning: false,
  activeRequestId: null,
  modelLabel: 'not configured',
  tokenCount: 0,
  providerOptions: [],
  selectedProvider: '',
  currentSessionId: null,
  sessions: [],
  pendingQuestion: null,

  async loadProviders() {
    try {
      const { data: payload } = await httpClient.get<AiProviderResponse>('/api/ai/providers');

      set({
        providerOptions: payload.providers,
        selectedProvider: payload.defaultProvider,
        modelLabel: getProviderStatusLabel(payload.defaultProvider, payload.providers),
      });
    } catch {
      set({
        providerOptions: [],
        selectedProvider: '',
        modelLabel: 'not configured',
      });
    }
  },

  loadSessions(socket: WebSocket) {
    if (socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(
      JSON.stringify({
        type: 'ai:sessions:list',
      }),
    );

    return true;
  },

  switchSession(sessionId: string, socket: WebSocket) {
    const state = get();
    if (
      !sessionId ||
      socket.readyState !== WebSocket.OPEN ||
      state.isAiRunning ||
      state.currentSessionId === sessionId
    ) {
      return false;
    }

    set({
      messages: [],
      isAiRunning: false,
      tokenCount: 0,
      activeRequestId: null,
      currentSessionId: sessionId,
      pendingQuestion: null,
    });

    socket.send(
      JSON.stringify({
        type: 'ai:sessions:switch',
        sessionId,
      }),
    );

    return true;
  },

  createSession(socket: WebSocket) {
    const state = get();
    if (socket.readyState !== WebSocket.OPEN || state.isAiRunning) {
      return false;
    }

    set({
      messages: [],
      isAiRunning: false,
      tokenCount: 0,
      activeRequestId: null,
      currentSessionId: null,
      pendingQuestion: null,
    });

    socket.send(
      JSON.stringify({
        type: 'ai:sessions:create',
      }),
    );

    return true;
  },

  cancelAiRequest(socket: WebSocket) {
    const state = get();
    if (socket.readyState !== WebSocket.OPEN || !state.isAiRunning || !state.activeRequestId) {
      return false;
    }

    socket.send(
      JSON.stringify({
        type: 'ai:cancel',
        requestId: state.activeRequestId,
      }),
    );

    return true;
  },

  answerQuestion(questionId: string, answer: string, socket: WebSocket) {
    const state = get();
    if (
      socket.readyState !== WebSocket.OPEN ||
      !state.pendingQuestion ||
      state.pendingQuestion.questionId !== questionId
    ) {
      return false;
    }

    socket.send(
      JSON.stringify({
        type: 'ai:answer',
        questionId,
        answer,
      }),
    );

    set({ pendingQuestion: null });
    return true;
  },

  submitPrompt(text: string, source: 'text' | 'voice' = 'text', socket: WebSocket) {
    const state = get();
    if (!text || socket.readyState !== WebSocket.OPEN || state.isAiRunning) {
      return false;
    }

    const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    set((prev) => ({
      messages: [
        ...prev.messages,
        { id: `user-${requestId}`, role: 'user' as const, content: text, source },
        { id: `assistant-${requestId}`, role: 'assistant' as const, content: '' },
      ],
      isAiRunning: true,
      activeRequestId: requestId,
      tokenCount: 0,
    }));

    socket.send(
      JSON.stringify({
        type: 'ai:prompt',
        requestId,
        text,
        source,
      }),
    );

    return true;
  },

  setDraftInput(value: string) {
    set({ draftInput: value });
  },

  clearDraftInput() {
    set({ draftInput: '' });
  },

  handleAiEvent(event: AiEventMessage) {
    const state = get();

    if (event.type === 'sessions_sync') {
      set((prev) => ({
        sessions: event.sessions ?? prev.sessions,
        currentSessionId: event.sessionId ?? prev.currentSessionId,
      }));
      return;
    }

    if (event.type === 'history_sync') {
      set((prev) => ({
        messages: event.messages ?? [],
        currentSessionId: event.sessionId ?? prev.currentSessionId,
      }));
      return;
    }

    if (state.activeRequestId && event.requestId !== state.activeRequestId) {
      return;
    }

    if (event.type === 'message_start') {
      set({
        isAiRunning: true,
        modelLabel: event.model ? `${event.provider}/${event.model}` : 'not configured',
      });
    } else if (event.type === 'message_update') {
      set((prev) => {
        const next = [...prev.messages];
        const lastIndex = next.length - 1;
        if (lastIndex >= 0 && next[lastIndex].role === 'assistant' && !next[lastIndex].toolCall) {
          next[lastIndex] = { ...next[lastIndex], content: event.text ?? '' };
        }
        return { messages: next };
      });
    } else if (event.type === 'thinking_update') {
      set((prev) => {
        const next = [...prev.messages];
        const lastIndex = next.length - 1;
        if (lastIndex >= 0 && next[lastIndex].role === 'assistant' && !next[lastIndex].toolCall) {
          next[lastIndex] = { ...next[lastIndex], thinkingContent: event.thinkingText ?? '' };
        }
        return { messages: next };
      });
    } else if (event.type === 'tool_call') {
      // Insert a tool call message just before the current streaming assistant message
      set((prev) => {
        const next = [...prev.messages];
        const requestId = state.activeRequestId;
        const assistantId = requestId ? `assistant-${requestId}` : null;
        const toolMsg: ChatMessage = {
          id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: 'assistant',
          content: '',
          toolCall: event.toolCall,
        };

        // Insert before the active streaming assistant message
        if (assistantId) {
          const idx = next.findIndex((m) => m.id === assistantId);
          if (idx >= 0) {
            next.splice(idx, 0, toolMsg);
            return { messages: next };
          }
        }

        // Fallback: append before the last assistant message
        next.push(toolMsg);
        return { messages: next };
      });
    } else if (event.type === 'agent_question') {
      if (!event.questionId || !event.question || !event.questionType) {
        return;
      }

      set({
        pendingQuestion: {
          questionId: event.questionId,
          question: event.question,
          questionType: event.questionType,
          options: event.options,
        },
      });
    } else if (event.type === 'message_end') {
      const endedRequestId = state.activeRequestId;
      const providerOptions = state.providerOptions;
      const selectedProvider = state.selectedProvider;
      const cancelledMarker = '[Cancelled]';

      set((prev) => {
        let messages = prev.messages;
        if (endedRequestId) {
          const targetId = `assistant-${endedRequestId}`;
          const idx = messages.findIndex((m) => m.id === targetId);
          if (idx >= 0) {
            const target = messages[idx];
            if (event.cancelled) {
              const nextContent = target.content.trim()
                ? `${target.content.replace(/\s+$/u, '')}\n\n${cancelledMarker}`
                : cancelledMarker;
              messages = [
                ...messages.slice(0, idx),
                {
                  ...target,
                  content: target.cancelled ? target.content : nextContent,
                  cancelled: true,
                },
                ...messages.slice(idx + 1),
              ];
            } else if (!target.content && !target.thinkingContent) {
              // Remove empty assistant message bubble by matching its ID.
              messages = [...messages.slice(0, idx), ...messages.slice(idx + 1)];
            }
          }
        }
        return {
          messages,
          isAiRunning: false,
          activeRequestId: null,
          pendingQuestion: null,
          tokenCount: event.usage?.totalTokens ?? 0,
          modelLabel: selectedProvider
            ? getProviderStatusLabel(selectedProvider, providerOptions)
            : prev.modelLabel,
        };
      });
    } else if (event.type === 'error') {
      set((prev) => {
        const next = [...prev.messages];
        const lastIndex = next.length - 1;
        if (lastIndex >= 0 && next[lastIndex].role === 'assistant') {
          next[lastIndex] = {
            ...next[lastIndex],
            content: event.message ?? 'AI request failed.',
          };
        } else {
          next.push({
            id: `assistant-error-${Date.now()}`,
            role: 'assistant',
            content: event.message ?? 'AI request failed.',
          });
        }
        return {
          messages: next,
          isAiRunning: false,
          activeRequestId: null,
          pendingQuestion: null,
        };
      });
    }
  },

  clearMessages() {
    set({ messages: [], tokenCount: 0 });
  },

  addSystemMessage(text: string) {
    set((prev) => ({
      messages: [
        ...prev.messages,
        {
          id: `system-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: 'assistant' as const,
          content: text,
        },
      ],
    }));
  },
}));
