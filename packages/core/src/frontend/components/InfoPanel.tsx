import React, { useState, useCallback, useRef, useEffect } from 'react';
import 'streamdown/styles.css';
import { useVoiceSession } from '../stores/voice-session';
import { useChatSession, type AiEventMessage } from '../stores/chat-session';
import { ChatMessageItem } from './ChatMessageItem';
import { CommandInput } from './CommandInput';
import styles from './InfoPanel.module.scss';

export function InfoPanel({ socket, wsReady }: { socket: WebSocket | null; wsReady: boolean }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sentVoiceUtteranceIdsRef = useRef<Set<string>>(new Set());
  const pendingVoicePromptsRef = useRef<Array<{ utteranceId: string; text: string }>>([]);

  // Chat session state
  const messages = useChatSession((s) => s.messages);
  const isAiRunning = useChatSession((s) => s.isAiRunning);
  const activeRequestId = useChatSession((s) => s.activeRequestId);
  const modelLabel = useChatSession((s) => s.modelLabel);
  const tokenCount = useChatSession((s) => s.tokenCount);
  const providerOptions = useChatSession((s) => s.providerOptions);
  const selectedProvider = useChatSession((s) => s.selectedProvider);
  const loadProviders = useChatSession((s) => s.loadProviders);
  const setSelectedProvider = useChatSession((s) => s.setSelectedProvider);
  const submitPrompt = useChatSession((s) => s.submitPrompt);
  const handleAiEvent = useChatSession((s) => s.handleAiEvent);

  // Voice session state
  const voiceStatus = useVoiceSession((s) => s.status);
  const voiceError = useVoiceSession((s) => s.errorMessage);
  const partialText = useVoiceSession((s) => s.partialText);
  const transcripts = useVoiceSession((s) => s.transcripts);
  const startVoice = useVoiceSession((s) => s.startVoice);
  const stopVoice = useVoiceSession((s) => s.stopVoice);

  const isVoiceActive = voiceStatus !== 'idle' && voiceStatus !== 'error';
  const activeAssistantMessageId = activeRequestId ? `assistant-${activeRequestId}` : null;

  // Load providers on mount
  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

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

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !socket) return;
    const didSend = submitPrompt(text, 'text', socket);
    if (didSend) {
      setInput('');
    }
  }, [input, submitPrompt, socket]);

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
