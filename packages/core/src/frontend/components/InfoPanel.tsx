import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useVoiceSession, type VoiceStatus } from '../stores/voice-session.js';
import styles from '../styles/InfoPanel.module.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
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

export function InfoPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice session state
  const voiceStatus = useVoiceSession((s) => s.status);
  const voiceError = useVoiceSession((s) => s.errorMessage);
  const partialText = useVoiceSession((s) => s.partialText);
  const transcripts = useVoiceSession((s) => s.transcripts);
  const startVoice = useVoiceSession((s) => s.startVoice);
  const stopVoice = useVoiceSession((s) => s.stopVoice);
  const clearTranscripts = useVoiceSession((s) => s.clearTranscripts);

  const isVoiceActive = voiceStatus !== 'idle' && voiceStatus !== 'error';

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');

    // TODO: Send to AI backend via WebSocket
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content:
          'AI integration not yet configured. Connect a pi agent session to enable AI features.',
      },
    ]);
  }, [input]);

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
            {messages.map((msg, i) => (
              <div
                key={`msg-${i}`}
                className={msg.role === 'user' ? styles.messageUser : styles.messageAssistant}
              >
                {msg.content}
              </div>
            ))}
          </>
        )}

        {/* Voice transcripts section */}
        {transcripts.length > 0 && (
          <div className={styles.transcriptSection}>
            <div className={styles.transcriptHeader}>
              <span>Voice Transcripts</span>
              <button className={styles.clearButton} onClick={clearTranscripts}>
                Clear
              </button>
            </div>
            {transcripts.map((entry) => (
              <div key={entry.utteranceId} className={styles.transcriptEntry}>
                <div className={styles.transcriptText}>{entry.text}</div>
                <div className={styles.transcriptMeta}>
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
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
          <MicIcon active={isVoiceActive} />
        </button>
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the AI..."
        />
        <button className={styles.sendButton} onClick={handleSend}>
          Send
        </button>
      </div>

      <div className={styles.statusBar}>
        <span>Model: not configured</span>
        <div className={styles.voiceStatus}>
          <span className={`${styles.statusDot} ${voiceStatusInfo.className}`} />
          <span>{voiceStatusInfo.label}</span>
        </div>
        <span>Tokens: 0</span>
      </div>
    </div>
  );
}

/**
 * SVG microphone icon with active/inactive states.
 */
function MicIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? '#ef4444' : 'currentColor'}
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
