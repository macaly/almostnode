/**
 * Node.js v8 module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-v8-*.js
 */

import { describe, it, expect } from 'vitest';
import v8, {
  getHeapStatistics,
  getHeapSpaceStatistics,
  getHeapCodeStatistics,
  getHeapSnapshot,
  writeHeapSnapshot,
  setFlagsFromString,
  takeCoverage,
  stopCoverage,
  serialize,
  deserialize,
  Serializer,
  Deserializer,
  DefaultSerializer,
  DefaultDeserializer,
  promiseHooks,
} from '../../src/shims/v8';
import { assert } from './common';

describe('v8 module (Node.js compat)', () => {
  describe('exports', () => {
    it('should export heap inspection helpers', () => {
      expect(typeof getHeapStatistics).toBe('function');
      expect(typeof getHeapSpaceStatistics).toBe('function');
      expect(typeof getHeapCodeStatistics).toBe('function');
      expect(typeof getHeapSnapshot).toBe('function');
      expect(typeof writeHeapSnapshot).toBe('function');
    });

    it('should export coverage and flag helpers', () => {
      expect(typeof setFlagsFromString).toBe('function');
      expect(typeof takeCoverage).toBe('function');
      expect(typeof stopCoverage).toBe('function');
    });

    it('should export serialization APIs', () => {
      expect(typeof serialize).toBe('function');
      expect(typeof deserialize).toBe('function');
      expect(typeof Serializer).toBe('function');
      expect(typeof Deserializer).toBe('function');
      expect(typeof DefaultSerializer).toBe('function');
      expect(typeof DefaultDeserializer).toBe('function');
    });

    it('should export promiseHooks', () => {
      expect(typeof promiseHooks).toBe('function');
    });
  });

  describe('heap helpers', () => {
    it('getHeapStatistics should return expected numeric fields', () => {
      const stats = getHeapStatistics();
      expect(typeof stats.total_heap_size).toBe('number');
      expect(typeof stats.used_heap_size).toBe('number');
      expect(typeof stats.heap_size_limit).toBe('number');
      expect(typeof stats.number_of_native_contexts).toBe('number');
      expect(typeof stats.number_of_detached_contexts).toBe('number');
    });

    it('getHeapSpaceStatistics should return array', () => {
      const stats = getHeapSpaceStatistics();
      expect(Array.isArray(stats)).toBe(true);
    });

    it('getHeapCodeStatistics should return expected numeric fields', () => {
      const stats = getHeapCodeStatistics();
      expect(typeof stats.code_and_metadata_size).toBe('number');
      expect(typeof stats.bytecode_and_metadata_size).toBe('number');
      expect(typeof stats.external_script_source_size).toBe('number');
    });

    it('snapshot helpers should return placeholder values', () => {
      assert.strictEqual(getHeapSnapshot(), null);
      assert.strictEqual(writeHeapSnapshot(), '');
    });
  });

  describe('coverage and flags', () => {
    it('setFlagsFromString should be callable', () => {
      assert.doesNotThrow(() => setFlagsFromString('--trace_gc'));
    });

    it('coverage helpers should be callable', () => {
      assert.doesNotThrow(() => takeCoverage());
      assert.doesNotThrow(() => stopCoverage());
    });
  });

  describe('serialization', () => {
    it('serialize should return Buffer', () => {
      const buf = serialize({ a: 1, b: 'x' });
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.length).toBeGreaterThan(0);
    });

    it('deserialize should reconstruct serialized JSON-compatible values', () => {
      const value = { a: 1, b: 'x', c: [1, 2, 3], d: { nested: true } };
      const roundtrip = deserialize(serialize(value));
      expect(roundtrip).toEqual(value);
    });

    it('serialize should throw for circular structures', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      assert.throws(() => serialize(circular));
    });
  });

  describe('Serializer and Deserializer classes', () => {
    it('Serializer methods should be callable', () => {
      const serializer = new Serializer();
      assert.doesNotThrow(() => serializer.writeHeader());
      assert.doesNotThrow(() => serializer.writeValue({ x: 1 }));
      const buf = serializer.releaseBuffer();
      expect(Buffer.isBuffer(buf)).toBe(true);
    });

    it('Deserializer methods should be callable', () => {
      const deserializer = new Deserializer(Buffer.from(''));
      assert.strictEqual(deserializer.readHeader(), true);
      assert.strictEqual(deserializer.readValue(), null);
    });

    it('DefaultSerializer/DefaultDeserializer should be subclass instances', () => {
      const serializer = new DefaultSerializer();
      const deserializer = new DefaultDeserializer(Buffer.from(''));
      expect(serializer).toBeInstanceOf(Serializer);
      expect(deserializer).toBeInstanceOf(Deserializer);
    });
  });

  describe('promiseHooks()', () => {
    it('should return hook helpers', () => {
      const hooks = promiseHooks();
      expect(typeof hooks.onInit).toBe('function');
      expect(typeof hooks.onBefore).toBe('function');
      expect(typeof hooks.onAfter).toBe('function');
      expect(typeof hooks.onSettled).toBe('function');
      expect(typeof hooks.createHook).toBe('function');
    });

    it('createHook should return enable/disable functions', () => {
      const hooks = promiseHooks();
      const hook = hooks.createHook();
      expect(typeof hook.enable).toBe('function');
      expect(typeof hook.disable).toBe('function');
      assert.doesNotThrow(() => hook.enable());
      assert.doesNotThrow(() => hook.disable());
    });
  });

  describe('default export', () => {
    it('should expose key APIs', () => {
      expect(v8.getHeapStatistics).toBe(getHeapStatistics);
      expect(v8.serialize).toBe(serialize);
      expect(v8.Deserializer).toBe(Deserializer);
      expect(v8.promiseHooks).toBe(promiseHooks);
    });
  });

  describe('known limitations (documented)', () => {
    it.skip('getHeapSnapshot should return a readable stream like Node', () => {
      const snapshot = getHeapSnapshot();
      expect(snapshot).toBeTruthy();
    });

    it.skip('serialize/deserialize should support full V8 structured clone semantics', () => {
      const map = new Map([['a', 1]]);
      const roundtrip = deserialize(serialize(map));
      expect(roundtrip).toBeInstanceOf(Map);
    });
  });
});
