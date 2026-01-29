/**
 * Node.js perf_hooks module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-perf-hooks-*.js
 *
 * Note: Our perf_hooks shim wraps the browser Performance API.
 */

import { describe, it, expect } from 'vitest';
import perfHooks, {
  performance,
  PerformanceObserver,
  Histogram,
  createHistogram,
  monitorEventLoopDelay,
} from '../../src/shims/perf_hooks';
import { assert } from './common';

describe('perf_hooks module (Node.js compat)', () => {
  describe('performance', () => {
    it('should have now() method', () => {
      expect(typeof performance.now).toBe('function');
    });

    it('now() should return a number', () => {
      const now = performance.now();
      expect(typeof now).toBe('number');
      expect(now).toBeGreaterThanOrEqual(0);
    });

    it('now() should increase over time', async () => {
      const before = performance.now();
      await new Promise(resolve => setTimeout(resolve, 10));
      const after = performance.now();
      expect(after).toBeGreaterThan(before);
    });

    it('should have timeOrigin', () => {
      expect(typeof performance.timeOrigin).toBe('number');
      expect(performance.timeOrigin).toBeGreaterThan(0);
    });

    it('should have mark() method', () => {
      expect(typeof performance.mark).toBe('function');
      // Should not throw
      expect(() => performance.mark('test-mark')).not.toThrow();
    });

    it('should have measure() method', () => {
      expect(typeof performance.measure).toBe('function');
    });

    it('should have getEntries() method', () => {
      expect(typeof performance.getEntries).toBe('function');
      const entries = performance.getEntries();
      expect(Array.isArray(entries)).toBe(true);
    });

    it('should have getEntriesByName() method', () => {
      expect(typeof performance.getEntriesByName).toBe('function');
      const entries = performance.getEntriesByName('test');
      expect(Array.isArray(entries)).toBe(true);
    });

    it('should have getEntriesByType() method', () => {
      expect(typeof performance.getEntriesByType).toBe('function');
      const entries = performance.getEntriesByType('mark');
      expect(Array.isArray(entries)).toBe(true);
    });

    it('should have clearMarks() method', () => {
      expect(typeof performance.clearMarks).toBe('function');
      expect(() => performance.clearMarks()).not.toThrow();
    });

    it('should have clearMeasures() method', () => {
      expect(typeof performance.clearMeasures).toBe('function');
      expect(() => performance.clearMeasures()).not.toThrow();
    });
  });

  describe('PerformanceObserver', () => {
    it('should be a constructor', () => {
      expect(typeof PerformanceObserver).toBe('function');
    });

    it('should create instance with callback', () => {
      const observer = new PerformanceObserver(() => {});
      expect(observer).toBeInstanceOf(PerformanceObserver);
    });

    it('should have observe() method', () => {
      const observer = new PerformanceObserver(() => {});
      expect(typeof observer.observe).toBe('function');
    });

    it('observe() should accept entryTypes option', () => {
      const observer = new PerformanceObserver(() => {});
      expect(() => observer.observe({ entryTypes: ['mark', 'measure'] })).not.toThrow();
    });

    it('observe() should accept type option', () => {
      const observer = new PerformanceObserver(() => {});
      expect(() => observer.observe({ type: 'mark' })).not.toThrow();
    });

    it('should have disconnect() method', () => {
      const observer = new PerformanceObserver(() => {});
      expect(typeof observer.disconnect).toBe('function');
      expect(() => observer.disconnect()).not.toThrow();
    });

    it('should have takeRecords() method', () => {
      const observer = new PerformanceObserver(() => {});
      expect(typeof observer.takeRecords).toBe('function');
      const records = observer.takeRecords();
      expect(Array.isArray(records)).toBe(true);
    });

    it('should have static supportedEntryTypes', () => {
      expect(Array.isArray(PerformanceObserver.supportedEntryTypes)).toBe(true);
      expect(PerformanceObserver.supportedEntryTypes).toContain('mark');
      expect(PerformanceObserver.supportedEntryTypes).toContain('measure');
    });
  });

  describe('Histogram', () => {
    it('should be a class', () => {
      expect(typeof Histogram).toBe('function');
    });

    it('should have numeric properties', () => {
      const histogram = new Histogram();
      expect(typeof histogram.min).toBe('number');
      expect(typeof histogram.max).toBe('number');
      expect(typeof histogram.mean).toBe('number');
      expect(typeof histogram.stddev).toBe('number');
      expect(typeof histogram.exceeds).toBe('number');
    });

    it('should have percentiles Map', () => {
      const histogram = new Histogram();
      expect(histogram.percentiles).toBeInstanceOf(Map);
    });

    it('should have reset() method', () => {
      const histogram = new Histogram();
      expect(typeof histogram.reset).toBe('function');
      expect(() => histogram.reset()).not.toThrow();
    });

    it('reset() should clear values', () => {
      const histogram = new Histogram();
      histogram.min = 10;
      histogram.max = 100;
      histogram.reset();
      assert.strictEqual(histogram.min, 0);
      assert.strictEqual(histogram.max, 0);
    });

    it('should have percentile() method', () => {
      const histogram = new Histogram();
      expect(typeof histogram.percentile).toBe('function');
    });

    it('percentile() should return number', () => {
      const histogram = new Histogram();
      const value = histogram.percentile(50);
      expect(typeof value).toBe('number');
    });
  });

  describe('createHistogram()', () => {
    it('should return a Histogram instance', () => {
      const histogram = createHistogram();
      expect(histogram).toBeInstanceOf(Histogram);
    });
  });

  describe('monitorEventLoopDelay()', () => {
    it('should return a Histogram instance', () => {
      const histogram = monitorEventLoopDelay();
      expect(histogram).toBeInstanceOf(Histogram);
    });

    it('should accept options', () => {
      const histogram = monitorEventLoopDelay({ resolution: 20 });
      expect(histogram).toBeInstanceOf(Histogram);
    });
  });

  describe('default export', () => {
    it('should export performance', () => {
      expect(perfHooks.performance).toBe(performance);
    });

    it('should export PerformanceObserver', () => {
      expect(perfHooks.PerformanceObserver).toBe(PerformanceObserver);
    });

    it('should export createHistogram', () => {
      expect(perfHooks.createHistogram).toBe(createHistogram);
    });

    it('should export monitorEventLoopDelay', () => {
      expect(perfHooks.monitorEventLoopDelay).toBe(monitorEventLoopDelay);
    });
  });
});
