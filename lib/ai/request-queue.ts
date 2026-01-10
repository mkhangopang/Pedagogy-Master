
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
  private running = 0;
  private readonly MAX_CONCURRENT = 5; // Allow 5 concurrent requests
  private readonly MIN_DELAY = 100; // Minimal delay between starts

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.running >= this.MAX_CONCURRENT || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { fn, resolve, reject } = this.queue.shift()!;

    // Start next in queue after a tiny delay
    setTimeout(() => this.process(), this.MIN_DELAY);

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }

  getStats() {
    return {
      queued: this.queue.length,
      running: this.running,
      capacity: this.MAX_CONCURRENT
    };
  }
}

export const requestQueue = new RequestQueue();
