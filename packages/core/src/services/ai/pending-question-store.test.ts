import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { PendingQuestionStore } from './pending-question-store';

function createStore() {
  const dir = mkdtempSync(join(tmpdir(), 'pending-question-store-'));
  return {
    dir,
    store: new PendingQuestionStore(join(dir, 'pending-questions.json')),
  };
}

describe('PendingQuestionStore', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists and returns the current pending question', () => {
    const { dir, store } = createStore();
    tempDirs.push(dir);

    store.save({
      questionId: 'question-1',
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      question: 'Continue?',
      questionType: 'confirm',
      status: 'pending',
      createdAt: 1,
    });

    expect(store.getPending()).toMatchObject({
      questionId: 'question-1',
      sessionId: 'session-1',
      question: 'Continue?',
      status: 'pending',
    });
  });

  it('marks a question answered and stores the answer', () => {
    const { dir, store } = createStore();
    tempDirs.push(dir);

    store.save({
      questionId: 'question-1',
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      question: 'Continue?',
      questionType: 'confirm',
      status: 'pending',
      createdAt: 1,
    });

    const answered = store.markAnswered('question-1', 'yes');

    expect(answered).toMatchObject({
      questionId: 'question-1',
      status: 'answered',
      answer: 'yes',
    });
    expect(store.getPending()).toBeNull();
    expect(store.get('question-1')).toMatchObject({
      status: 'answered',
      answer: 'yes',
    });
  });

  it('cancels stale pending questions from other sessions', () => {
    const { dir, store } = createStore();
    tempDirs.push(dir);

    store.save({
      questionId: 'question-1',
      sessionId: 'session-old',
      toolCallId: 'tool-1',
      question: 'Continue?',
      questionType: 'confirm',
      status: 'pending',
      createdAt: 1,
    });

    store.cleanupStale('session-new');

    expect(store.getPending()).toBeNull();
    expect(store.get('question-1')).toMatchObject({ status: 'cancelled' });
  });
});
