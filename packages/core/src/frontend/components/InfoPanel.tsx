import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useMemoizedFn } from 'ahooks';
import { FaRegTrashAlt } from 'react-icons/fa';
import 'streamdown/styles.css';
import { useVoiceSession } from '../stores/voice-session';
import { useChatSession, type AiEventMessage } from '../stores/chat-session';
import { tryExecuteSlashCommand } from '../utils/slash-commands';
import { ChatMessageItem } from './ChatMessageItem';
import { CommandInput } from './CommandInput';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './InfoPanel.module.scss';

interface QueuedPrompt {
  id: string;
  source: 'text' | 'voice';
  text: string;
}

export function InfoPanel({ socket, wsReady }: { socket: WebSocket | null; wsReady: boolean }) {
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sentVoiceUtteranceIdsRef = useRef<Set<string>>(new Set());
  const pendingVoicePromptsRef = useRef<Array<{ utteranceId: string; text: string }>>([]);

  // Chat session state
  const messages = useChatSession((s) => s.messages);
  const isAiRunning = useChatSession((s) => s.isAiRunning);
  const activeRequestId = useChatSession((s) => s.activeRequestId);
  const modelLabel = useChatSession((s) => s.modelLabel);
  const tokenCount = useChatSession((s) => s.tokenCount);
  const currentSessionId = useChatSession((s) => s.currentSessionId);
  const sessions = useChatSession((s) => s.sessions);
  const pendingQuestion = useChatSession((s) => s.pendingQuestion);
  const loadProviders = useChatSession((s) => s.loadProviders);
  const loadSessions = useChatSession((s) => s.loadSessions);
  const switchSession = useChatSession((s) => s.switchSession);
  const createSession = useChatSession((s) => s.createSession);
  const deleteSession = useChatSession((s) => s.deleteSession);
  const cancelAiRequest = useChatSession((s) => s.cancelAiRequest);
  const submitPrompt = useChatSession((s) => s.submitPrompt);
  const answerQuestion = useChatSession((s) => s.answerQuestion);
  const dismissQuestion = useChatSession((s) => s.dismissQuestion);
  const clearDraftInput = useChatSession((s) => s.clearDraftInput);
  const handleAiEvent = useChatSession((s) => s.handleAiEvent);
  const clearMessages = useChatSession((s) => s.clearMessages);
  const addSystemMessage = useChatSession((s) => s.addSystemMessage);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Voice session state
  const voiceStatus = useVoiceSession((s) => s.status);
  const voiceError = useVoiceSession((s) => s.errorMessage);
  const partialText = useVoiceSession((s) => s.partialText);
  const transcripts = useVoiceSession((s) => s.transcripts);
  const startVoice = useVoiceSession((s) => s.startVoice);
  const stopVoice = useVoiceSession((s) => s.stopVoice);

  const isVoiceActive = voiceStatus !== 'idle' && voiceStatus !== 'error';
  const activeAssistantMessageId = activeRequestId ? `assistant-${activeRequestId}` : null;
  const isSessionInteractionDisabled =
    isAiRunning ||
    Boolean(pendingQuestion) ||
    !socket ||
    socket.readyState !== WebSocket.OPEN ||
    !wsReady;
  const shouldShowDeleteButton = sessions.length > 1 && messages.length > 0;
  const currentSessionLabel = useMemo(
    () => sessions.find((session) => session.id === currentSessionId)?.label ?? 'this session',
    [currentSessionId, sessions],
  );

  // Load the current provider preference when the panel mounts or reconnects.
  useEffect(() => {
    if (!wsReady) return;
    void loadProviders();
  }, [loadProviders, wsReady]);

  useEffect(() => {
    if (!socket || !wsReady || socket.readyState !== WebSocket.OPEN) return;
    loadSessions(socket);
  }, [loadSessions, socket, wsReady]);

  // Listen for AI events from the WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(String(event.data)) as { type?: string; event?: AiEventMessage };
        if (msg.type !== 'ai:event' || !msg.event) {
          return;
        }

        handleAiEvent(msg.event);
      } catch {
        // Ignore malformed AI events
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [socket, handleAiEvent]);

  // Voice-to-chat bridge: queue final transcripts and flush as prompts
  const flushPendingVoicePrompts = useMemoizedFn(() => {
    if (isAiRunning || !socket || socket.readyState !== WebSocket.OPEN) return;

    const nextPrompt = pendingVoicePromptsRef.current.shift();
    if (!nextPrompt) return;

    const didSend = submitPrompt(nextPrompt.text, 'voice', socket);
    if (!didSend) {
      pendingVoicePromptsRef.current.unshift(nextPrompt);
    }
  });

  useEffect(() => {
    for (const entry of transcripts) {
      if (!entry.isFinal || sentVoiceUtteranceIdsRef.current.has(entry.utteranceId)) {
        continue;
      }

      sentVoiceUtteranceIdsRef.current.add(entry.utteranceId);
      pendingVoicePromptsRef.current.push({
        utteranceId: entry.utteranceId,
        text: entry.text,
      });
    }

    flushPendingVoicePrompts();
  }, [transcripts, flushPendingVoicePrompts]);

  useEffect(() => {
    if (!isAiRunning) {
      flushPendingVoicePrompts();
    }
  }, [isAiRunning, flushPendingVoicePrompts]);

  useEffect(() => {
    setQueuedPrompts([]);
    pendingVoicePromptsRef.current = [];
    sentVoiceUtteranceIdsRef.current.clear();
  }, [currentSessionId]);

  useEffect(() => {
    if (
      isAiRunning ||
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      queuedPrompts.length === 0
    ) {
      return;
    }

    const [nextPrompt] = queuedPrompts;
    const didSend = submitPrompt(nextPrompt.text, nextPrompt.source, socket);
    if (didSend) {
      setQueuedPrompts((prev) => prev.slice(1));
    }
  }, [isAiRunning, queuedPrompts, socket, submitPrompt]);

  const handleSend = useMemoizedFn(() => {
    const text = useChatSession.getState().draftInput.trim();
    if (!text || !socket) return;

    // Try to handle as a slash command first.
    if (text.startsWith('/')) {
      const handled = tryExecuteSlashCommand(text, {
        socket,
        createSession,
        clearMessages,
        addSystemMessage,
      });
      if (handled) {
        clearDraftInput();
        return;
      }
    }

    if (isAiRunning) {
      setQueuedPrompts((prev) => [
        ...prev,
        {
          id: `queued-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          source: 'text',
          text,
        },
      ]);
      clearDraftInput();
      return;
    }

    const didSend = submitPrompt(text, 'text', socket);
    if (didSend) {
      clearDraftInput();
    }
  });

  const handleVoiceToggle = useCallback(() => {
    if (isVoiceActive) {
      stopVoice();
    } else {
      void startVoice();
    }
  }, [isVoiceActive, startVoice, stopVoice]);

  // Auto-scroll messages area when new content arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingQuestion, queuedPrompts, transcripts, partialText]);

  const handleCreateSession = useCallback(() => {
    if (!socket) {
      return;
    }

    if (createSession(socket)) {
      clearDraftInput();
    }
  }, [clearDraftInput, createSession, socket]);

  const handleCancelAi = useCallback(() => {
    if (!socket) {
      return false;
    }

    return cancelAiRequest(socket);
  }, [cancelAiRequest, socket]);

  const handleConfirmDeleteSession = useCallback(() => {
    if (!socket || !currentSessionId) {
      setIsDeleteConfirmOpen(false);
      return;
    }

    const didDelete = deleteSession(currentSessionId, socket);
    if (!didDelete) {
      addSystemMessage(
        'Unable to delete the current session. Finish or cancel the active AI work and try again.',
      );
      return;
    }

    setIsDeleteConfirmOpen(false);
  }, [addSystemMessage, currentSessionId, deleteSession, socket]);

  return (
    <div className={styles.infoPanel}>
      <div className={styles.header}>
        <div className={styles.headerPrimary}>
          <div className={styles.sessionControls}>
            <dt-select
              value={currentSessionId ?? ''}
              options={sessions.map((session) => ({ value: session.id, label: session.label }))}
              placeholder="New session"
              align="right"
              disabled={isSessionInteractionDisabled}
              ondt-change={(event) => {
                if (!socket) {
                  return;
                }

                void switchSession(event.detail.value, socket);
              }}
            />
            <dt-tooltip content="Create new session" align="right">
              <button
                type="button"
                className={`${styles.sessionActionButton} ${styles.newSessionButton}`}
                onClick={handleCreateSession}
                disabled={isSessionInteractionDisabled}
                aria-label="Create new session"
              >
                +
              </button>
            </dt-tooltip>
            {shouldShowDeleteButton ? (
              <dt-tooltip content="Delete current session" align="right">
                <button
                  type="button"
                  className={`${styles.sessionActionButton} ${styles.deleteSessionButton}`}
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  disabled={isSessionInteractionDisabled || !currentSessionId}
                  aria-label="Delete current session"
                >
                  <FaRegTrashAlt aria-hidden="true" />
                </button>
              </dt-tooltip>
            ) : null}
          </div>
        </div>
        <div className={styles.headerControls}>
          {tokenCount > 0 && <span className={styles.tokenCount}>{tokenCount} tokens</span>}
        </div>
      </div>

      <div className={styles.messages}>
        {/* Chat messages */}
        {messages.length === 0 &&
        queuedPrompts.length === 0 &&
        transcripts.length === 0 &&
        !partialText ? (
          <div className={styles.placeholder}>
            Ask the AI to interact with your MiniApps, or use voice input
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isActiveAssistantMessage = msg.id === activeAssistantMessageId;
              const isEmptyAssistant =
                msg.role === 'assistant' && !msg.content && !msg.thinkingContent;
              const isThinking = isEmptyAssistant && isAiRunning && isActiveAssistantMessage;

              return (
                <ChatMessageItem
                  key={msg.id}
                  message={msg}
                  isThinking={isThinking}
                  isStreaming={msg.role === 'assistant' && isAiRunning && isActiveAssistantMessage}
                />
              );
            })}
            {queuedPrompts.map((prompt, index) => (
              <div key={prompt.id} className={styles.queuedMessage}>
                <div className={styles.queuedMessageHeader}>
                  <span className={styles.queuedSpeaker}>ME</span>
                  <span className={styles.queuedBadge}>{index === 0 ? 'next' : 'queued'}</span>
                </div>
                <div className={styles.queuedMessageBody}>{prompt.text}</div>
              </div>
            ))}
          </>
        )}

        {/* Partial transcript while speaking */}
        {partialText && (
          <div className={styles.partialTranscript}>
            <span className={styles.partialDot} />
            {partialText}
          </div>
        )}

        {/* Voice status indicator when active */}
        {isVoiceActive && !partialText && voiceStatus === 'listening' && (
          <div className={styles.voiceListening}>
            <span className={styles.listeningDot} />
            Listening for speech...
          </div>
        )}

        {voiceStatus === 'speaking' && !partialText && (
          <div className={styles.voiceSpeaking}>
            <span className={styles.speakingWave} />
            Detecting speech...
          </div>
        )}

        {voiceStatus === 'processing' && (
          <div className={styles.voiceProcessing}>Transcribing...</div>
        )}

        {/* Error display */}
        {voiceError && <div className={styles.voiceError}>{voiceError}</div>}

        <div ref={messagesEndRef} />
      </div>

      <CommandInput
        onSubmit={handleSend}
        onAnswer={(questionId, answer) => {
          if (!socket || !answerQuestion(questionId, answer, socket)) {
            addSystemMessage(
              'Unable to submit the pending answer. Reconnect or cancel the current AI request and try again.',
            );
          }
        }}
        onDismissQuestion={() => {
          if (socket) {
            dismissQuestion(socket);
          }
        }}
        onCancelAi={handleCancelAi}
        isAiRunning={isAiRunning}
        pendingQuestion={pendingQuestion}
        queuedCount={queuedPrompts.length}
        isVoiceActive={isVoiceActive}
        onVoiceToggle={handleVoiceToggle}
        modelLabel={modelLabel}
        wsReady={wsReady}
      />
      {isDeleteConfirmOpen && shouldShowDeleteButton ? (
        <ConfirmDialog
          title="Delete session"
          message={`Delete \"${currentSessionLabel}\"? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          danger
          onConfirm={handleConfirmDeleteSession}
          onCancel={() => setIsDeleteConfirmOpen(false)}
        />
      ) : null}
    </div>
  );
}
