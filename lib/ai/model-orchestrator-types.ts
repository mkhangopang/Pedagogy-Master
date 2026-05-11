export type ComplexityLevel = 'lookup' | 'strategy' | 'creation';

export interface TaskResult {
  text: string;
  modelUsed: string;
  timestamp: string;
  latencyMs: number;
}
