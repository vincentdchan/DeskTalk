import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import { useVoiceSession } from '../stores/voice-session';
import { CommandInput } from './CommandInput';
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

interface AiProviderOption {
  id: string;
  label: string;
  configured: boolean;
  model: string;
}

interface AiProviderResponse {
  defaultProvider: string;
  providers: AiProviderOption[];
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
  const [providerOptions, setProviderOptions] = useState<AiProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('');
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
          ...(selectedProvider ? { provider: selectedProvider } : {}),
        }),
      );

      return true;
    },
    [socket, isAiRunning, selectedProvider],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadProviders() {
      try {
        const response = await fetch('/api/ai/providers');
        if (!response.ok) {
          throw new Error('Failed to load AI providers');
        }

        const payload = (await response.json()) as AiProviderResponse;
        if (!isMounted) {
          return;
        }

        setProviderOptions(payload.providers);
        setSelectedProvider((current) => current || payload.defaultProvider);
      } catch {
        if (isMounted) {
          setProviderOptions([]);
          setSelectedProvider('');
        }
      }
    }

    void loadProviders();

    return () => {
      isMounted = false;
    };
  }, []);

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

  return (
    <div className={styles.infoPanel}>
      <div className={styles.header}>
        <span>AI Assistant</span>
        <div className={styles.headerControls}>
          {providerOptions.length > 0 && (
            <label className={styles.providerPicker}>
              <span className={styles.providerLabel}>Provider</span>
              <select
                className={styles.providerSelect}
                value={selectedProvider}
                onChange={(event) => setSelectedProvider(event.target.value)}
                disabled={isAiRunning}
              >
                {providerOptions.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                    {provider.configured ? '' : ' (setup needed)'}
                  </option>
                ))}
              </select>
            </label>
          )}
          {tokenCount > 0 && <span className={styles.tokenCount}>{tokenCount} tokens</span>}
        </div>
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
                  <div className={styles.messageHeader}>
                    <span className={styles.messageSpeaker}>
                      {msg.role === 'user' ? 'ME' : 'AI'}
                    </span>
                    {msg.role === 'user' && msg.source === 'voice' && (
                      <span className={styles.voiceSourceBadge}>voice</span>
                    )}
                  </div>
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

      <CommandInput
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        isAiRunning={isAiRunning}
        isVoiceActive={isVoiceActive}
        onVoiceToggle={handleVoiceToggle}
        modelLabel={modelLabel}
        wsReady={wsReady}
      />
    </div>
  );
}
