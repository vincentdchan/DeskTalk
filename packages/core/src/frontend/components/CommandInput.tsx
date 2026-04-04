import React, { useRef, useState, useMemo, useLayoutEffect, useEffect } from 'react';
import { useMemoizedFn } from 'ahooks';
import { useChatSession, type AiProviderOption } from '../stores/chat-session';
import type { AgentQuestionData } from './info-panel/AgentQuestion';
import { MicIcon } from './MicIcon';
import { StatusRow } from './StatusRow';
import { VoiceErrorBanner } from './VoiceErrorBanner';
import { matchCommands, getAllCommands } from '../utils/slash-commands';
import styles from './CommandInput.module.scss';

export interface CommandInputProps {
  onSubmit: () => void;
  onAnswer?: (questionId: string, answer: string) => void;
  onDismissQuestion?: () => void;
  onCancelAi: () => boolean;
  isAiRunning: boolean;
  pendingQuestion?: AgentQuestionData | null;
  queuedCount: number;
  isVoiceActive: boolean;
  onVoiceToggle: () => void;
  voiceError?: string | null;
  onDismissVoiceError?: () => void;
  modelLabel: string;
  wsReady: boolean;
  compact?: boolean;
  providerOptions?: AiProviderOption[];
  selectedProvider?: string;
  onSelectProvider?: (providerId: string) => void;
}

const MAX_TEXTAREA_HEIGHT = 200;

export function CommandInput({
  onSubmit,
  onAnswer,
  onDismissQuestion,
  onCancelAi,
  isAiRunning,
  pendingQuestion = null,
  queuedCount,
  isVoiceActive,
  onVoiceToggle,
  voiceError = null,
  onDismissVoiceError,
  modelLabel,
  wsReady,
  compact = false,
  providerOptions = [],
  selectedProvider = '',
  onSelectProvider,
}: CommandInputProps) {
  const value = useChatSession((state) => state.draftInput);
  const setDraftInput = useChatSession((state) => state.setDraftInput);
  const clearDraftInput = useChatSession((state) => state.clearDraftInput);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isCancelArmed, setIsCancelArmed] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [selectedQuestionValue, setSelectedQuestionValue] = useState('');
  const [selectedQuestionValues, setSelectedQuestionValues] = useState<string[]>([]);

  const isAnsweringQuestion = pendingQuestion !== null;
  const isQuestionControlsDisabled = !wsReady || isAiRunning;

  const submitPendingQuestionAnswer = useMemoizedFn(() => {
    if (!pendingQuestion?.questionId || !onAnswer || isQuestionControlsDisabled) {
      return;
    }

    if (pendingQuestion.questionType === 'text') {
      const nextAnswer = value.trim();
      if (!nextAnswer) {
        return;
      }

      onAnswer(pendingQuestion.questionId, nextAnswer);
      return;
    }

    if (pendingQuestion.questionType === 'select') {
      if (!selectedQuestionValue) {
        return;
      }

      onAnswer(pendingQuestion.questionId, selectedQuestionValue);
      return;
    }

    if (pendingQuestion.questionType === 'multi_select') {
      if (selectedQuestionValues.length === 0) {
        return;
      }

      onAnswer(pendingQuestion.questionId, JSON.stringify(selectedQuestionValues));
      return;
    }
  });

  const canSubmitPendingQuestion = useMemo(() => {
    if (!pendingQuestion || isQuestionControlsDisabled) {
      return false;
    }

    if (pendingQuestion.questionType === 'text') {
      return value.trim().length > 0;
    }

    if (pendingQuestion.questionType === 'select') {
      return selectedQuestionValue.length > 0;
    }

    if (pendingQuestion.questionType === 'multi_select') {
      return selectedQuestionValues.length > 0;
    }

    return false;
  }, [
    isQuestionControlsDisabled,
    pendingQuestion,
    selectedQuestionValue,
    selectedQuestionValues,
    value,
  ]);

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
    if (isAnsweringQuestion) return null;
    const trimmed = value.trimStart();
    if (!trimmed.startsWith('/')) return null;
    if (trimmed.includes(' ')) return null;
    return trimmed.slice(1); // text after "/"
  }, [isAnsweringQuestion, value]);

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
      if (isAnsweringQuestion) {
        submitPendingQuestionAnswer();
        return;
      }
      onSubmit();
    }
  });

  // Global Esc listener to dismiss a pending question.
  // The textarea may be disabled (select/multi_select/confirm), so we listen on document.
  useEffect(() => {
    if (!isAnsweringQuestion || isAiRunning) return;

    const handleGlobalEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismissQuestion?.();
      }
    };

    document.addEventListener('keydown', handleGlobalEsc);
    return () => document.removeEventListener('keydown', handleGlobalEsc);
  }, [isAnsweringQuestion, isAiRunning, onDismissQuestion]);

  useEffect(() => {
    setSelectedQuestionValue('');
    setSelectedQuestionValues([]);

    if (pendingQuestion?.questionType !== 'text') {
      clearDraftInput();
    }
  }, [clearDraftInput, pendingQuestion?.questionId, pendingQuestion?.questionType]);

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
      {pendingQuestion && (
        <div className={styles.questionBanner}>
          <span className={styles.questionPrompt}>{pendingQuestion.question}</span>
          {pendingQuestion.questionType === 'multi_select' && (
            <span className={styles.questionHint}>
              Choose one or more options, then press Enter. Press Esc to dismiss.
            </span>
          )}
          {pendingQuestion.questionType === 'select' && (
            <span className={styles.questionHint}>
              Choose an option, then press Enter. Press Esc to dismiss.
            </span>
          )}
          {pendingQuestion.questionType === 'text' && (
            <span className={styles.questionHint}>
              Press Enter to submit your answer. Press Esc to dismiss.
            </span>
          )}
          {pendingQuestion.questionType === 'confirm' && (
            <span className={styles.questionHint}>Press Esc to dismiss.</span>
          )}
        </div>
      )}
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
      {pendingQuestion &&
        pendingQuestion.questionType !== 'text' &&
        pendingQuestion.questionType !== 'confirm' && (
          <div className={styles.optionChips}>
            {(pendingQuestion.options ?? []).map((option) => {
              const isSelected =
                pendingQuestion.questionType === 'select'
                  ? selectedQuestionValue === option
                  : selectedQuestionValues.includes(option);

              return (
                <button
                  key={option}
                  type="button"
                  className={`${styles.optionChip} ${isSelected ? styles.optionChipSelected : ''}`}
                  onClick={() => {
                    if (pendingQuestion.questionType === 'select') {
                      setSelectedQuestionValue(option);
                      return;
                    }

                    setSelectedQuestionValues((current) =>
                      current.includes(option)
                        ? current.filter((entry) => entry !== option)
                        : [...current, option],
                    );
                  }}
                  disabled={isQuestionControlsDisabled}
                  aria-pressed={isSelected}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}
      {voiceError && onDismissVoiceError && (
        <VoiceErrorBanner message={voiceError} onClose={onDismissVoiceError} />
      )}
      {pendingQuestion?.questionType === 'confirm' ? (
        <div className={`${styles.confirmButtons} ${compact ? styles.confirmButtonsCompact : ''}`}>
          <button
            type="button"
            className={styles.confirmPrimaryButton}
            onClick={() =>
              pendingQuestion.questionId && onAnswer?.(pendingQuestion.questionId, 'yes')
            }
            disabled={isQuestionControlsDisabled}
          >
            Yes
          </button>
          <button
            type="button"
            className={styles.confirmSecondaryButton}
            onClick={() =>
              pendingQuestion.questionId && onAnswer?.(pendingQuestion.questionId, 'no')
            }
            disabled={isQuestionControlsDisabled}
          >
            No
          </button>
        </div>
      ) : (
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
                : pendingQuestion?.questionType === 'text'
                  ? 'Type your answer...'
                  : isAiRunning
                    ? isCancelArmed
                      ? 'Press Esc again to cancel AI, or Enter to queue the next message'
                      : 'AI is thinking... press Esc twice to cancel or Enter to queue the next message'
                    : 'Ask the AI...'
            }
            disabled={!wsReady || (isAnsweringQuestion && pendingQuestion.questionType !== 'text')}
          />
          {isAnsweringQuestion && pendingQuestion.questionType !== 'text' ? (
            <button
              type="button"
              className={`${styles.inlineSubmitButton} ${compact ? styles.inlineSubmitButtonCompact : ''}`}
              onClick={submitPendingQuestionAnswer}
              disabled={!canSubmitPendingQuestion}
            >
              Submit
            </button>
          ) : null}
          <dt-tooltip content={isVoiceActive ? 'Stop voice input' : 'Start voice input'}>
            <button
              className={`${styles.voiceButton} ${compact ? styles.voiceButtonCompact : ''} ${isVoiceActive ? styles.voiceButtonActive : ''}`}
              onClick={onVoiceToggle}
            >
              <MicIcon />
            </button>
          </dt-tooltip>
        </div>
      )}
      {!compact ? (
        <StatusRow
          modelLabel={modelLabel}
          queuedCount={queuedCount}
          wsReady={wsReady}
          providerOptions={providerOptions}
          selectedProvider={selectedProvider}
          onSelectProvider={onSelectProvider}
        />
      ) : null}
    </div>
  );
}
