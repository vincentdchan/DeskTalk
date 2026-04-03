import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AskUserQuestionType } from './ask-user-tool';

export interface PendingQuestionCheckpoint {
  questionId: string;
  sessionId: string;
  toolCallId: string;
  question: string;
  questionType: AskUserQuestionType;
  options?: string[];
  status: 'pending' | 'answered' | 'cancelled';
  answer?: string;
  createdAt: number;
  answeredAt?: number;
}

interface PendingQuestionStoreFile {
  checkpoints: PendingQuestionCheckpoint[];
}

function readStore(filePath: string): PendingQuestionStoreFile {
  if (!existsSync(filePath)) {
    return { checkpoints: [] };
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as PendingQuestionStoreFile;
    return {
      checkpoints: Array.isArray(parsed.checkpoints) ? parsed.checkpoints : [],
    };
  } catch {
    return { checkpoints: [] };
  }
}

function writeStore(filePath: string, store: PendingQuestionStoreFile): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

export class PendingQuestionStore {
  constructor(private readonly filePath: string) {}

  list(sessionId?: string): PendingQuestionCheckpoint[] {
    const store = readStore(this.filePath);
    const checkpoints = sessionId
      ? store.checkpoints.filter((checkpoint) => checkpoint.sessionId === sessionId)
      : store.checkpoints;
    return checkpoints.sort((left, right) => left.createdAt - right.createdAt);
  }

  get(questionId: string): PendingQuestionCheckpoint | null {
    return this.list().find((checkpoint) => checkpoint.questionId === questionId) ?? null;
  }

  getPending(sessionId?: string): PendingQuestionCheckpoint | null {
    const checkpoints = this.list(sessionId).filter(
      (checkpoint) => checkpoint.status === 'pending',
    );
    return checkpoints.at(-1) ?? null;
  }

  save(checkpoint: PendingQuestionCheckpoint): PendingQuestionCheckpoint {
    const store = readStore(this.filePath);
    const existingPending = store.checkpoints.find(
      (entry) => entry.status === 'pending' && entry.questionId !== checkpoint.questionId,
    );
    if (existingPending) {
      throw new Error('Only one pending question is supported at a time.');
    }

    const nextCheckpoints = store.checkpoints.filter(
      (entry) => entry.questionId !== checkpoint.questionId,
    );
    nextCheckpoints.push(checkpoint);
    writeStore(this.filePath, { checkpoints: nextCheckpoints });
    return checkpoint;
  }

  markAnswered(questionId: string, answer: string): PendingQuestionCheckpoint | null {
    const store = readStore(this.filePath);
    const index = store.checkpoints.findIndex((entry) => entry.questionId === questionId);
    if (index === -1) {
      return null;
    }

    const current = store.checkpoints[index];
    const updated: PendingQuestionCheckpoint = {
      ...current,
      status: 'answered',
      answer,
      answeredAt: Date.now(),
    };
    store.checkpoints[index] = updated;
    writeStore(this.filePath, store);
    return updated;
  }

  markCancelled(questionId: string): PendingQuestionCheckpoint | null {
    const store = readStore(this.filePath);
    const index = store.checkpoints.findIndex((entry) => entry.questionId === questionId);
    if (index === -1) {
      return null;
    }

    const current = store.checkpoints[index];
    const updated: PendingQuestionCheckpoint = {
      ...current,
      status: 'cancelled',
    };
    store.checkpoints[index] = updated;
    writeStore(this.filePath, store);
    return updated;
  }

  cleanupStale(currentSessionId: string): void {
    const store = readStore(this.filePath);
    let changed = false;

    const checkpoints = store.checkpoints.map((checkpoint) => {
      if (checkpoint.status !== 'pending' || checkpoint.sessionId === currentSessionId) {
        return checkpoint;
      }

      changed = true;
      return {
        ...checkpoint,
        status: 'cancelled' as const,
      };
    });

    if (changed) {
      writeStore(this.filePath, { checkpoints });
    }
  }
}
