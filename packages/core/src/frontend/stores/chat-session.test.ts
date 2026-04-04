import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatSession, type ChatMessage } from './chat-session';

function resetChatSession(): void {
  useChatSession.setState({
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
  });
}

describe('useChatSession.handleAiEvent', () => {
  beforeEach(() => {
    resetChatSession();
  });

  it('clears stale live AI state during history sync', () => {
    useChatSession.setState({
      isAiRunning: true,
      activeRequestId: 'req-1',
      pendingQuestion: {
        questionId: 'question-1',
        question: 'Continue?',
        questionType: 'confirm',
      },
    });

    const restoredMessages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Restored history',
      },
    ];

    useChatSession.getState().handleAiEvent({
      type: 'history_sync',
      sessionId: 'session-1',
      messages: restoredMessages,
    });

    const state = useChatSession.getState();
    expect(state.messages).toEqual(restoredMessages);
    expect(state.currentSessionId).toBe('session-1');
    expect(state.isAiRunning).toBe(false);
    expect(state.activeRequestId).toBeNull();
    expect(state.pendingQuestion).toBeNull();
  });

  it('keeps the pending question after message_end for suspended ask_user turns', () => {
    useChatSession.setState({
      messages: [{ id: 'assistant-req-1', role: 'assistant', content: 'Waiting...' }],
      isAiRunning: true,
      activeRequestId: 'req-1',
      pendingQuestion: {
        questionId: 'question-1',
        question: 'Continue?',
        questionType: 'confirm',
      },
    });

    useChatSession.getState().handleAiEvent({
      type: 'message_end',
      requestId: 'req-1',
      text: 'Waiting...',
      usage: { totalTokens: 12 },
    });

    const state = useChatSession.getState();
    expect(state.isAiRunning).toBe(false);
    expect(state.activeRequestId).toBeNull();
    expect(state.pendingQuestion).toMatchObject({ questionId: 'question-1' });
  });
});

describe('useChatSession.answerQuestion', () => {
  beforeEach(() => {
    resetChatSession();
  });

  it('starts a follow-up AI request when answering a pending question', () => {
    const socket = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
    } as unknown as WebSocket;

    useChatSession.setState({
      pendingQuestion: {
        questionId: 'question-1',
        question: 'Continue?',
        questionType: 'confirm',
      },
    });

    const didSend = useChatSession.getState().answerQuestion('question-1', 'yes', socket);
    const state = useChatSession.getState();

    expect(didSend).toBe(true);
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"ai:answer"'));
    expect(state.pendingQuestion).toBeNull();
    expect(state.isAiRunning).toBe(true);
    expect(state.activeRequestId).toMatch(/^ai-/);
    expect(state.messages.at(-1)).toMatchObject({
      id: `assistant-${state.activeRequestId}`,
      role: 'assistant',
      content: '',
    });
  });
});

describe('useChatSession.deleteSession', () => {
  beforeEach(() => {
    resetChatSession();
  });

  it('sends a delete-session request when the current session can be removed', () => {
    const socket = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
    } as unknown as WebSocket;

    const didSend = useChatSession.getState().deleteSession('session-1', socket);

    expect(didSend).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'ai:sessions:delete', sessionId: 'session-1' }),
    );
  });

  it('refuses to delete while a pending question is blocking the session', () => {
    const socket = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
    } as unknown as WebSocket;

    useChatSession.setState({
      pendingQuestion: {
        questionId: 'question-1',
        question: 'Continue?',
        questionType: 'confirm',
      },
    });

    const didSend = useChatSession.getState().deleteSession('session-1', socket);

    expect(didSend).toBe(false);
    expect(socket.send).not.toHaveBeenCalled();
  });
});
