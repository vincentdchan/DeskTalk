import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import { useVoiceSession, type VoiceStatus } from '../stores/voice-session';
import styles from './InfoPanel.module.scss';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  source?: 'text' | 'voice';
  timestamp?: number;
}

interface AiEventMessage {
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

/**
 * Status label and class for the voice status indicator.
 */
function getVoiceStatusInfo(status: VoiceStatus): { label: string; className: string } {
  switch (status) {
    case 'idle':
      return { label: 'Voice Off', className: styles.statusIdle };
    case 'connecting':
      return { label: 'Connecting...', className: styles.statusConnecting };
    case 'listening':
      return { label: 'Listening', className: styles.statusListening };
    case 'speaking':
      return { label: 'Speaking...', className: styles.statusSpeaking };
    case 'processing':
      return { label: 'Processing...', className: styles.statusProcessing };
    case 'error':
      return { label: 'Error', className: styles.statusError };
  }
}

function MarkdownMessage({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  return (
    <Streamdown className={styles.markdownContent} isAnimating={isStreaming} animated>
      {content}
    </Streamdown>
  );
}

export function InfoPanel({ socket, wsReady }: { socket: WebSocket | null; wsReady: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [modelLabel, setModelLabel] = useState('not configured');
  const [tokenCount, setTokenCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const sentVoiceUtteranceIdsRef = useRef<Set<string>>(new Set());
  const pendingVoicePromptsRef = useRef<Array<{ utteranceId: string; text: string }>>([]);

  // Voice session state
  const voiceStatus = useVoiceSession((s) => s.status);
  const voiceError = useVoiceSession((s) => s.errorMessage);
  const partialText = useVoiceSession((s) => s.partialText);
  const transcripts = useVoiceSession((s) => s.transcripts);
  const startVoice = useVoiceSession((s) => s.startVoice);
  const stopVoice = useVoiceSession((s) => s.stopVoice);

  const isVoiceActive = voiceStatus !== 'idle' && voiceStatus !== 'error';

  const submitPrompt = useCallback(
    (text: string, source: 'text' | 'voice' = 'text') => {
      if (!text || !socket || socket.readyState !== WebSocket.OPEN || isAiRunning) {
        return false;
      }

      const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      activeRequestIdRef.current = requestId;

      setMessages((prev) => [
        ...prev,
        { id: `user-${requestId}`, role: 'user', content: text, source },
        { id: `assistant-${requestId}`, role: 'assistant', content: '' },
      ]);
      setInput('');
      setIsAiRunning(true);
      setTokenCount(0);

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
    [socket, isAiRunning],
  );

  const flushPendingVoicePrompts = useCallback(() => {
    if (isAiRunning) return;

    const nextPrompt = pendingVoicePromptsRef.current.shift();
    if (!nextPrompt) return;

    const didSend = submitPrompt(nextPrompt.text, 'voice');
    if (!didSend) {
      pendingVoicePromptsRef.current.unshift(nextPrompt);
    }
  }, [isAiRunning, submitPrompt]);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(String(event.data)) as { type?: string; event?: AiEventMessage };
        if (msg.type !== 'ai:event' || !msg.event) {
          return;
        }

        const aiEvent = msg.event;
        if (aiEvent.type === 'history_sync') {
          setMessages(aiEvent.messages ?? []);
          return;
        }

        if (activeRequestIdRef.current && aiEvent.requestId !== activeRequestIdRef.current) {
          return;
        }

        if (aiEvent.type === 'message_start') {
          setIsAiRunning(true);
          setModelLabel(aiEvent.model ? `${aiEvent.provider}/${aiEvent.model}` : 'not configured');
        } else if (aiEvent.type === 'message_update') {
          setMessages((prev) => {
            const next = [...prev];
            const lastIndex = next.length - 1;
            if (lastIndex >= 0 && next[lastIndex].role === 'assistant') {
              next[lastIndex] = { ...next[lastIndex], content: aiEvent.text ?? '' };
            }
            return next;
          });
        } else if (aiEvent.type === 'message_end') {
          const endedRequestId = activeRequestIdRef.current;
          setIsAiRunning(false);
          setTokenCount(aiEvent.usage?.totalTokens ?? 0);
          activeRequestIdRef.current = null;
          // Remove empty assistant message bubble by matching its ID
          if (endedRequestId) {
            const targetId = `assistant-${endedRequestId}`;
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === targetId);
              if (idx >= 0 && !prev[idx].content) {
                return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
              }
              return prev;
            });
          }
        } else if (aiEvent.type === 'error') {
          setIsAiRunning(false);
          setMessages((prev) => {
            const next = [...prev];
            const lastIndex = next.length - 1;
            if (lastIndex >= 0 && next[lastIndex].role === 'assistant') {
              next[lastIndex] = {
                ...next[lastIndex],
                content: aiEvent.message ?? 'AI request failed.',
              };
            } else {
              next.push({
                id: `assistant-error-${Date.now()}`,
                role: 'assistant',
                content: aiEvent.message ?? 'AI request failed.',
              });
            }
            return next;
          });
          activeRequestIdRef.current = null;
        }
      } catch {
        // Ignore malformed AI events
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [socket]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    void submitPrompt(text, 'text');
  }, [input, submitPrompt]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

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
  }, [messages, transcripts, partialText]);

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

  const voiceStatusInfo = getVoiceStatusInfo(voiceStatus);

  return (
    <div className={styles.infoPanel}>
      <div className={styles.header}>
        <span>AI Assistant</span>
      </div>

      <div className={styles.messages}>
        {/* Chat messages */}
        {messages.length === 0 && transcripts.length === 0 && !partialText ? (
          <div className={styles.placeholder}>
            Ask the AI to interact with your MiniApps, or use voice input
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isEmptyAssistant = msg.role === 'assistant' && !msg.content;
              const isThinking = isEmptyAssistant && isAiRunning;

              // Don't render empty assistant bubbles when not thinking
              if (isEmptyAssistant && !isAiRunning) return null;

              return (
                <div
                  key={msg.id}
                  className={msg.role === 'user' ? styles.messageUser : styles.messageAssistant}
                >
                  {msg.role === 'user' && msg.source === 'voice' && (
                    <div className={styles.messageMeta}>
                      <span className={styles.voiceSourceBadge}>Voice</span>
                    </div>
                  )}
                  {isThinking ? (
                    <div className={styles.thinkingIndicator}>
                      <span className={styles.thinkingDot} />
                      <span className={styles.thinkingDot} />
                      <span className={styles.thinkingDot} />
                    </div>
                  ) : (
                    <MarkdownMessage
                      content={msg.content}
                      isStreaming={msg.role === 'assistant' && isAiRunning}
                    />
                  )}
                </div>
              );
            })}
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

      <div className={styles.inputArea}>
        <button
          className={`${styles.voiceButton} ${isVoiceActive ? styles.voiceButtonActive : ''}`}
          onClick={handleVoiceToggle}
          title={isVoiceActive ? 'Stop voice input' : 'Start voice input'}
        >
          <MicIcon />
        </button>
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the AI..."
        />
        <button className={styles.sendButton} onClick={handleSend}>
          {isAiRunning ? '...' : 'Send'}
        </button>
      </div>

      <div className={styles.statusBar}>
        <span>Model: {wsReady ? modelLabel : 'offline'}</span>
        <div className={styles.voiceStatus}>
          <span className={`${styles.statusDot} ${voiceStatusInfo.className}`} />
          <span>{voiceStatusInfo.label}</span>
        </div>
        <span>Tokens: {tokenCount}</span>
      </div>
    </div>
  );
}

/**
 * SVG microphone icon with active/inactive states.
 */
function MicIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
