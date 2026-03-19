import React, { useCallback } from 'react';
import { MicIcon } from './MicIcon';
import styles from './CommandInput.module.scss';

export interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isAiRunning: boolean;
  isVoiceActive: boolean;
  onVoiceToggle: () => void;
  modelLabel: string;
  wsReady: boolean;
}

export function CommandInput({
  value,
  onChange,
  onSubmit,
  isAiRunning,
  isVoiceActive,
  onVoiceToggle,
  modelLabel,
  wsReady,
}: CommandInputProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit],
  );

  return (
    <div className={styles.controlFrame}>
      <div className={styles.inputRow}>
        <span className={styles.promptIndicator}>❯</span>
        <input
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isAiRunning ? 'AI is thinking...' : 'Ask the AI...'}
          disabled={isAiRunning}
        />
        <dt-tooltip content={isVoiceActive ? 'Stop voice input' : 'Start voice input'}>
          <button
            className={`${styles.voiceButton} ${isVoiceActive ? styles.voiceButtonActive : ''}`}
            onClick={onVoiceToggle}
          >
            <MicIcon />
          </button>
        </dt-tooltip>
      </div>
      <div className={styles.statusRow}>
        <span className={styles.statusItem}>{wsReady ? modelLabel : 'offline'}</span>
      </div>
    </div>
  );
}
