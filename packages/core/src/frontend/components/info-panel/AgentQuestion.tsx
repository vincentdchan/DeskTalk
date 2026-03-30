import { useMemo, useState, type FormEvent } from 'react';
import styles from './AgentQuestion.module.scss';

export type AgentQuestionType = 'text' | 'select' | 'multi_select' | 'confirm';

export interface AgentQuestionData {
  questionId?: string;
  question: string;
  questionType: AgentQuestionType;
  options?: string[];
  answer?: string;
}

interface AgentQuestionProps {
  question: AgentQuestionData;
  onAnswer?: (questionId: string, answer: string) => void;
}

function formatAnswer(question: AgentQuestionData): string {
  if (question.answer === undefined) {
    return 'Waiting for answer';
  }

  if (question.questionType !== 'multi_select') {
    return question.answer;
  }

  try {
    const parsed = JSON.parse(question.answer) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === 'string').join(', ');
    }
  } catch {
    return question.answer;
  }

  return question.answer;
}

export function AgentQuestion({ question, onAnswer }: AgentQuestionProps) {
  const [textValue, setTextValue] = useState('');
  const [selectedValue, setSelectedValue] = useState('');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const answerLabel = useMemo(() => formatAnswer(question), [question]);
  const isAnswered = question.answer !== undefined;

  const submitAnswer = (answer: string) => {
    if (!onAnswer || !question.questionId) {
      return;
    }

    onAnswer(question.questionId, answer);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (question.questionType === 'text') {
      const nextAnswer = textValue.trim();
      if (nextAnswer) {
        submitAnswer(nextAnswer);
      }
      return;
    }

    if (question.questionType === 'select') {
      if (selectedValue) {
        submitAnswer(selectedValue);
      }
      return;
    }

    if (question.questionType === 'multi_select' && selectedValues.length > 0) {
      submitAnswer(JSON.stringify(selectedValues));
    }
  };

  if (isAnswered) {
    return (
      <div className={styles.answeredQuestion}>
        <span className={styles.questionLabel}>{question.question}</span>
        <span className={styles.answerLabel}>{answerLabel}</span>
      </div>
    );
  }

  return (
    <form className={styles.pendingQuestion} onSubmit={handleSubmit}>
      <div className={styles.prompt}>{question.question}</div>

      {question.questionType === 'text' && (
        <div className={styles.controlsRow}>
          <input
            className={styles.textInput}
            type="text"
            value={textValue}
            onChange={(event) => setTextValue(event.target.value)}
            placeholder="Type your answer"
          />
          <button type="submit" className={styles.submitButton} disabled={!textValue.trim()}>
            Submit
          </button>
        </div>
      )}

      {question.questionType === 'select' && (
        <>
          <div className={styles.optionList}>
            {(question.options ?? []).map((option) => (
              <label key={option} className={styles.optionItem}>
                <input
                  type="radio"
                  name={question.questionId}
                  value={option}
                  checked={selectedValue === option}
                  onChange={() => setSelectedValue(option)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
          <button type="submit" className={styles.submitButton} disabled={!selectedValue}>
            Submit
          </button>
        </>
      )}

      {question.questionType === 'multi_select' && (
        <>
          <div className={styles.optionList}>
            {(question.options ?? []).map((option) => (
              <label key={option} className={styles.optionItem}>
                <input
                  type="checkbox"
                  value={option}
                  checked={selectedValues.includes(option)}
                  onChange={(event) => {
                    setSelectedValues((current) =>
                      event.target.checked
                        ? [...current, option]
                        : current.filter((entry) => entry !== option),
                    );
                  }}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={selectedValues.length === 0}
          >
            Submit
          </button>
        </>
      )}

      {question.questionType === 'confirm' && (
        <div className={styles.controlsRow}>
          <button type="button" className={styles.submitButton} onClick={() => submitAnswer('yes')}>
            Yes
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => submitAnswer('no')}
          >
            No
          </button>
        </div>
      )}
    </form>
  );
}
