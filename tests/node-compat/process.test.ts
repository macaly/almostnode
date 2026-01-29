/**
 * Node.js process module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-process-*.js
 *
 * Note: Our process shim provides a minimal implementation for browser environment.
 * Some values are simulated/mocked since we can't access real system information.
 */

import { describe, it, expect, vi } from 'vitest';
import { createProcess, process as defaultProcess } from '../../src/shims/process';
import { assert } from './common';

describe('process module (Node.js compat)', () => {
  describe('process.env', () => {
    it('should be an object', () => {
      const proc = createProcess();
      expect(typeof proc.env).toBe('object');
      expect(proc.env).not.toBeNull();
    });

    it('should have default environment variables', () => {
      const proc = createProcess();
      expect(proc.env.NODE_ENV).toBeDefined();
      expect(proc.env.PATH).toBeDefined();
      expect(proc.env.HOME).toBeDefined();
    });

    it('should accept custom environment variables', () => {
      const proc = createProcess({
        env: { MY_VAR: 'my_value', ANOTHER: 'test' },
      });
      assert.strictEqual(proc.env.MY_VAR, 'my_value');
      assert.strictEqual(proc.env.ANOTHER, 'test');
    });

    it('should allow setting new environment variables', () => {
      const proc = createProcess();
      proc.env.NEW_VAR = 'new_value';
      assert.strictEqual(proc.env.NEW_VAR, 'new_value');
    });

    it('should allow deleting environment variables', () => {
      const proc = createProcess({ env: { TO_DELETE: 'value' } });
      delete proc.env.TO_DELETE;
      assert.strictEqual(proc.env.TO_DELETE, undefined);
    });
  });

  describe('process.cwd() and process.chdir()', () => {
    it('should return current working directory', () => {
      const proc = createProcess({ cwd: '/home/user' });
      assert.strictEqual(proc.cwd(), '/home/user');
    });

    it('should default to root directory', () => {
      const proc = createProcess();
      assert.strictEqual(proc.cwd(), '/');
    });

    it('should change directory with chdir', () => {
      const proc = createProcess({ cwd: '/home' });
      proc.chdir('/tmp');
      assert.strictEqual(proc.cwd(), '/tmp');
    });

    it('should handle relative paths in chdir', () => {
      const proc = createProcess({ cwd: '/home' });
      proc.chdir('user');
      expect(proc.cwd()).toContain('user');
    });
  });

  describe('process.platform', () => {
    it('should return a valid platform string', () => {
      const proc = createProcess();
      expect(typeof proc.platform).toBe('string');
      const validPlatforms = ['aix', 'darwin', 'freebsd', 'linux', 'openbsd', 'sunos', 'win32'];
      expect(validPlatforms).toContain(proc.platform);
    });
  });

  describe('process.version', () => {
    it('should return a version string starting with v', () => {
      const proc = createProcess();
      expect(typeof proc.version).toBe('string');
      expect(proc.version.startsWith('v')).toBe(true);
    });

    it('should match semver format', () => {
      const proc = createProcess();
      expect(proc.version).toMatch(/^v\d+\.\d+\.\d+/);
    });
  });

  describe('process.versions', () => {
    it('should return an object with version info', () => {
      const proc = createProcess();
      expect(typeof proc.versions).toBe('object');
      expect(proc.versions.node).toBeDefined();
    });

    it('should have node version', () => {
      const proc = createProcess();
      expect(typeof proc.versions.node).toBe('string');
      expect(proc.versions.node).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('process.argv', () => {
    it('should be an array', () => {
      const proc = createProcess();
      expect(Array.isArray(proc.argv)).toBe(true);
    });

    it('should have at least 2 elements', () => {
      const proc = createProcess();
      expect(proc.argv.length).toBeGreaterThanOrEqual(2);
    });

    it('should have node as first element', () => {
      const proc = createProcess();
      expect(proc.argv[0]).toContain('node');
    });
  });

  describe('process.argv0', () => {
    it('should be a string', () => {
      const proc = createProcess();
      expect(typeof proc.argv0).toBe('string');
    });
  });

  describe('process.execPath', () => {
    it('should be a string path', () => {
      const proc = createProcess();
      expect(typeof proc.execPath).toBe('string');
      expect(proc.execPath.length).toBeGreaterThan(0);
    });
  });

  describe('process.execArgv', () => {
    it('should be an array', () => {
      const proc = createProcess();
      expect(Array.isArray(proc.execArgv)).toBe(true);
    });
  });

  describe('process.pid', () => {
    it('should be a positive number', () => {
      const proc = createProcess();
      expect(typeof proc.pid).toBe('number');
      expect(proc.pid).toBeGreaterThan(0);
    });
  });

  describe('process.ppid', () => {
    it('should be a non-negative number', () => {
      const proc = createProcess();
      expect(typeof proc.ppid).toBe('number');
      expect(proc.ppid).toBeGreaterThanOrEqual(0);
    });
  });

  describe('process.exit()', () => {
    it('should emit exit event', () => {
      const proc = createProcess();
      const exitHandler = vi.fn();
      proc.on('exit', exitHandler);

      expect(() => proc.exit(0)).toThrow();
      expect(exitHandler).toHaveBeenCalledWith(0);
    });

    it('should call onExit callback', () => {
      const onExit = vi.fn();
      const proc = createProcess({ onExit });

      expect(() => proc.exit(1)).toThrow();
      expect(onExit).toHaveBeenCalledWith(1);
    });

    it('should default to exit code 0', () => {
      const onExit = vi.fn();
      const proc = createProcess({ onExit });

      expect(() => proc.exit()).toThrow();
      expect(onExit).toHaveBeenCalledWith(0);
    });
  });

  describe('process.nextTick()', () => {
    it('should execute callback asynchronously', async () => {
      const proc = createProcess();
      const order: number[] = [];

      proc.nextTick(() => order.push(2));
      order.push(1);

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(order).toEqual([1, 2]);
    });

    it('should pass arguments to callback', async () => {
      const proc = createProcess();
      let result: unknown[] = [];

      proc.nextTick((a, b, c) => {
        result = [a, b, c];
      }, 1, 2, 3);

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(result).toEqual([1, 2, 3]);
    });

    it('should execute multiple callbacks in order', async () => {
      const proc = createProcess();
      const order: number[] = [];

      proc.nextTick(() => order.push(1));
      proc.nextTick(() => order.push(2));
      proc.nextTick(() => order.push(3));

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('process.stdout', () => {
    it('should have write method', () => {
      const proc = createProcess();
      expect(typeof proc.stdout.write).toBe('function');
    });

    it('should have isTTY property', () => {
      const proc = createProcess();
      expect(typeof proc.stdout.isTTY).toBe('boolean');
    });

    it('should be an EventEmitter', () => {
      const proc = createProcess();
      expect(typeof proc.stdout.on).toBe('function');
      expect(typeof proc.stdout.emit).toBe('function');
    });

    it('write should return boolean', () => {
      const proc = createProcess();
      const result = proc.stdout.write('test');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('process.stderr', () => {
    it('should have write method', () => {
      const proc = createProcess();
      expect(typeof proc.stderr.write).toBe('function');
    });

    it('should have isTTY property', () => {
      const proc = createProcess();
      expect(typeof proc.stderr.isTTY).toBe('boolean');
    });

    it('should be an EventEmitter', () => {
      const proc = createProcess();
      expect(typeof proc.stderr.on).toBe('function');
      expect(typeof proc.stderr.emit).toBe('function');
    });
  });

  describe('process.stdin', () => {
    it('should have isTTY property', () => {
      const proc = createProcess();
      expect(typeof proc.stdin.isTTY).toBe('boolean');
    });

    it('should be an EventEmitter', () => {
      const proc = createProcess();
      expect(typeof proc.stdin.on).toBe('function');
      expect(typeof proc.stdin.emit).toBe('function');
    });

    it('should have setRawMode method', () => {
      const proc = createProcess();
      expect(typeof proc.stdin.setRawMode).toBe('function');
    });
  });

  describe('process.hrtime()', () => {
    it('should return array of [seconds, nanoseconds]', () => {
      const proc = createProcess();
      const time = proc.hrtime();
      expect(Array.isArray(time)).toBe(true);
      expect(time.length).toBe(2);
      expect(typeof time[0]).toBe('number');
      expect(typeof time[1]).toBe('number');
    });

    it('should return increasing values', () => {
      const proc = createProcess();
      const time1 = proc.hrtime();
      const time2 = proc.hrtime();
      const total1 = time1[0] * 1e9 + time1[1];
      const total2 = time2[0] * 1e9 + time2[1];
      expect(total2).toBeGreaterThanOrEqual(total1);
    });

    it('should calculate diff when given previous time', () => {
      const proc = createProcess();
      const start = proc.hrtime();
      const diff = proc.hrtime(start);
      expect(Array.isArray(diff)).toBe(true);
      expect(diff.length).toBe(2);
    });

    it('should have bigint method', () => {
      const proc = createProcess();
      expect(typeof proc.hrtime.bigint).toBe('function');
    });

    it('bigint should return bigint value', () => {
      const proc = createProcess();
      const time = proc.hrtime.bigint();
      expect(typeof time).toBe('bigint');
    });
  });

  describe('process.memoryUsage()', () => {
    it('should return object with memory info', () => {
      const proc = createProcess();
      const mem = proc.memoryUsage();
      expect(typeof mem).toBe('object');
    });

    it('should have expected properties', () => {
      const proc = createProcess();
      const mem = proc.memoryUsage();
      expect(mem).toHaveProperty('rss');
      expect(mem).toHaveProperty('heapTotal');
      expect(mem).toHaveProperty('heapUsed');
      expect(mem).toHaveProperty('external');
      expect(mem).toHaveProperty('arrayBuffers');
    });

    it('should return positive numbers', () => {
      const proc = createProcess();
      const mem = proc.memoryUsage();
      expect(mem.rss).toBeGreaterThan(0);
      expect(mem.heapTotal).toBeGreaterThan(0);
      expect(mem.heapUsed).toBeGreaterThan(0);
    });
  });

  describe('process.uptime()', () => {
    it('should return a non-negative number', () => {
      const proc = createProcess();
      const uptime = proc.uptime();
      expect(typeof uptime).toBe('number');
      expect(uptime).toBeGreaterThanOrEqual(0);
    });

    it('should increase over time', async () => {
      const proc = createProcess();
      const uptime1 = proc.uptime();
      await new Promise(resolve => setTimeout(resolve, 10));
      const uptime2 = proc.uptime();
      expect(uptime2).toBeGreaterThan(uptime1);
    });
  });

  describe('process.cpuUsage()', () => {
    it('should return object with user and system', () => {
      const proc = createProcess();
      const usage = proc.cpuUsage();
      expect(typeof usage).toBe('object');
      expect(usage).toHaveProperty('user');
      expect(usage).toHaveProperty('system');
    });

    it('should return numbers', () => {
      const proc = createProcess();
      const usage = proc.cpuUsage();
      expect(typeof usage.user).toBe('number');
      expect(typeof usage.system).toBe('number');
    });
  });

  describe('EventEmitter methods', () => {
    it('should support on/emit', () => {
      const proc = createProcess();
      const handler = vi.fn();
      proc.on('test', handler);
      proc.emit('test', 'arg1', 'arg2');
      expect(handler).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should support once', () => {
      const proc = createProcess();
      const handler = vi.fn();
      proc.once('test', handler);
      proc.emit('test');
      proc.emit('test');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support off/removeListener', () => {
      const proc = createProcess();
      const handler = vi.fn();
      proc.on('test', handler);
      proc.off('test', handler);
      proc.emit('test');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should support removeAllListeners', () => {
      const proc = createProcess();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      proc.on('test', handler1);
      proc.on('test', handler2);
      proc.removeAllListeners('test');
      proc.emit('test');
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should support listeners()', () => {
      const proc = createProcess();
      const handler = vi.fn();
      proc.on('test', handler);
      const listeners = proc.listeners('test');
      expect(listeners).toContain(handler);
    });

    it('should support listenerCount()', () => {
      const proc = createProcess();
      proc.on('test', () => {});
      proc.on('test', () => {});
      assert.strictEqual(proc.listenerCount('test'), 2);
    });

    it('should support eventNames()', () => {
      const proc = createProcess();
      proc.on('event1', () => {});
      proc.on('event2', () => {});
      const names = proc.eventNames();
      expect(names).toContain('event1');
      expect(names).toContain('event2');
    });

    it('should support setMaxListeners/getMaxListeners', () => {
      const proc = createProcess();
      proc.setMaxListeners(20);
      assert.strictEqual(proc.getMaxListeners(), 20);
    });

    it('should return process for chaining', () => {
      const proc = createProcess();
      const result = proc.on('test', () => {});
      expect(result).toBe(proc);
    });
  });

  describe('default export', () => {
    it('should export a process instance', () => {
      expect(defaultProcess).toBeDefined();
      expect(typeof defaultProcess.cwd).toBe('function');
      expect(typeof defaultProcess.env).toBe('object');
    });
  });
});
