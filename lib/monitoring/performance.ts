
/**
 * NEURAL PERFORMANCE MONITOR (v1.0)
 * Tracks latency and success metrics across the infrastructure grid.
 */
interface PerfMetric {
  name: string;
  duration: number;
  timestamp: string;
  metadata?: any;
}

// Global start time to calculate uptime if process.uptime is unavailable
const startTime = Date.now();

class PerformanceMonitor {
  private metrics: PerfMetric[] = [];
  private readonly MAX_HISTORY = 100;

  track(name: string, duration: number, metadata?: any) {
    const metric = {
      name,
      duration,
      timestamp: new Date().toISOString(),
      metadata
    };
    
    this.metrics.push(metric);
    if (this.metrics.length > this.MAX_HISTORY) {
      this.metrics.shift();
    }
    
    console.log(`📊 [Metrics] ${name}: ${duration.toFixed(2)}ms`);
  }

  getSummary() {
    const categories = Array.from(new Set(this.metrics.map(m => m.name)));
    const summary: Record<string, { avg: number; min: number; max: number; count: number }> = {};

    categories.forEach(cat => {
      const filtered = this.metrics.filter(m => m.name === cat);
      const durations = filtered.map(m => m.duration);
      summary[cat] = {
        avg: durations.reduce((a, b) => a + b, 0) / durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations),
        count: durations.length
      };
    });

    return {
      summary,
      recent: this.metrics.slice(-10),
      // Fix: Safely call process.uptime() by casting to any to bypass TS error, and provide a fallback for browser environments
      uptime: typeof process !== 'undefined' && typeof (process as any).uptime === 'function'
        ? (process as any).uptime()
        : (Date.now() - startTime) / 1000
    };
  }
}

export const performanceMonitor = new PerformanceMonitor();
