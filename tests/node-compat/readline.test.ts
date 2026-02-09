/**
 * Node.js readline module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-readline-*.js
 *
 * Note: Our readline shim is a browser-oriented implementation with
 * limited terminal and input capabilities.
 */

import { describe, it, expect, vi } from 'vitest';
import readline, {
  Interface,
  createInterface,
  clearLine,
  clearScreenDown,
  cursorTo,
  moveCursor,
  emitKeypressEvents,
  promises,
} from '../../src/shims/readline';
import { assert } from './common';

describe('readline module (Node.js compat)', () => {
  describe('exports', () => {
    it('should export Interface constructor', () => {
      expect(typeof Interface).toBe('function');
    });

    it('should export createInterface()', () => {
      expect(typeof createInterface).toBe('function');
    });

    it('should export cursor control helpers', () => {
      expect(typeof clearLine).toBe('function');
      expect(typeof clearScreenDown).toBe('function');
      expect(typeof cursorTo).toBe('function');
      expect(typeof moveCursor).toBe('function');
    });

    it('should export emitKeypressEvents()', () => {
      expect(typeof emitKeypressEvents).toBe('function');
    });

    it('should export promises API', () => {
      expect(typeof promises).toBe('object');
      expect(typeof promises.createInterface).toBe('function');
    });
  });

  describe('Interface', () => {
    it('should create instance via constructor', () => {
      const rl = new Interface();
      expect(rl).toBeInstanceOf(Interface);
    });

    it('should create instance via createInterface()', () => {
      const rl = createInterface();
      expect(rl).toBeInstanceOf(Interface);
    });

    it('should be an EventEmitter-compatible object', () => {
      const rl = createInterface();
      expect(typeof rl.on).toBe('function');
      expect(typeof rl.emit).toBe('function');
    });

    it('should initialize prompt from options', () => {
      const rl = createInterface({ prompt: '> ' });
      assert.strictEqual(rl.getPrompt(), '> ');
    });

    it('setPrompt/getPrompt should roundtrip', () => {
      const rl = createInterface();
      rl.setPrompt('node> ');
      assert.strictEqual(rl.getPrompt(), 'node> ');
    });

    it('prompt() should not throw', () => {
      const rl = createInterface();
      assert.doesNotThrow(() => rl.prompt());
      assert.doesNotThrow(() => rl.prompt(true));
    });

    it('pause() should return this', () => {
      const rl = createInterface();
      expect(rl.pause()).toBe(rl);
    });

    it('resume() should return this', () => {
      const rl = createInterface();
      expect(rl.resume()).toBe(rl);
    });

    it('question() should invoke callback with string answer', async () => {
      const rl = createInterface();
      const answer = await new Promise<string>((resolve) => {
        rl.question('name?', resolve);
      });
      assert.strictEqual(answer, '');
    });

    it('close() should emit close event', () => {
      const rl = createInterface();
      const onClose = vi.fn();
      rl.on('close', onClose);
      rl.close();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('write() should not throw with key info', () => {
      const rl = createInterface();
      assert.doesNotThrow(() => rl.write('abc', { ctrl: true, name: 'c' }));
    });

    it('line and cursor should have default values', () => {
      const rl = createInterface();
      assert.strictEqual(rl.line, '');
      assert.strictEqual(rl.cursor, 0);
    });

    it('getCursorPos() should return numeric row/col', () => {
      const rl = createInterface();
      const pos = rl.getCursorPos();
      expect(typeof pos.rows).toBe('number');
      expect(typeof pos.cols).toBe('number');
      assert.strictEqual(pos.rows, 0);
      assert.strictEqual(pos.cols, 0);
    });
  });

  describe('cursor helpers', () => {
    it('clearLine() should return true', () => {
      assert.strictEqual(clearLine({}, 0), true);
    });

    it('clearLine() should call callback', () => {
      const cb = vi.fn();
      clearLine({}, 0, cb);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('clearScreenDown() should return true', () => {
      assert.strictEqual(clearScreenDown({}), true);
    });

    it('clearScreenDown() should call callback', () => {
      const cb = vi.fn();
      clearScreenDown({}, cb);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('cursorTo() should return true', () => {
      assert.strictEqual(cursorTo({}, 1, 2), true);
    });

    it('cursorTo() should call callback', () => {
      const cb = vi.fn();
      cursorTo({}, 1, 2, cb);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('moveCursor() should return true', () => {
      assert.strictEqual(moveCursor({}, -1, 1), true);
    });

    it('moveCursor() should call callback', () => {
      const cb = vi.fn();
      moveCursor({}, 1, -1, cb);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('emitKeypressEvents()', () => {
    it('should be callable without throwing', () => {
      const rl = createInterface();
      assert.doesNotThrow(() => emitKeypressEvents({}, rl));
      assert.doesNotThrow(() => emitKeypressEvents({}));
    });
  });

  describe('promises API', () => {
    it('createInterface() should return question() and close()', () => {
      const rl = promises.createInterface();
      expect(typeof rl.question).toBe('function');
      expect(typeof rl.close).toBe('function');
    });

    it('question() should resolve to string answer', async () => {
      const rl = promises.createInterface();
      const answer = await rl.question('value?');
      assert.strictEqual(answer, '');
    });

    it('should support async iterator protocol', () => {
      const rl = promises.createInterface();
      expect(Symbol.asyncIterator in rl).toBe(true);
      expect(typeof rl[Symbol.asyncIterator]).toBe('function');
    });

    it('async iterator should complete with no lines', async () => {
      const rl = promises.createInterface();
      const values: string[] = [];
      for await (const line of rl) {
        values.push(line);
      }
      expect(values).toEqual([]);
    });

    it('close() should be callable', () => {
      const rl = promises.createInterface();
      assert.doesNotThrow(() => rl.close());
    });
  });

  describe('default export', () => {
    it('should expose key APIs', () => {
      expect(readline.Interface).toBe(Interface);
      expect(readline.createInterface).toBe(createInterface);
      expect(readline.clearLine).toBe(clearLine);
      expect(readline.promises).toBe(promises);
    });
  });

  describe('known limitations (documented)', () => {
    it.skip('should consume real terminal input streams', () => {
      const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
      rl.question('name?', (answer) => {
        expect(answer.length).toBeGreaterThan(0);
      });
    });

    it.skip('should emit line events from streaming input', () => {
      const rl = createInterface();
      const onLine = vi.fn();
      rl.on('line', onLine);
      expect(onLine).toHaveBeenCalled();
    });
  });
});
