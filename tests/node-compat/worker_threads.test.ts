/**
 * Node.js worker_threads module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-worker-*.js
 *
 * Note: This shim exposes API shape for browser compatibility, not true
 * multi-threaded Worker semantics.
 */

import { describe, it, expect, vi } from 'vitest';
import workerThreads, {
  isMainThread,
  parentPort,
  workerData,
  threadId,
  Worker,
  MessageChannel,
  MessagePort,
  BroadcastChannel,
  moveMessagePortToContext,
  receiveMessageOnPort,
  SHARE_ENV,
  markAsUntransferable,
  getEnvironmentData,
  setEnvironmentData,
} from '../../src/shims/worker_threads';
import { assert } from './common';

describe('worker_threads module (Node.js compat)', () => {
  describe('exports', () => {
    it('should export thread context values', () => {
      expect(typeof isMainThread).toBe('boolean');
      expect(parentPort).toBeNull();
      expect(workerData).toBeNull();
      expect(typeof threadId).toBe('number');
    });

    it('should export class constructors', () => {
      expect(typeof Worker).toBe('function');
      expect(typeof MessageChannel).toBe('function');
      expect(typeof MessagePort).toBe('function');
      expect(typeof BroadcastChannel).toBe('function');
    });

    it('should export helper functions and symbols', () => {
      expect(typeof moveMessagePortToContext).toBe('function');
      expect(typeof receiveMessageOnPort).toBe('function');
      expect(typeof markAsUntransferable).toBe('function');
      expect(typeof getEnvironmentData).toBe('function');
      expect(typeof setEnvironmentData).toBe('function');
      expect(typeof SHARE_ENV).toBe('symbol');
    });
  });

  describe('thread context values', () => {
    it('isMainThread should be true in shim', () => {
      assert.strictEqual(isMainThread, true);
    });

    it('threadId should be 0 in main-thread shim', () => {
      assert.strictEqual(threadId, 0);
    });
  });

  describe('Worker', () => {
    it('should create Worker instance', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const worker = new Worker('worker.js');
      expect(worker).toBeInstanceOf(Worker);
      warnSpy.mockRestore();
    });

    it('constructor should emit warning in browser shim', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      new Worker('worker.js');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it('should expose default worker metadata', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const worker = new Worker('worker.js');
      assert.strictEqual(worker.threadId, 0);
      expect(typeof worker.resourceLimits).toBe('object');
      warnSpy.mockRestore();
    });

    it('postMessage should be callable', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const worker = new Worker('worker.js');
      assert.doesNotThrow(() => worker.postMessage({ hello: 'world' }));
      assert.doesNotThrow(() => worker.postMessage('x', [{}]));
      warnSpy.mockRestore();
    });

    it('terminate() should resolve to exit code 0', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const worker = new Worker('worker.js');
      await expect(worker.terminate()).resolves.toBe(0);
      warnSpy.mockRestore();
    });

    it('ref() and unref() should be callable', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const worker = new Worker('worker.js');
      assert.doesNotThrow(() => worker.ref());
      assert.doesNotThrow(() => worker.unref());
      warnSpy.mockRestore();
    });

    it('getHeapSnapshot() should resolve object', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const worker = new Worker('worker.js');
      await expect(worker.getHeapSnapshot()).resolves.toEqual({});
      warnSpy.mockRestore();
    });
  });

  describe('MessagePort and MessageChannel', () => {
    it('MessagePort should be EventEmitter-compatible', () => {
      const port = new MessagePort();
      expect(typeof port.on).toBe('function');
      expect(typeof port.emit).toBe('function');
    });

    it('MessagePort methods should be callable', () => {
      const port = new MessagePort();
      assert.doesNotThrow(() => port.postMessage({ a: 1 }));
      assert.doesNotThrow(() => port.start());
      assert.doesNotThrow(() => port.close());
      assert.doesNotThrow(() => port.ref());
      assert.doesNotThrow(() => port.unref());
    });

    it('MessageChannel should create two MessagePort instances', () => {
      const channel = new MessageChannel();
      expect(channel.port1).toBeInstanceOf(MessagePort);
      expect(channel.port2).toBeInstanceOf(MessagePort);
      expect(channel.port1).not.toBe(channel.port2);
    });
  });

  describe('BroadcastChannel', () => {
    it('should create with channel name', () => {
      const channel = new BroadcastChannel('updates');
      expect(channel).toBeInstanceOf(BroadcastChannel);
      assert.strictEqual(channel.name, 'updates');
    });

    it('should be EventEmitter-compatible', () => {
      const channel = new BroadcastChannel('updates');
      expect(typeof channel.on).toBe('function');
      expect(typeof channel.emit).toBe('function');
    });

    it('methods should be callable', () => {
      const channel = new BroadcastChannel('updates');
      assert.doesNotThrow(() => channel.postMessage({ ping: true }));
      assert.doesNotThrow(() => channel.close());
      assert.doesNotThrow(() => channel.ref());
      assert.doesNotThrow(() => channel.unref());
    });
  });

  describe('helpers and environment data', () => {
    it('moveMessagePortToContext should return same port', () => {
      const port = new MessagePort();
      const moved = moveMessagePortToContext(port, {});
      expect(moved).toBe(port);
    });

    it('receiveMessageOnPort should return undefined', () => {
      const port = new MessagePort();
      assert.strictEqual(receiveMessageOnPort(port), undefined);
    });

    it('SHARE_ENV should match Node global symbol key', () => {
      expect(SHARE_ENV).toBe(Symbol.for('nodejs.worker_threads.SHARE_ENV'));
    });

    it('markAsUntransferable should be callable', () => {
      assert.doesNotThrow(() => markAsUntransferable({ foo: 'bar' }));
    });

    it('environment data accessors should be callable', () => {
      assert.doesNotThrow(() => setEnvironmentData('key', 'value'));
      assert.strictEqual(getEnvironmentData('key'), undefined);
    });
  });

  describe('default export', () => {
    it('should expose key APIs', () => {
      expect(workerThreads.Worker).toBe(Worker);
      expect(workerThreads.MessageChannel).toBe(MessageChannel);
      expect(workerThreads.SHARE_ENV).toBe(SHARE_ENV);
      expect(workerThreads.isMainThread).toBe(isMainThread);
    });
  });

  describe('known limitations (documented)', () => {
    it.skip('should execute code in a separate thread and exchange messages', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const worker = new Worker('worker.js');
      const onMessage = vi.fn();
      worker.on('message', onMessage);
      worker.postMessage({ ping: true });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(onMessage).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it.skip('receiveMessageOnPort should return queued message payloads', () => {
      const channel = new MessageChannel();
      channel.port1.postMessage({ hello: 'world' });
      expect(receiveMessageOnPort(channel.port2)).toEqual({ message: { hello: 'world' } });
    });
  });
});
