import React, { useState, useCallback, useRef, useEffect } from 'react';
import 'streamdown/styles.css';
import { useVoiceSession } from '../stores/voice-session';
import { useChatSession, type AiEventMessage } from '../stores/chat-session';
import { tryExecuteSlashCommand } from '../utils/slash-commands';
import { ChatMessageItem } from './ChatMessageItem';
import { CommandInput } from './CommandInput';
import styles from './InfoPanel.module.scss';

/** Minimal interface for the `<dt-select>` web component's JS API. */
interface DtSelectElement extends HTMLElement {
  options: Array<{ value: string; label: string }>;
  value: string;
  disabled: boolean;
}

interface QueuedPrompt {
  id: string;
  source: 'text' | 'voice';
  text: string;
}

export function InfoPanel({ socket, wsReady }: { socket: WebSocket | null; wsReady: boolean }) {
  const [input, setInput] = useState('');
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<DtSelectElement | null>(null);
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
  const loadProviders = useChatSession((s) => s.loadProviders);
  const loadSessions = useChatSession((s) => s.loadSessions);
  const switchSession = useChatSession((s) => s.switchSession);
  const createSession = useChatSession((s) => s.createSession);
  const submitPrompt = useChatSession((s) => s.submitPrompt);
  const handleAiEvent = useChatSession((s) => s.handleAiEvent);
  const clearMessages = useChatSession((s) => s.clearMessages);
  const addSystemMessage = useChatSession((s) => s.addSystemMessage);

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
    isAiRunning || !socket || socket.readyState !== WebSocket.OPEN || !wsReady;

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
  const flushPendingVoicePrompts = useCallback(() => {
    if (isAiRunning || !socket || socket.readyState !== WebSocket.OPEN) return;

    const nextPrompt = pendingVoicePromptsRef.current.shift();
    if (!nextPrompt) return;

    const didSend = submitPrompt(nextPrompt.text, 'voice', socket);
    if (!didSend) {
      pendingVoicePromptsRef.current.unshift(nextPrompt);
    }
  }, [isAiRunning, submitPrompt, socket]);

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

  // Sync options / value / disabled state to the <dt-select> web component
  useEffect(() => {
    const el = selectRef.current;
    if (!el) return;
    el.options = sessions.map((s) => ({ value: s.id, label: s.label }));
  }, [sessions]);

  useEffect(() => {
    const el = selectRef.current;
    if (!el) return;
    el.value = currentSessionId ?? '';
  }, [currentSessionId]);

  useEffect(() => {
    const el = selectRef.current;
    if (!el) return;
    el.disabled = isSessionInteractionDisabled;
  }, [isSessionInteractionDisabled]);

  // Listen for dt-change events from <dt-select>
  useEffect(() => {
    const el = selectRef.current;
    if (!el || !socket) return;

    const handleChange = (e: Event) => {
      const value = (e as CustomEvent<{ value: string }>).detail.value;
      switchSession(value, socket);
    };

    el.addEventListener('dt-change', handleChange);
    return () => {
      el.removeEventListener('dt-change', handleChange);
    };
  }, [socket, switchSession]);

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

  const handleSend = useCallback(() => {
    const text = input.trim();
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
        setInput('');
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
      setInput('');
      return;
    }

    const didSend = submitPrompt(text, 'text', socket);
    if (didSend) {
      setInput('');
    }
  }, [input, isAiRunning, submitPrompt, socket, createSession, clearMessages, addSystemMessage]);

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
  }, [messages, queuedPrompts, transcripts, partialText]);

  const handleCreateSession = useCallback(() => {
    if (!socket) {
      return;
    }

    if (createSession(socket)) {
      setInput('');
    }
  }, [createSession, socket]);

  return (
    <div className={styles.infoPanel}>
      <div className={styles.header}>
        <div className={styles.headerPrimary}>
          <div className={styles.sessionControls}>
            <dt-select
              ref={selectRef as React.Ref<never>}
              placeholder="New session"
              align="right"
            />
            <button
              type="button"
              className={styles.newSessionButton}
              onClick={handleCreateSession}
              disabled={isSessionInteractionDisabled}
              aria-label="Create new session"
              title="Create new session"
            >
              +
            </button>
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
              const isEmptyAssistant = msg.role === 'assistant' && !msg.content;
              const isActiveAssistantMessage = msg.id === activeAssistantMessageId;
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
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        isAiRunning={isAiRunning}
        queuedCount={queuedPrompts.length}
        isVoiceActive={isVoiceActive}
        onVoiceToggle={handleVoiceToggle}
        modelLabel={modelLabel}
        wsReady={wsReady}
      />
    </div>
  );
}
