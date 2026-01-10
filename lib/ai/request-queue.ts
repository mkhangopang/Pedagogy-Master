
class RequestQueue {
  private queue: Array<{
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private processing = false;
  private readonly MIN_DELAY = 500; // Reduced from 1500 to prevent gateway timeouts

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      if (!this.processing) this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const { fn, resolve, reject } = this.queue.shift()!;

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    }

    await new Promise(r => setTimeout(r, this.MIN_DELAY));
    this.process();
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

export const requestQueue = new RequestQueue();
