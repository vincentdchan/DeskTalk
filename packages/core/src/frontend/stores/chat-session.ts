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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  source?: 'text' | 'voice';
  timestamp?: number;
}

export interface AiProviderOption {
  id: string;
  label: string;
  configured: boolean;
  model: string;
}

interface AiProviderResponse {
  defaultProvider: string;
  providers: AiProviderOption[];
}

export interface AiEventMessage {
  type: 'history_sync' | 'message_start' | 'message_update' | 'message_end' | 'error';
  requestId?: string;
  text?: string;
  message?: string;
  model?: string;
  provider?: string;
  usage?: {
    totalTokens?: number;
  };
  messages?: ChatMessage[];
}

export interface ChatSessionState {
  /** Chat message history */
  messages: ChatMessage[];
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

  // Actions
  loadProviders: () => Promise<void>;
  submitPrompt: (text: string, source: 'text' | 'voice', socket: WebSocket) => boolean;
  handleAiEvent: (event: AiEventMessage) => void;
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
  isAiRunning: false,
  activeRequestId: null,
  modelLabel: 'not configured',
  tokenCount: 0,
  providerOptions: [],
  selectedProvider: '',

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

  handleAiEvent(event: AiEventMessage) {
    const state = get();

    if (event.type === 'history_sync') {
      set({ messages: event.messages ?? [] });
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
        if (lastIndex >= 0 && next[lastIndex].role === 'assistant') {
          next[lastIndex] = { ...next[lastIndex], content: event.text ?? '' };
        }
        return { messages: next };
      });
    } else if (event.type === 'message_end') {
      const endedRequestId = state.activeRequestId;
      const providerOptions = state.providerOptions;
      const selectedProvider = state.selectedProvider;

      set((prev) => {
        let messages = prev.messages;
        // Remove empty assistant message bubble by matching its ID
        if (endedRequestId) {
          const targetId = `assistant-${endedRequestId}`;
          const idx = messages.findIndex((m) => m.id === targetId);
          if (idx >= 0 && !messages[idx].content) {
            messages = [...messages.slice(0, idx), ...messages.slice(idx + 1)];
          }
        }
        return {
          messages,
          isAiRunning: false,
          activeRequestId: null,
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
        };
      });
    }
  },
}));
