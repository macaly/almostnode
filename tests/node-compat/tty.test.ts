/**
 * Node.js tty module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-tty-*.js
 *
 * Note: Our tty shim provides terminal utilities for browser environment.
 * isTTY is always false since browsers are not terminals.
 */

import { describe, it, expect, vi } from 'vitest';
import tty, { ReadStream, WriteStream, isatty } from '../../src/shims/tty';
import { assert } from './common';

describe('tty module (Node.js compat)', () => {
  describe('isatty()', () => {
    it('should be a function', () => {
      expect(typeof isatty).toBe('function');
    });

    it('should return false for all file descriptors in browser', () => {
      assert.strictEqual(isatty(0), false); // stdin
      assert.strictEqual(isatty(1), false); // stdout
      assert.strictEqual(isatty(2), false); // stderr
    });

    it('should return false for arbitrary file descriptors', () => {
      assert.strictEqual(isatty(3), false);
      assert.strictEqual(isatty(100), false);
    });

    it('should return boolean', () => {
      expect(typeof isatty(0)).toBe('boolean');
    });
  });

  describe('ReadStream', () => {
    it('should be a class', () => {
      expect(typeof ReadStream).toBe('function');
    });

    it('should create instance', () => {
      const stream = new ReadStream();
      expect(stream).toBeInstanceOf(ReadStream);
    });

    it('should have isTTY property', () => {
      const stream = new ReadStream();
      expect(typeof stream.isTTY).toBe('boolean');
    });

    it('isTTY should be false by default', () => {
      const stream = new ReadStream();
      assert.strictEqual(stream.isTTY, false);
    });

    it('should have isRaw property', () => {
      const stream = new ReadStream();
      expect(typeof stream.isRaw).toBe('boolean');
    });

    it('isRaw should be false by default', () => {
      const stream = new ReadStream();
      assert.strictEqual(stream.isRaw, false);
    });

    it('should have setRawMode() method', () => {
      const stream = new ReadStream();
      expect(typeof stream.setRawMode).toBe('function');
    });

    it('setRawMode() should set isRaw', () => {
      const stream = new ReadStream();
      stream.setRawMode(true);
      assert.strictEqual(stream.isRaw, true);
      stream.setRawMode(false);
      assert.strictEqual(stream.isRaw, false);
    });

    it('setRawMode() should return this for chaining', () => {
      const stream = new ReadStream();
      const result = stream.setRawMode(true);
      expect(result).toBe(stream);
    });
  });

  describe('WriteStream', () => {
    it('should be a class', () => {
      expect(typeof WriteStream).toBe('function');
    });

    it('should create instance', () => {
      const stream = new WriteStream();
      expect(stream).toBeInstanceOf(WriteStream);
    });

    it('should have isTTY property', () => {
      const stream = new WriteStream();
      expect(typeof stream.isTTY).toBe('boolean');
    });

    it('isTTY should be false by default', () => {
      const stream = new WriteStream();
      assert.strictEqual(stream.isTTY, false);
    });

    it('should have columns property', () => {
      const stream = new WriteStream();
      expect(typeof stream.columns).toBe('number');
      expect(stream.columns).toBeGreaterThan(0);
    });

    it('should have rows property', () => {
      const stream = new WriteStream();
      expect(typeof stream.rows).toBe('number');
      expect(stream.rows).toBeGreaterThan(0);
    });

    it('should have clearLine() method', () => {
      const stream = new WriteStream();
      expect(typeof stream.clearLine).toBe('function');
    });

    it('clearLine() should return boolean', () => {
      const stream = new WriteStream();
      const result = stream.clearLine(0);
      expect(typeof result).toBe('boolean');
    });

    it('clearLine() should call callback', () => {
      const stream = new WriteStream();
      const callback = vi.fn();
      stream.clearLine(0, callback);
      expect(callback).toHaveBeenCalled();
    });

    it('should have clearScreenDown() method', () => {
      const stream = new WriteStream();
      expect(typeof stream.clearScreenDown).toBe('function');
    });

    it('clearScreenDown() should return boolean', () => {
      const stream = new WriteStream();
      const result = stream.clearScreenDown();
      expect(typeof result).toBe('boolean');
    });

    it('clearScreenDown() should call callback', () => {
      const stream = new WriteStream();
      const callback = vi.fn();
      stream.clearScreenDown(callback);
      expect(callback).toHaveBeenCalled();
    });

    it('should have cursorTo() method', () => {
      const stream = new WriteStream();
      expect(typeof stream.cursorTo).toBe('function');
    });

    it('cursorTo() should return boolean', () => {
      const stream = new WriteStream();
      const result = stream.cursorTo(0, 0);
      expect(typeof result).toBe('boolean');
    });

    it('cursorTo() should call callback', () => {
      const stream = new WriteStream();
      const callback = vi.fn();
      stream.cursorTo(10, 5, callback);
      expect(callback).toHaveBeenCalled();
    });

    it('should have moveCursor() method', () => {
      const stream = new WriteStream();
      expect(typeof stream.moveCursor).toBe('function');
    });

    it('moveCursor() should return boolean', () => {
      const stream = new WriteStream();
      const result = stream.moveCursor(1, 1);
      expect(typeof result).toBe('boolean');
    });

    it('moveCursor() should call callback', () => {
      const stream = new WriteStream();
      const callback = vi.fn();
      stream.moveCursor(-1, 0, callback);
      expect(callback).toHaveBeenCalled();
    });

    it('should have getColorDepth() method', () => {
      const stream = new WriteStream();
      expect(typeof stream.getColorDepth).toBe('function');
    });

    it('getColorDepth() should return number', () => {
      const stream = new WriteStream();
      const depth = stream.getColorDepth();
      expect(typeof depth).toBe('number');
    });

    it('should have hasColors() method', () => {
      const stream = new WriteStream();
      expect(typeof stream.hasColors).toBe('function');
    });

    it('hasColors() should return boolean', () => {
      const stream = new WriteStream();
      const result = stream.hasColors();
      expect(typeof result).toBe('boolean');
    });

    it('should have getWindowSize() method', () => {
      const stream = new WriteStream();
      expect(typeof stream.getWindowSize).toBe('function');
    });

    it('getWindowSize() should return [columns, rows]', () => {
      const stream = new WriteStream();
      const size = stream.getWindowSize();
      expect(Array.isArray(size)).toBe(true);
      expect(size.length).toBe(2);
      assert.strictEqual(size[0], stream.columns);
      assert.strictEqual(size[1], stream.rows);
    });
  });

  describe('default export', () => {
    it('should export ReadStream', () => {
      expect(tty.ReadStream).toBe(ReadStream);
    });

    it('should export WriteStream', () => {
      expect(tty.WriteStream).toBe(WriteStream);
    });

    it('should export isatty', () => {
      expect(tty.isatty).toBe(isatty);
    });
  });
});
