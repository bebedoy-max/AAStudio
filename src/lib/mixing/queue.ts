export type QueueTask<T> = {
  id: string;
  label: string;
  /** number of extra attempts after the first one fails */
  retries?: number;
  /** delay between retries in ms (default 800, exponential) */
  retryDelayMs?: number;
  run: () => Promise<T>;
};

export type QueueResult<T> = { ok: true; value: T } | { ok: false; error: string };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Minimal sequential task queue used by the mixing pipelines (clipper, dubbing).
 * Tasks run one at a time in submit order, with optional retries, and never
 * throw — failures come back as `{ ok: false, error }`.
 */
class MixingQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private running = new Set<string>();

  get activeIds(): string[] {
    return [...this.running];
  }

  submit<T>(task: QueueTask<T>): Promise<QueueResult<T>> {
    const attempts = Math.max(0, task.retries ?? 0) + 1;
    const baseDelay = task.retryDelayMs ?? 800;

    const exec = async (): Promise<QueueResult<T>> => {
      this.running.add(task.id);
      try {
        let lastError = "unknown error";
        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            const value = await task.run();
            return { ok: true, value };
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            if (attempt < attempts) await sleep(baseDelay * attempt);
          }
        }
        return { ok: false, error: `${task.label}: ${lastError}` };
      } finally {
        this.running.delete(task.id);
      }
    };

    const next = this.chain.then(exec, exec);
    this.chain = next.catch(() => undefined);
    return next;
  }
}

export const mixingQueue = new MixingQueue();
