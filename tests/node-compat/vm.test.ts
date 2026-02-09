/**
 * Node.js vm module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-vm-*.js
 *
 * Note: Our vm shim is intentionally minimal for browser compatibility.
 * Some Node.js behaviors are not implemented and are tracked as skipped tests.
 */

import { describe, it, expect } from 'vitest';
import * as vm from '../../src/shims/vm';
import { assert } from './common';

describe('vm module (Node.js compat)', () => {
  describe('exports', () => {
    it('should export Script constructor', () => {
      expect(typeof vm.Script).toBe('function');
    });

    it('should export top-level execution helpers', () => {
      expect(typeof vm.runInThisContext).toBe('function');
      expect(typeof vm.runInNewContext).toBe('function');
      expect(typeof vm.runInContext).toBe('function');
    });

    it('should export context helpers', () => {
      expect(typeof vm.createContext).toBe('function');
      expect(typeof vm.isContext).toBe('function');
    });

    it('should export compileFunction and module classes', () => {
      expect(typeof vm.compileFunction).toBe('function');
      expect(typeof vm.Module).toBe('function');
      expect(typeof vm.SourceTextModule).toBe('function');
      expect(typeof vm.SyntheticModule).toBe('function');
    });
  });

  describe('Script', () => {
    it('should execute code via runInThisContext()', () => {
      const script = new vm.Script('1 + 2 + 3');
      assert.strictEqual(script.runInThisContext(), 6);
    });

    it('should execute code via runInNewContext()', () => {
      const script = new vm.Script('a + b');
      assert.strictEqual(script.runInNewContext({ a: 2, b: 5 }), 7);
    });

    it('should execute code via runInContext()', () => {
      const script = new vm.Script('x * y');
      const context = vm.createContext({ x: 3, y: 4 });
      assert.strictEqual(script.runInContext(context), 12);
    });

    it('should throw syntax errors from compiled code', () => {
      const script = new vm.Script('const =');
      assert.throws(() => script.runInThisContext(), SyntaxError);
    });

    it('should propagate runtime errors', () => {
      const script = new vm.Script('throw new Error("boom")');
      assert.throws(() => script.runInThisContext(), /boom/);
    });

    it('createCachedData() should return a Buffer', () => {
      const script = new vm.Script('1 + 1');
      const cached = script.createCachedData();
      expect(Buffer.isBuffer(cached)).toBe(true);
    });
  });

  describe('top-level helpers', () => {
    it('runInThisContext should evaluate expressions', () => {
      assert.strictEqual(vm.runInThisContext('40 + 2'), 42);
    });

    it('runInNewContext should use provided context values', () => {
      assert.strictEqual(vm.runInNewContext('foo + bar', { foo: 'a', bar: 'b' }), 'ab');
    });

    it('runInContext should evaluate with provided context', () => {
      const context = vm.createContext({ n: 10 });
      assert.strictEqual(vm.runInContext('n + 1', context), 11);
    });

    it('runInNewContext should work without context object', () => {
      assert.strictEqual(vm.runInNewContext('21 * 2'), 42);
    });
  });

  describe('context helpers', () => {
    it('createContext should return provided object', () => {
      const sandbox = { a: 1 };
      const ctx = vm.createContext(sandbox);
      expect(ctx).toBe(sandbox);
    });

    it('createContext should return empty object when omitted', () => {
      const ctx = vm.createContext();
      expect(typeof ctx).toBe('object');
      expect(ctx).not.toBeNull();
      expect(Object.keys(ctx)).toEqual([]);
    });

    it('isContext should return true for context object', () => {
      const ctx = vm.createContext({ value: 1 });
      assert.strictEqual(vm.isContext(ctx), true);
    });
  });

  describe('compileFunction', () => {
    it('should compile function with params', () => {
      const fn = vm.compileFunction('return a + b', ['a', 'b']);
      assert.strictEqual(fn(20, 22), 42);
    });

    it('should compile function without params list', () => {
      const fn = vm.compileFunction('return 7 * 6');
      assert.strictEqual(fn(), 42);
    });

    it('should throw on invalid function body', () => {
      assert.throws(() => vm.compileFunction('return )'), SyntaxError);
    });
  });

  describe('Module classes', () => {
    it('Module.link should resolve', async () => {
      const mod = new vm.Module('export const a = 1');
      await expect(mod.link(() => Promise.resolve())).resolves.toBeUndefined();
    });

    it('Module.evaluate should resolve', async () => {
      const mod = new vm.Module('export const a = 1');
      await expect(mod.evaluate()).resolves.toBeUndefined();
    });

    it('Module should expose default placeholder metadata', () => {
      const mod = new vm.Module('export const a = 1');
      assert.strictEqual(mod.status, 'unlinked');
      assert.strictEqual(mod.identifier, '');
      expect(typeof mod.context).toBe('object');
      expect(typeof mod.namespace).toBe('object');
    });

    it('SourceTextModule should be an instance of Module', () => {
      const mod = new vm.SourceTextModule('export const x = 1');
      expect(mod).toBeInstanceOf(vm.Module);
    });

    it('SyntheticModule.setExport should not throw', () => {
      const mod = new vm.SyntheticModule('', {});
      assert.doesNotThrow(() => mod.setExport('x', 1));
    });
  });

  describe('known limitations (documented)', () => {
    it.skip('should isolate sandbox from outer globals like Node vm contexts', () => {
      const context = vm.createContext({});
      vm.runInContext('globalThis.__vm_leak_test__ = 1', context);
      expect((globalThis as Record<string, unknown>).__vm_leak_test__).toBeUndefined();
    });

    it.skip('should support timeout option for script execution', () => {
      const script = new vm.Script('while (true) {}');
      expect(() => script.runInThisContext({ timeout: 10 })).toThrow();
    });

    it.skip('should persist assignment to primitive bindings back into context', () => {
      const context = vm.createContext({ x: 1 });
      vm.runInContext('x = 2', context);
      expect((context as { x: number }).x).toBe(2);
    });
  });
});
