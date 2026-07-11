// Simple in-memory FIFO queue with concurrency + retry.
// Reused by Clipper and Dubbing to keep long chains (upload→stt→brain→…→render) predictable.

export type Job<T> = {
  id: string;
  label: string;
  run: (ctx: { attempt: number }) => Promise<T>;
  retries?: number;
  onProgress?: (msg: string) => void;
};

export type JobResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; error: string; attempts: number };

export class Queue {
  private concurrency: number;
  private running = 0;
  private pending: Array<() => void> = [];

  constructor(concurrency = 1) {
    this.concurrency = concurrency;
  }

  private acquire(): Promise<void> {
    if (this.running < this.concurrency) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise((res) => this.pending.push(res));
  }

  private release() {
    this.running--;
    const next = this.pending.shift();
    if (next) {
      this.running++;
      next();
    }
  }

  async submit<T>(job: Job<T>): Promise<JobResult<T>> {
    await this.acquire();
    const retries = Math.max(0, job.retries ?? 1);
    let lastErr = "unknown";
    try {
      for (let attempt = 1; attempt <= retries + 1; attempt++) {
        try {
          const value = await job.run({ attempt });
          return { ok: true, value, attempts: attempt };
        } catch (e) {
          lastErr = (e as Error).message || String(e);
          job.onProgress?.(`retry ${attempt}/${retries + 1}: ${lastErr}`);
          if (attempt > retries) break;
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
      return { ok: false, error: lastErr, attempts: retries + 1 };
    } finally {
      this.release();
    }
  }
}

export const mixingQueue = new Queue(2);
