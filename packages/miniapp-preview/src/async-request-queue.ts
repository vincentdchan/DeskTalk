interface AsyncRequestQueueOptions {
  concurrency: number;
  waitTimeoutMs: number;
}

interface PendingRequest {
  grant: () => void;
}

export class AsyncRequestQueue {
  private readonly concurrency: number;
  private readonly waitTimeoutMs: number;
  private running = 0;
  private readonly pending: PendingRequest[] = [];

  constructor(options: AsyncRequestQueueOptions) {
    if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
      throw new Error('AsyncRequestQueue concurrency must be a positive integer.');
    }
    if (!Number.isInteger(options.waitTimeoutMs) || options.waitTimeoutMs < 1) {
      throw new Error('AsyncRequestQueue waitTimeoutMs must be a positive integer.');
    }

    this.concurrency = options.concurrency;
    this.waitTimeoutMs = options.waitTimeoutMs;
  }

  get activeCount(): number {
    return this.running;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  async run<T>(task: () => Promise<T> | T): Promise<T> {
    await this.acquire();

    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.concurrency) {
      this.running += 1;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const pendingRequest: PendingRequest = {
        grant: () => {
          clearTimeout(timer);
          this.running += 1;
          resolve();
        },
      };

      const timer = setTimeout(() => {
        const index = this.pending.indexOf(pendingRequest);
        if (index >= 0) {
          this.pending.splice(index, 1);
        }
        reject(new Error(`Request queue wait timed out after ${this.waitTimeoutMs}ms.`));
      }, this.waitTimeoutMs);

      this.pending.push(pendingRequest);
    });
  }

  private release(): void {
    if (this.running === 0) {
      return;
    }

    this.running -= 1;

    const next = this.pending.shift();
    if (!next) {
      return;
    }

    next.grant();
  }
}
