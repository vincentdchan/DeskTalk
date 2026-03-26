import { describe, expect, it, vi } from 'vitest';
import { AsyncRequestQueue } from './async-request-queue';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('AsyncRequestQueue', () => {
  it('queues requests after reaching the concurrency limit', async () => {
    const queue = new AsyncRequestQueue({ concurrency: 2, waitTimeoutMs: 30_000 });
    const first = createDeferred<void>();
    const second = createDeferred<void>();
    const third = createDeferred<void>();
    const events: string[] = [];

    const taskOne = queue.run(async () => {
      events.push('start-1');
      await first.promise;
      events.push('end-1');
      return 1;
    });
    const taskTwo = queue.run(async () => {
      events.push('start-2');
      await second.promise;
      events.push('end-2');
      return 2;
    });
    const taskThree = queue.run(async () => {
      events.push('start-3');
      await third.promise;
      events.push('end-3');
      return 3;
    });

    await flushMicrotasks();

    expect(events).toEqual(['start-1', 'start-2']);
    expect(queue.activeCount).toBe(2);
    expect(queue.pendingCount).toBe(1);

    first.resolve();
    await flushMicrotasks();

    expect(events).toEqual(['start-1', 'start-2', 'end-1', 'start-3']);
    expect(queue.activeCount).toBe(2);
    expect(queue.pendingCount).toBe(0);

    second.resolve();
    third.resolve();

    await expect(taskOne).resolves.toBe(1);
    await expect(taskTwo).resolves.toBe(2);
    await expect(taskThree).resolves.toBe(3);
    expect(queue.activeCount).toBe(0);
  });

  it('releases the next request when a running task fails', async () => {
    const queue = new AsyncRequestQueue({ concurrency: 1, waitTimeoutMs: 30_000 });
    const blocker = createDeferred<void>();
    let secondStarted = false;

    const firstTask = queue.run(async () => {
      await blocker.promise;
      return 'first';
    });
    const secondTask = queue.run(async () => {
      secondStarted = true;
      return 'second';
    });

    await flushMicrotasks();
    expect(secondStarted).toBe(false);
    expect(queue.pendingCount).toBe(1);

    const firstTaskExpectation = expect(firstTask).rejects.toThrow('boom');
    blocker.reject(new Error('boom'));

    await firstTaskExpectation;
    await flushMicrotasks();

    expect(secondStarted).toBe(true);
    await expect(secondTask).resolves.toBe('second');
    expect(queue.activeCount).toBe(0);
  });

  it('times out requests that wait in the queue too long', async () => {
    vi.useFakeTimers();

    try {
      const queue = new AsyncRequestQueue({ concurrency: 1, waitTimeoutMs: 30_000 });
      const blocker = createDeferred<void>();

      const runningTask = queue.run(async () => {
        await blocker.promise;
      });
      const queuedTask = queue.run(async () => 'never-runs');

      await flushMicrotasks();
      expect(queue.pendingCount).toBe(1);

      const queuedTaskExpectation = expect(queuedTask).rejects.toThrow(
        'Request queue wait timed out after 30000ms',
      );
      await vi.advanceTimersByTimeAsync(30_000);

      await queuedTaskExpectation;
      expect(queue.pendingCount).toBe(0);

      blocker.resolve();
      await runningTask;
    } finally {
      vi.useRealTimers();
    }
  });
});
