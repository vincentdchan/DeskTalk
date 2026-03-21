import React, { useCallback, useRef, useState, useMemo, useLayoutEffect } from 'react';
import { MicIcon } from './MicIcon';
import { matchCommands, getAllCommands } from '../utils/slash-commands';
import styles from './CommandInput.module.scss';

export interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isAiRunning: boolean;
  queuedCount: number;
  isVoiceActive: boolean;
  onVoiceToggle: () => void;
  modelLabel: string;
  wsReady: boolean;
}

const MAX_TEXTAREA_HEIGHT = 200;

export function CommandInput({
  value,
  onChange,
  onSubmit,
  isAiRunning,
  queuedCount,
  isVoiceActive,
  onVoiceToggle,
  modelLabel,
  wsReady,
}: CommandInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Determine if we should show the slash command autocomplete.
  // Only when input starts with "/" and contains no spaces (still typing the command name).
  const slashPrefix = useMemo(() => {
    const trimmed = value.trimStart();
    if (!trimmed.startsWith('/')) return null;
    if (trimmed.includes(' ')) return null;
    return trimmed.slice(1); // text after "/"
  }, [value]);

  const suggestions = useMemo(() => {
    if (slashPrefix === null) return [];
    // Show all commands when just "/" is typed, otherwise filter by prefix.
    return slashPrefix === '' ? getAllCommands() : matchCommands(slashPrefix);
  }, [slashPrefix]);

  const showSuggestions = suggestions.length > 0;

  const acceptSuggestion = useCallback(
    (idx: number) => {
      const cmd = suggestions[idx];
      if (!cmd) return;
      onChange(`/${cmd.name} `);
      setSelectedIdx(0);
      textareaRef.current?.focus();
    },
    [suggestions, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showSuggestions) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIdx((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIdx((prev) => (prev >= suggestions.length - 1 ? 0 : prev + 1));
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          acceptSuggestion(selectedIdx);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          // Clear the slash prefix so menu closes; reset to empty.
          onChange('');
          setSelectedIdx(0);
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit, showSuggestions, suggestions.length, selectedIdx, acceptSuggestion, onChange],
  );

  // Reset the selected index whenever the suggestion list changes.
  useLayoutEffect(() => {
    setSelectedIdx(0);
  }, [suggestions.length]);

  // Auto-resize the textarea to fit its content, up to MAX_TEXTAREA_HEIGHT.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Reset to auto so scrollHeight reflects the actual content height.
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden';
  }, [value]);

  return (
    <div className={styles.controlFrame}>
      {showSuggestions && (
        <ul className={styles.slashMenu} role="listbox">
          {suggestions.map((cmd, i) => (
            <li
              key={cmd.name}
              role="option"
              aria-selected={i === selectedIdx}
              className={`${styles.slashMenuItem} ${i === selectedIdx ? styles.slashMenuItemActive : ''}`}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus on textarea
                acceptSuggestion(i);
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <span className={styles.slashMenuName}>/{cmd.name}</span>
              <span className={styles.slashMenuDesc}>{cmd.description}</span>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.inputRow}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            isAiRunning
              ? 'AI is thinking... press Enter to queue the next message'
              : 'Ask the AI...'
          }
          disabled={!wsReady}
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
        {queuedCount > 0 && <span className={styles.statusItem}>{queuedCount} queued</span>}
      </div>
    </div>
  );
}
