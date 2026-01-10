
/**
 * CONCURRENT REQUEST ORCHESTRATOR
 * Manages outgoing AI synthesis requests with concurrency control
 * to prevent gateway bottlenecks while respecting provider limits.
 */
class RequestQueue {
  private queue: Array<{
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private activeCount = 0;
  private readonly MAX_CONCURRENT = 5;
  private readonly MIN_START_DELAY = 150;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.activeCount >= this.MAX_CONCURRENT || this.queue.length === 0) {
      return;
    }

    this.activeCount++;
    const { fn, resolve, reject } = this.queue.shift()!;

    // Stagger starts slightly to prevent burst errors on edge
    setTimeout(() => this.process(), this.MIN_START_DELAY);

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.activeCount--;
      this.process();
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getStats() {
    return {
      queued: this.queue.length,
      active: this.activeCount,
      capacity: this.MAX_CONCURRENT
    };
  }
}

export const requestQueue = new RequestQueue();
