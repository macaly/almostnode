/**
 * Node.js events module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-events-*.js
 *
 * These tests verify that our EventEmitter shim behaves consistently with Node.js
 * for common event operations used by target frameworks.
 */

import { describe, it, expect, vi } from 'vitest';
import events, { EventEmitter } from '../../src/shims/events';
import { assert } from './common';

describe('events module (Node.js compat)', () => {
  describe('EventEmitter class', () => {
    describe('construction', () => {
      it('should create an instance', () => {
        const emitter = new EventEmitter();
        expect(emitter).toBeInstanceOf(EventEmitter);
      });

      it('should have no listeners by default', () => {
        const emitter = new EventEmitter();
        assert.strictEqual(emitter.listenerCount('test'), 0);
        assert.deepStrictEqual(emitter.eventNames(), []);
      });
    });

    describe('on() and emit()', () => {
      it('should add listener and emit event', () => {
        const emitter = new EventEmitter();
        let called = false;

        emitter.on('test', () => {
          called = true;
        });

        emitter.emit('test');
        assert.strictEqual(called, true);
      });

      it('should pass arguments to listener', () => {
        const emitter = new EventEmitter();
        let receivedArgs: unknown[] = [];

        emitter.on('test', (...args) => {
          receivedArgs = args;
        });

        emitter.emit('test', 'arg1', 'arg2', 123);
        assert.deepStrictEqual(receivedArgs, ['arg1', 'arg2', 123]);
      });

      it('should call multiple listeners in order', () => {
        const emitter = new EventEmitter();
        const order: number[] = [];

        emitter.on('test', () => order.push(1));
        emitter.on('test', () => order.push(2));
        emitter.on('test', () => order.push(3));

        emitter.emit('test');
        assert.deepStrictEqual(order, [1, 2, 3]);
      });

      it('should return emitter for chaining', () => {
        const emitter = new EventEmitter();
        const result = emitter.on('test', () => {});
        assert.strictEqual(result, emitter);
      });

      it('should return true when listeners exist', () => {
        const emitter = new EventEmitter();
        emitter.on('test', () => {});

        assert.strictEqual(emitter.emit('test'), true);
      });

      it('should return false when no listeners exist', () => {
        const emitter = new EventEmitter();
        assert.strictEqual(emitter.emit('test'), false);
      });
    });

    describe('addListener()', () => {
      it('should be alias for on()', () => {
        const emitter = new EventEmitter();
        let called = false;

        emitter.addListener('test', () => {
          called = true;
        });

        emitter.emit('test');
        assert.strictEqual(called, true);
      });
    });

    describe('once()', () => {
      it('should call listener only once', () => {
        const emitter = new EventEmitter();
        let callCount = 0;

        emitter.once('test', () => {
          callCount++;
        });

        emitter.emit('test');
        emitter.emit('test');
        emitter.emit('test');

        assert.strictEqual(callCount, 1);
      });

      it('should pass arguments to listener', () => {
        const emitter = new EventEmitter();
        let receivedArgs: unknown[] = [];

        emitter.once('test', (...args) => {
          receivedArgs = args;
        });

        emitter.emit('test', 'arg1', 'arg2');
        assert.deepStrictEqual(receivedArgs, ['arg1', 'arg2']);
      });

      it('should return emitter for chaining', () => {
        const emitter = new EventEmitter();
        const result = emitter.once('test', () => {});
        assert.strictEqual(result, emitter);
      });
    });

    describe('off() and removeListener()', () => {
      it('should remove specific listener', () => {
        const emitter = new EventEmitter();
        let called = false;

        const listener = () => {
          called = true;
        };

        emitter.on('test', listener);
        emitter.removeListener('test', listener);
        emitter.emit('test');

        assert.strictEqual(called, false);
      });

      it('should not affect other listeners', () => {
        const emitter = new EventEmitter();
        let called1 = false;
        let called2 = false;

        const listener1 = () => {
          called1 = true;
        };
        const listener2 = () => {
          called2 = true;
        };

        emitter.on('test', listener1);
        emitter.on('test', listener2);
        emitter.removeListener('test', listener1);
        emitter.emit('test');

        assert.strictEqual(called1, false);
        assert.strictEqual(called2, true);
      });

      it('off() should be alias for removeListener()', () => {
        const emitter = new EventEmitter();
        let called = false;

        const listener = () => {
          called = true;
        };

        emitter.on('test', listener);
        emitter.off('test', listener);
        emitter.emit('test');

        assert.strictEqual(called, false);
      });

      it('should return emitter for chaining', () => {
        const emitter = new EventEmitter();
        const listener = () => {};
        emitter.on('test', listener);
        const result = emitter.removeListener('test', listener);
        assert.strictEqual(result, emitter);
      });

      it('should handle removing non-existent listener', () => {
        const emitter = new EventEmitter();
        // Should not throw
        emitter.removeListener('test', () => {});
      });
    });

    describe('removeAllListeners()', () => {
      it('should remove all listeners for specific event', () => {
        const emitter = new EventEmitter();
        let count = 0;

        emitter.on('test', () => count++);
        emitter.on('test', () => count++);
        emitter.on('other', () => count++);

        emitter.removeAllListeners('test');
        emitter.emit('test');
        emitter.emit('other');

        assert.strictEqual(count, 1);
      });

      it('should remove all listeners when no event specified', () => {
        const emitter = new EventEmitter();
        let count = 0;

        emitter.on('test1', () => count++);
        emitter.on('test2', () => count++);

        emitter.removeAllListeners();
        emitter.emit('test1');
        emitter.emit('test2');

        assert.strictEqual(count, 0);
      });

      it('should return emitter for chaining', () => {
        const emitter = new EventEmitter();
        const result = emitter.removeAllListeners();
        assert.strictEqual(result, emitter);
      });
    });

    describe('listeners()', () => {
      it('should return array of listeners', () => {
        const emitter = new EventEmitter();
        const listener1 = () => {};
        const listener2 = () => {};

        emitter.on('test', listener1);
        emitter.on('test', listener2);

        const listeners = emitter.listeners('test');
        assert.strictEqual(listeners.length, 2);
        assert.strictEqual(listeners[0], listener1);
        assert.strictEqual(listeners[1], listener2);
      });

      it('should return copy of listeners array', () => {
        const emitter = new EventEmitter();
        const listener = () => {};

        emitter.on('test', listener);

        const listeners = emitter.listeners('test');
        listeners.push(() => {});

        assert.strictEqual(emitter.listenerCount('test'), 1);
      });

      it('should return empty array for no listeners', () => {
        const emitter = new EventEmitter();
        const listeners = emitter.listeners('test');
        assert.deepStrictEqual(listeners, []);
      });
    });

    describe('rawListeners()', () => {
      it('should return array of listeners', () => {
        const emitter = new EventEmitter();
        const listener = () => {};

        emitter.on('test', listener);

        const listeners = emitter.rawListeners('test');
        assert.strictEqual(listeners.length, 1);
      });
    });

    describe('listenerCount()', () => {
      it('should return number of listeners', () => {
        const emitter = new EventEmitter();

        assert.strictEqual(emitter.listenerCount('test'), 0);

        emitter.on('test', () => {});
        assert.strictEqual(emitter.listenerCount('test'), 1);

        emitter.on('test', () => {});
        assert.strictEqual(emitter.listenerCount('test'), 2);
      });

      it('should not count listeners for other events', () => {
        const emitter = new EventEmitter();

        emitter.on('test1', () => {});
        emitter.on('test2', () => {});
        emitter.on('test2', () => {});

        assert.strictEqual(emitter.listenerCount('test1'), 1);
        assert.strictEqual(emitter.listenerCount('test2'), 2);
      });
    });

    describe('eventNames()', () => {
      it('should return array of event names', () => {
        const emitter = new EventEmitter();

        emitter.on('foo', () => {});
        emitter.on('bar', () => {});
        emitter.on('baz', () => {});

        const names = emitter.eventNames();
        expect(names).toContain('foo');
        expect(names).toContain('bar');
        expect(names).toContain('baz');
        assert.strictEqual(names.length, 3);
      });

      it('should return empty array when no listeners', () => {
        const emitter = new EventEmitter();
        assert.deepStrictEqual(emitter.eventNames(), []);
      });
    });

    describe('setMaxListeners() and getMaxListeners()', () => {
      it('should set and get max listeners', () => {
        const emitter = new EventEmitter();

        assert.strictEqual(emitter.getMaxListeners(), 10); // Default

        emitter.setMaxListeners(20);
        assert.strictEqual(emitter.getMaxListeners(), 20);
      });

      it('should return emitter for chaining', () => {
        const emitter = new EventEmitter();
        const result = emitter.setMaxListeners(5);
        assert.strictEqual(result, emitter);
      });
    });

    describe('prependListener()', () => {
      it('should add listener to beginning', () => {
        const emitter = new EventEmitter();
        const order: number[] = [];

        emitter.on('test', () => order.push(1));
        emitter.prependListener('test', () => order.push(0));
        emitter.on('test', () => order.push(2));

        emitter.emit('test');
        assert.deepStrictEqual(order, [0, 1, 2]);
      });

      it('should return emitter for chaining', () => {
        const emitter = new EventEmitter();
        const result = emitter.prependListener('test', () => {});
        assert.strictEqual(result, emitter);
      });
    });

    describe('prependOnceListener()', () => {
      it('should add once listener to beginning', () => {
        const emitter = new EventEmitter();
        const order: number[] = [];

        emitter.on('test', () => order.push(1));
        emitter.prependOnceListener('test', () => order.push(0));

        emitter.emit('test');
        emitter.emit('test');

        assert.deepStrictEqual(order, [0, 1, 1]);
      });
    });

    describe('error event', () => {
      it('should throw if error event has no listeners', () => {
        const emitter = new EventEmitter();
        const error = new Error('test error');

        assert.throws(() => {
          emitter.emit('error', error);
        }, Error);
      });

      it('should throw generic error for non-Error', () => {
        const emitter = new EventEmitter();

        assert.throws(() => {
          emitter.emit('error', 'not an error');
        });
      });

      it('should call error listener instead of throwing', () => {
        const emitter = new EventEmitter();
        let receivedError: Error | null = null;

        emitter.on('error', (err) => {
          receivedError = err as Error;
        });

        const error = new Error('test error');
        emitter.emit('error', error);

        assert.strictEqual(receivedError, error);
      });
    });
  });

  describe('static methods', () => {
    describe('EventEmitter.listenerCount()', () => {
      it('should return listener count', () => {
        const emitter = new EventEmitter();
        emitter.on('test', () => {});
        emitter.on('test', () => {});

        assert.strictEqual(EventEmitter.listenerCount(emitter, 'test'), 2);
      });
    });
  });

  describe('module exports', () => {
    describe('default export', () => {
      it('should be EventEmitter constructor', () => {
        expect(events).toBe(EventEmitter);
      });

      it('should have EventEmitter property', () => {
        expect((events as unknown as Record<string, unknown>).EventEmitter).toBe(EventEmitter);
      });
    });

    describe('events.once()', () => {
      it('should resolve when event is emitted', async () => {
        const emitter = new EventEmitter();

        const promise = events.once(emitter, 'test');

        // Emit after a microtask
        queueMicrotask(() => {
          emitter.emit('test', 'arg1', 'arg2');
        });

        const result = await promise;
        assert.deepStrictEqual(result, ['arg1', 'arg2']);
      });

      it('should reject on error event', async () => {
        const emitter = new EventEmitter();
        const error = new Error('test error');

        const promise = events.once(emitter, 'test');

        queueMicrotask(() => {
          emitter.emit('error', error);
        });

        await expect(promise).rejects.toBe(error);
      });
    });

    describe('events.on()', () => {
      it('should return async iterable', async () => {
        const emitter = new EventEmitter();
        const iterable = events.on(emitter, 'test');

        expect(typeof iterable[Symbol.asyncIterator]).toBe('function');
      });

      it('should yield events', async () => {
        const emitter = new EventEmitter();
        const iterable = events.on(emitter, 'test');

        // Emit after getting first iterator
        queueMicrotask(() => {
          emitter.emit('test', 'value1');
        });

        const iterator = iterable[Symbol.asyncIterator]();
        const result = await iterator.next();

        assert.deepStrictEqual(result.value, ['value1']);
        assert.strictEqual(result.done, false);
      });
    });

    describe('events.getEventListeners()', () => {
      it('should return array of listeners', () => {
        const emitter = new EventEmitter();
        const listener = () => {};

        emitter.on('test', listener);

        const listeners = events.getEventListeners(emitter, 'test');
        assert.strictEqual(listeners.length, 1);
        assert.strictEqual(listeners[0], listener);
      });
    });

    describe('events.listenerCount()', () => {
      it('should return listener count', () => {
        const emitter = new EventEmitter();
        emitter.on('test', () => {});
        emitter.on('test', () => {});

        assert.strictEqual(events.listenerCount(emitter, 'test'), 2);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle removing listener during emit', () => {
      const emitter = new EventEmitter();
      const order: number[] = [];

      const listener1 = () => {
        order.push(1);
        emitter.removeListener('test', listener2);
      };
      const listener2 = () => {
        order.push(2);
      };

      emitter.on('test', listener1);
      emitter.on('test', listener2);

      emitter.emit('test');

      // Both should still have been called because we iterate a copy
      assert.deepStrictEqual(order, [1, 2]);

      // But now listener2 should be removed
      emitter.emit('test');
      assert.deepStrictEqual(order, [1, 2, 1]);
    });

    it('should handle adding listener during emit', () => {
      const emitter = new EventEmitter();
      const order: number[] = [];

      emitter.on('test', () => {
        order.push(1);
        emitter.on('test', () => order.push(2));
      });

      emitter.emit('test');
      // New listener should not be called in same emit
      assert.deepStrictEqual(order, [1]);

      emitter.emit('test');
      // Now both should be called
      assert.deepStrictEqual(order, [1, 1, 2]);
    });

    it('should handle errors in listeners', () => {
      const emitter = new EventEmitter();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      emitter.on('test', () => {
        throw new Error('listener error');
      });

      // Should not throw, but log error
      emitter.emit('test');

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('should handle Symbol event names', () => {
      const emitter = new EventEmitter();
      const sym = Symbol('test');
      let called = false;

      emitter.on(sym as unknown as string, () => {
        called = true;
      });

      emitter.emit(sym as unknown as string);
      assert.strictEqual(called, true);
    });
  });

  describe('inheritance', () => {
    it('should allow extending EventEmitter', () => {
      class MyEmitter extends EventEmitter {
        doSomething(): void {
          this.emit('something', 'done');
        }
      }

      const emitter = new MyEmitter();
      let result: string | null = null;

      emitter.on('something', (value) => {
        result = value as string;
      });

      emitter.doSomething();
      assert.strictEqual(result, 'done');
    });
  });
});
