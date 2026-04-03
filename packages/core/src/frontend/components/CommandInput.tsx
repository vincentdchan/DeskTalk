import React, { useRef, useState, useMemo, useLayoutEffect } from 'react';
import { useMemoizedFn } from 'ahooks';
import { useChatSession } from '../stores/chat-session';
import { MicIcon } from './MicIcon';
import { matchCommands, getAllCommands } from '../utils/slash-commands';
import styles from './CommandInput.module.scss';

export interface CommandInputProps {
  onSubmit: () => void;
  onCancelAi: () => boolean;
  isAiRunning: boolean;
  hasPendingQuestion?: boolean;
  queuedCount: number;
  isVoiceActive: boolean;
  onVoiceToggle: () => void;
  modelLabel: string;
  wsReady: boolean;
  compact?: boolean;
}

const MAX_TEXTAREA_HEIGHT = 200;

export function CommandInput({
  onSubmit,
  onCancelAi,
  isAiRunning,
  hasPendingQuestion = false,
  queuedCount,
  isVoiceActive,
  onVoiceToggle,
  modelLabel,
  wsReady,
  compact = false,
}: CommandInputProps) {
  const value = useChatSession((state) => state.draftInput);
  const setDraftInput = useChatSession((state) => state.setDraftInput);
  const clearDraftInput = useChatSession((state) => state.clearDraftInput);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isCancelArmed, setIsCancelArmed] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const resetCancelState = useMemoizedFn(() => {
    if (cancelResetTimeoutRef.current !== null) {
      clearTimeout(cancelResetTimeoutRef.current);
      cancelResetTimeoutRef.current = null;
    }
    setIsCancelArmed(false);
    setIsCancelling(false);
  });

  const armCancelShortcut = useMemoizedFn(() => {
    if (cancelResetTimeoutRef.current !== null) {
      clearTimeout(cancelResetTimeoutRef.current);
    }

    setIsCancelArmed(true);
    cancelResetTimeoutRef.current = setTimeout(() => {
      cancelResetTimeoutRef.current = null;
      setIsCancelArmed(false);
    }, 1500);
  });

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

  const acceptSuggestion = useMemoizedFn((idx: number) => {
    const cmd = suggestions[idx];
    if (!cmd) return;
    setDraftInput(`/${cmd.name} `);
    setSelectedIdx(0);
    textareaRef.current?.focus();
  });

  const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && isAiRunning) {
      e.preventDefault();
      if (isCancelArmed) {
        if (cancelResetTimeoutRef.current !== null) {
          clearTimeout(cancelResetTimeoutRef.current);
          cancelResetTimeoutRef.current = null;
        }
        setIsCancelArmed(false);
        if (onCancelAi()) {
          setIsCancelling(true);
        }
      } else {
        armCancelShortcut();
      }
      return;
    }

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
        clearDraftInput();
        setSelectedIdx(0);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  });

  // Reset the selected index whenever the suggestion list changes.
  useLayoutEffect(() => {
    setSelectedIdx(0);
  }, [suggestions.length]);

  useLayoutEffect(() => {
    if (!isAiRunning) {
      resetCancelState();
    }
  }, [isAiRunning, resetCancelState]);

  useLayoutEffect(() => {
    return () => {
      if (cancelResetTimeoutRef.current !== null) {
        clearTimeout(cancelResetTimeoutRef.current);
      }
    };
  }, []);

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
    <div className={`${styles.controlFrame} ${compact ? styles.controlFrameCompact : ''}`}>
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
      <div className={`${styles.inputRow} ${compact ? styles.inputRowCompact : ''}`}>
        <textarea
          ref={textareaRef}
          className={`${styles.input} ${compact ? styles.inputCompact : ''}`}
          value={value}
          onChange={(e) => setDraftInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            isCancelling
              ? 'Cancelling AI...'
              : hasPendingQuestion
                ? 'Answer the pending question above, or press Esc twice to cancel'
                : isAiRunning
                  ? isCancelArmed
                    ? 'Press Esc again to cancel AI, or Enter to queue the next message'
                    : 'AI is thinking... press Esc twice to cancel or Enter to queue the next message'
                  : 'Ask the AI...'
          }
          disabled={!wsReady}
        />
        <dt-tooltip content={isVoiceActive ? 'Stop voice input' : 'Start voice input'}>
          <button
            className={`${styles.voiceButton} ${compact ? styles.voiceButtonCompact : ''} ${isVoiceActive ? styles.voiceButtonActive : ''}`}
            onClick={onVoiceToggle}
          >
            <MicIcon />
          </button>
        </dt-tooltip>
      </div>
      {!compact && (
        <div className={styles.statusRow}>
          <span className={styles.statusItem}>{wsReady ? modelLabel : 'offline'}</span>
          {queuedCount > 0 && <span className={styles.statusItem}>{queuedCount} queued</span>}
        </div>
      )}
    </div>
  );
}
