import React, { useState, useRef, useCallback } from 'react';
import { useChatSession } from '../stores/chat-session';
import { useVoiceSession } from '../stores/voice-session';
import { ChatMessageItem } from './ChatMessageItem';
import { CommandInput } from './CommandInput';
import styles from './CompactInfoPanel.module.scss';

interface CompactInfoPanelProps {
  socket: WebSocket | null;
  wsReady: boolean;
}

export function CompactInfoPanel({ socket, wsReady }: CompactInfoPanelProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const messages = useChatSession((s) => s.messages);
  const isAiRunning = useChatSession((s) => s.isAiRunning);
  const activeRequestId = useChatSession((s) => s.activeRequestId);
  const modelLabel = useChatSession((s) => s.modelLabel);
  const cancelAiRequest = useChatSession((s) => s.cancelAiRequest);
  const submitPrompt = useChatSession((s) => s.submitPrompt);
  const clearDraftInput = useChatSession((s) => s.clearDraftInput);

  const voiceStatus = useVoiceSession((s) => s.status);
  const partialText = useVoiceSession((s) => s.partialText);
  const startVoice = useVoiceSession((s) => s.startVoice);
  const stopVoice = useVoiceSession((s) => s.stopVoice);

  const isVoiceActive = voiceStatus !== 'idle' && voiceStatus !== 'error';
  const activeAssistantMessageId = activeRequestId ? `assistant-${activeRequestId}` : null;

  // Get the latest message
  const latestMessage = messages[messages.length - 1];

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
      panelRef.current?.setPointerCapture(e.pointerId);
    },
    [position],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;

      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;

      setPosition({ x: newX, y: newY });
    },
    [isDragging],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    panelRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  const handleSend = useCallback(() => {
    const text = useChatSession.getState().draftInput.trim();
    if (!text || !socket) return;

    if (isAiRunning) {
      clearDraftInput();
      return;
    }

    submitPrompt(text, 'text', socket);
    if (useChatSession.getState().isAiRunning) {
      clearDraftInput();
    }
  }, [isAiRunning, socket, submitPrompt, clearDraftInput]);

  const handleVoiceToggle = useCallback(() => {
    if (isVoiceActive) {
      stopVoice();
    } else {
      void startVoice();
    }
  }, [isVoiceActive, startVoice, stopVoice]);

  const handleCancelAi = useCallback(() => {
    if (!socket) {
      return false;
    }
    return cancelAiRequest(socket);
  }, [cancelAiRequest, socket]);

  return (
    <div
      ref={panelRef}
      className={styles.compactPanel}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Drag Handle */}
      <div
        className={styles.dragHandle}
        onPointerDown={handlePointerDown}
        role="button"
        aria-label="Drag to move"
        tabIndex={0}
      >
        <div className={styles.dragHandleLine} />
      </div>

      {/* Latest Message Area */}
      <div className={styles.messageArea}>
        {latestMessage ? (
          <ChatMessageItem
            message={latestMessage}
            isThinking={
              latestMessage.id === activeAssistantMessageId &&
              latestMessage.role === 'assistant' &&
              !latestMessage.content &&
              !latestMessage.thinkingContent &&
              isAiRunning
            }
            isStreaming={
              latestMessage.role === 'assistant' &&
              isAiRunning &&
              latestMessage.id === activeAssistantMessageId
            }
          />
        ) : (
          <div className={styles.placeholder}>Ask the AI to get started</div>
        )}

        {/* Voice Transcription */}
        {partialText && (
          <div className={styles.partialTranscript}>
            <span className={styles.partialDot} />
            {partialText}
          </div>
        )}

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
      </div>

      {/* Command Input */}
      <div className={styles.commandInputWrapper}>
        <CommandInput
          onSubmit={handleSend}
          onCancelAi={handleCancelAi}
          isAiRunning={isAiRunning}
          queuedCount={0}
          isVoiceActive={isVoiceActive}
          onVoiceToggle={handleVoiceToggle}
          modelLabel={modelLabel}
          wsReady={wsReady}
        />
      </div>
    </div>
  );
}
