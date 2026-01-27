/**
 * perf_hooks shim - Performance measurement APIs
 * Wraps browser Performance API
 */

export const performance = globalThis.performance || {
  now: () => Date.now(),
  timeOrigin: Date.now(),
  mark: () => {},
  measure: () => {},
  getEntries: () => [],
  getEntriesByName: () => [],
  getEntriesByType: () => [],
  clearMarks: () => {},
  clearMeasures: () => {},
  clearResourceTimings: () => {},
};

export class PerformanceObserver {
  private callback: (list: PerformanceObserverEntryList) => void;
  private entryTypes: string[] = [];

  constructor(callback: (list: PerformanceObserverEntryList) => void) {
    this.callback = callback;
  }

  observe(options: { entryTypes?: string[]; type?: string }): void {
    this.entryTypes = options.entryTypes || (options.type ? [options.type] : []);
  }

  disconnect(): void {
    this.entryTypes = [];
  }

  takeRecords(): PerformanceEntry[] {
    return [];
  }

  static supportedEntryTypes = ['mark', 'measure', 'resource', 'navigation'];
}

export interface PerformanceObserverEntryList {
  getEntries(): PerformanceEntry[];
  getEntriesByName(name: string, type?: string): PerformanceEntry[];
  getEntriesByType(type: string): PerformanceEntry[];
}

export interface PerformanceEntry {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
}

// Histogram stub
export class Histogram {
  min = 0;
  max = 0;
  mean = 0;
  stddev = 0;
  percentiles = new Map<number, number>();
  exceeds = 0;

  reset(): void {
    this.min = 0;
    this.max = 0;
    this.mean = 0;
    this.stddev = 0;
    this.percentiles.clear();
    this.exceeds = 0;
  }

  percentile(percentile: number): number {
    return this.percentiles.get(percentile) || 0;
  }
}

export function createHistogram(): Histogram {
  return new Histogram();
}

export function monitorEventLoopDelay(options?: { resolution?: number }): Histogram {
  const histogram = new Histogram();
  return histogram;
}

export default {
  performance,
  PerformanceObserver,
  createHistogram,
  monitorEventLoopDelay,
};
