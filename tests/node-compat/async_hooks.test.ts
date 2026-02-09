/**
 * Node.js async_hooks module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-async-hooks-*.js
 */

import { describe, it, expect } from 'vitest';
import asyncHooks, {
  AsyncResource,
  AsyncLocalStorage,
  createHook,
  executionAsyncId,
  executionAsyncResource,
  triggerAsyncId,
} from '../../src/shims/async_hooks';
import { assert } from './common';

describe('async_hooks module (Node.js compat)', () => {
  describe('exports', () => {
    it('should export AsyncResource and AsyncLocalStorage', () => {
      expect(typeof AsyncResource).toBe('function');
      expect(typeof AsyncLocalStorage).toBe('function');
    });

    it('should export hook and id helpers', () => {
      expect(typeof createHook).toBe('function');
      expect(typeof executionAsyncId).toBe('function');
      expect(typeof executionAsyncResource).toBe('function');
      expect(typeof triggerAsyncId).toBe('function');
    });
  });

  describe('AsyncResource', () => {
    it('should construct and run function in async scope', () => {
      const resource = new AsyncResource('test');
      const thisObj = { value: 2 };
      const result = resource.runInAsyncScope(function (this: { value: number }, a: number, b: number) {
        return this.value + a + b;
      }, thisObj, 3, 4);
      assert.strictEqual(result, 9);
    });

    it('emitDestroy should be chainable', () => {
      const resource = new AsyncResource('test');
      expect(resource.emitDestroy()).toBe(resource);
    });

    it('asyncId and triggerAsyncId should return number', () => {
      const resource = new AsyncResource('test');
      expect(typeof resource.asyncId()).toBe('number');
      expect(typeof resource.triggerAsyncId()).toBe('number');
      assert.strictEqual(resource.asyncId(), 0);
      assert.strictEqual(resource.triggerAsyncId(), 0);
    });

    it('AsyncResource.bind should return same function identity', () => {
      const fn = (v: number) => v + 1;
      const bound = AsyncResource.bind(fn, 'bound');
      expect(bound).toBe(fn);
      assert.strictEqual(bound(1), 2);
    });
  });

  describe('AsyncLocalStorage', () => {
    it('getStore should be undefined by default', () => {
      const als = new AsyncLocalStorage<{ id: string }>();
      assert.strictEqual(als.getStore(), undefined);
    });

    it('run() should set store during callback and restore afterward', () => {
      const als = new AsyncLocalStorage<{ id: string }>();

      const inside = als.run({ id: 'a' }, () => {
        const store = als.getStore();
        return store?.id;
      });

      assert.strictEqual(inside, 'a');
      assert.strictEqual(als.getStore(), undefined);
    });

    it('run() should restore previous store after nested run', () => {
      const als = new AsyncLocalStorage<{ id: string }>();

      als.run({ id: 'outer' }, () => {
        assert.strictEqual(als.getStore()?.id, 'outer');
        als.run({ id: 'inner' }, () => {
          assert.strictEqual(als.getStore()?.id, 'inner');
        });
        assert.strictEqual(als.getStore()?.id, 'outer');
      });

      assert.strictEqual(als.getStore(), undefined);
    });

    it('enterWith() should set persistent store', () => {
      const als = new AsyncLocalStorage<{ id: string }>();
      als.enterWith({ id: 'persist' });
      assert.strictEqual(als.getStore()?.id, 'persist');
    });

    it('exit() should clear store inside callback and restore after', () => {
      const als = new AsyncLocalStorage<{ id: string }>();
      als.enterWith({ id: 'persist' });

      const inside = als.exit(() => als.getStore());
      assert.strictEqual(inside, undefined);
      assert.strictEqual(als.getStore()?.id, 'persist');
    });

    it('disable() should be callable', () => {
      const als = new AsyncLocalStorage<{ id: string }>();
      assert.doesNotThrow(() => als.disable());
    });
  });

  describe('createHook()', () => {
    it('should return hook with enable/disable', () => {
      const hook = createHook({ init() {}, before() {}, after() {}, destroy() {} });
      expect(typeof hook.enable).toBe('function');
      expect(typeof hook.disable).toBe('function');
    });

    it('enable()/disable() should be chainable', () => {
      const hook = createHook({});
      expect(hook.enable()).toBe(hook);
      expect(hook.disable()).toBe(hook);
    });
  });

  describe('id/resource helpers', () => {
    it('executionAsyncId and triggerAsyncId should return numbers', () => {
      expect(typeof executionAsyncId()).toBe('number');
      expect(typeof triggerAsyncId()).toBe('number');
      assert.strictEqual(executionAsyncId(), 0);
      assert.strictEqual(triggerAsyncId(), 0);
    });

    it('executionAsyncResource should return object', () => {
      const resource = executionAsyncResource();
      expect(typeof resource).toBe('object');
      expect(resource).not.toBeNull();
    });
  });

  describe('default export', () => {
    it('should expose key APIs', () => {
      expect(asyncHooks.AsyncResource).toBe(AsyncResource);
      expect(asyncHooks.AsyncLocalStorage).toBe(AsyncLocalStorage);
      expect(asyncHooks.createHook).toBe(createHook);
      expect(asyncHooks.executionAsyncId).toBe(executionAsyncId);
    });
  });

  describe('known limitations (documented)', () => {
    it.skip('should propagate AsyncLocalStorage context across timers/promises like Node', async () => {
      const als = new AsyncLocalStorage<{ id: string }>();
      let observed: string | undefined;
      await als.run({ id: 'ctx' }, async () => {
        await Promise.resolve();
        observed = als.getStore()?.id;
      });
      expect(observed).toBe('ctx');
    });

    it.skip('createHook callbacks should fire around async lifecycle events', () => {
      let initCalled = false;
      const hook = createHook({ init() { initCalled = true; } }).enable();
      Promise.resolve().then(() => undefined);
      hook.disable();
      expect(initCalled).toBe(true);
    });
  });
});
