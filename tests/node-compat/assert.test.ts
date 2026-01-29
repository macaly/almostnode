/**
 * Node.js assert module compatibility tests
 */

import { describe, it, expect } from 'vitest';
import assert, { AssertionError } from '../../src/shims/assert';

describe('assert module', () => {
  describe('AssertionError', () => {
    it('should be an instance of Error', () => {
      const err = new AssertionError({ message: 'test' });
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('AssertionError');
    });

    it('should have correct properties', () => {
      const err = new AssertionError({
        message: 'test message',
        actual: 1,
        expected: 2,
        operator: '===',
      });
      expect(err.message).toBe('test message');
      expect(err.actual).toBe(1);
      expect(err.expected).toBe(2);
      expect(err.operator).toBe('===');
      expect(err.code).toBe('ERR_ASSERTION');
    });

    it('should generate message from actual/expected/operator', () => {
      const err = new AssertionError({
        actual: 'foo',
        expected: 'bar',
        operator: '===',
      });
      expect(err.message).toContain('foo');
      expect(err.message).toContain('bar');
      expect(err.generatedMessage).toBe(true);
    });
  });

  describe('assert()', () => {
    it('should not throw for truthy values', () => {
      expect(() => assert(true)).not.toThrow();
      expect(() => assert(1)).not.toThrow();
      expect(() => assert('string')).not.toThrow();
      expect(() => assert({})).not.toThrow();
      expect(() => assert([])).not.toThrow();
    });

    it('should throw for falsy values', () => {
      expect(() => assert(false)).toThrow(AssertionError);
      expect(() => assert(0)).toThrow(AssertionError);
      expect(() => assert('')).toThrow(AssertionError);
      expect(() => assert(null)).toThrow(AssertionError);
      expect(() => assert(undefined)).toThrow(AssertionError);
    });

    it('should use custom message', () => {
      try {
        assert(false, 'custom message');
      } catch (err) {
        expect((err as Error).message).toBe('custom message');
      }
    });
  });

  describe('assert.ok()', () => {
    it('should behave like assert()', () => {
      expect(() => assert.ok(true)).not.toThrow();
      expect(() => assert.ok(false)).toThrow(AssertionError);
    });
  });

  describe('assert.strictEqual()', () => {
    it('should pass for strictly equal values', () => {
      expect(() => assert.strictEqual(1, 1)).not.toThrow();
      expect(() => assert.strictEqual('foo', 'foo')).not.toThrow();
      expect(() => assert.strictEqual(null, null)).not.toThrow();
      expect(() => assert.strictEqual(undefined, undefined)).not.toThrow();
    });

    it('should fail for non-strictly equal values', () => {
      expect(() => assert.strictEqual(1, '1')).toThrow(AssertionError);
      expect(() => assert.strictEqual(1, 2)).toThrow(AssertionError);
      expect(() => assert.strictEqual(null, undefined)).toThrow(AssertionError);
    });

    it('should fail for different object references', () => {
      expect(() => assert.strictEqual({}, {})).toThrow(AssertionError);
      expect(() => assert.strictEqual([], [])).toThrow(AssertionError);
    });

    it('should have correct operator in error', () => {
      try {
        assert.strictEqual(1, 2);
      } catch (err) {
        expect((err as AssertionError).operator).toBe('===');
      }
    });
  });

  describe('assert.notStrictEqual()', () => {
    it('should pass for non-strictly equal values', () => {
      expect(() => assert.notStrictEqual(1, 2)).not.toThrow();
      expect(() => assert.notStrictEqual(1, '1')).not.toThrow();
      expect(() => assert.notStrictEqual({}, {})).not.toThrow();
    });

    it('should fail for strictly equal values', () => {
      expect(() => assert.notStrictEqual(1, 1)).toThrow(AssertionError);
      expect(() => assert.notStrictEqual('foo', 'foo')).toThrow(AssertionError);
    });
  });

  describe('assert.deepStrictEqual()', () => {
    it('should pass for deeply equal objects', () => {
      expect(() => assert.deepStrictEqual({ a: 1 }, { a: 1 })).not.toThrow();
      expect(() => assert.deepStrictEqual([1, 2, 3], [1, 2, 3])).not.toThrow();
      expect(() => assert.deepStrictEqual({ a: { b: 2 } }, { a: { b: 2 } })).not.toThrow();
    });

    it('should fail for non-deeply equal objects', () => {
      expect(() => assert.deepStrictEqual({ a: 1 }, { a: 2 })).toThrow(AssertionError);
      expect(() => assert.deepStrictEqual([1, 2], [1, 3])).toThrow(AssertionError);
      expect(() => assert.deepStrictEqual({ a: 1 }, { b: 1 })).toThrow(AssertionError);
    });

    it('should compare dates', () => {
      const d1 = new Date(2020, 0, 1);
      const d2 = new Date(2020, 0, 1);
      const d3 = new Date(2020, 0, 2);
      expect(() => assert.deepStrictEqual(d1, d2)).not.toThrow();
      expect(() => assert.deepStrictEqual(d1, d3)).toThrow(AssertionError);
    });

    it('should compare RegExp', () => {
      expect(() => assert.deepStrictEqual(/abc/gi, /abc/gi)).not.toThrow();
      expect(() => assert.deepStrictEqual(/abc/, /def/)).toThrow(AssertionError);
    });

    it('should compare Maps', () => {
      const m1 = new Map([['a', 1], ['b', 2]]);
      const m2 = new Map([['a', 1], ['b', 2]]);
      const m3 = new Map([['a', 1], ['b', 3]]);
      expect(() => assert.deepStrictEqual(m1, m2)).not.toThrow();
      expect(() => assert.deepStrictEqual(m1, m3)).toThrow(AssertionError);
    });

    it('should compare Sets', () => {
      const s1 = new Set([1, 2, 3]);
      const s2 = new Set([1, 2, 3]);
      const s3 = new Set([1, 2, 4]);
      expect(() => assert.deepStrictEqual(s1, s2)).not.toThrow();
      expect(() => assert.deepStrictEqual(s1, s3)).toThrow(AssertionError);
    });
  });

  describe('assert.notDeepStrictEqual()', () => {
    it('should pass for non-deeply equal objects', () => {
      expect(() => assert.notDeepStrictEqual({ a: 1 }, { a: 2 })).not.toThrow();
      expect(() => assert.notDeepStrictEqual([1], [2])).not.toThrow();
    });

    it('should fail for deeply equal objects', () => {
      expect(() => assert.notDeepStrictEqual({ a: 1 }, { a: 1 })).toThrow(AssertionError);
      expect(() => assert.notDeepStrictEqual([1, 2], [1, 2])).toThrow(AssertionError);
    });
  });

  describe('assert.throws()', () => {
    it('should pass when function throws', () => {
      expect(() => assert.throws(() => { throw new Error('test'); })).not.toThrow();
    });

    it('should fail when function does not throw', () => {
      expect(() => assert.throws(() => {})).toThrow(AssertionError);
    });

    it('should validate error with RegExp', () => {
      expect(() => assert.throws(() => { throw new Error('test error'); }, /test/)).not.toThrow();
      expect(() => assert.throws(() => { throw new Error('test error'); }, /other/)).toThrow(AssertionError);
    });

    it('should validate error type', () => {
      expect(() => assert.throws(() => { throw new TypeError('test'); }, TypeError)).not.toThrow();
      expect(() => assert.throws(() => { throw new Error('test'); }, TypeError)).toThrow(AssertionError);
    });

    it('should validate error object', () => {
      expect(() => assert.throws(() => { throw new Error('test'); }, { message: 'test' })).not.toThrow();
      expect(() => assert.throws(() => { throw new Error('test'); }, { message: 'other' })).toThrow(AssertionError);
    });

    it('should validate error code', () => {
      const err = new Error('test') as Error & { code: string };
      err.code = 'ENOENT';
      expect(() => assert.throws(() => { throw err; }, { code: 'ENOENT' })).not.toThrow();
      expect(() => assert.throws(() => { throw err; }, { code: 'OTHER' })).toThrow(AssertionError);
    });
  });

  describe('assert.doesNotThrow()', () => {
    it('should pass when function does not throw', () => {
      expect(() => assert.doesNotThrow(() => {})).not.toThrow();
    });

    it('should fail when function throws', () => {
      expect(() => assert.doesNotThrow(() => { throw new Error('test'); })).toThrow(AssertionError);
    });
  });

  describe('assert.rejects()', () => {
    it('should pass when promise rejects', async () => {
      await expect(assert.rejects(Promise.reject(new Error('test')))).resolves.not.toThrow();
    });

    it('should fail when promise resolves', async () => {
      await expect(assert.rejects(Promise.resolve())).rejects.toThrow(AssertionError);
    });

    it('should accept async function', async () => {
      await expect(assert.rejects(async () => { throw new Error('test'); })).resolves.not.toThrow();
    });

    it('should validate rejection with RegExp', async () => {
      await expect(assert.rejects(Promise.reject(new Error('test error')), /test/)).resolves.not.toThrow();
      await expect(assert.rejects(Promise.reject(new Error('test error')), /other/)).rejects.toThrow(AssertionError);
    });
  });

  describe('assert.doesNotReject()', () => {
    it('should pass when promise resolves', async () => {
      await expect(assert.doesNotReject(Promise.resolve())).resolves.not.toThrow();
    });

    it('should fail when promise rejects', async () => {
      await expect(assert.doesNotReject(Promise.reject(new Error('test')))).rejects.toThrow(AssertionError);
    });
  });

  describe('assert.fail()', () => {
    it('should always throw', () => {
      expect(() => assert.fail()).toThrow(AssertionError);
      expect(() => assert.fail('custom message')).toThrow(AssertionError);
    });

    it('should use custom message', () => {
      try {
        assert.fail('my message');
      } catch (err) {
        expect((err as Error).message).toBe('my message');
      }
    });
  });

  describe('assert.match()', () => {
    it('should pass when string matches pattern', () => {
      expect(() => assert.match('hello world', /world/)).not.toThrow();
      expect(() => assert.match('test123', /\d+/)).not.toThrow();
    });

    it('should fail when string does not match pattern', () => {
      expect(() => assert.match('hello', /world/)).toThrow(AssertionError);
    });
  });

  describe('assert.doesNotMatch()', () => {
    it('should pass when string does not match pattern', () => {
      expect(() => assert.doesNotMatch('hello', /world/)).not.toThrow();
    });

    it('should fail when string matches pattern', () => {
      expect(() => assert.doesNotMatch('hello world', /world/)).toThrow(AssertionError);
    });
  });

  describe('assert.ifError()', () => {
    it('should not throw for null/undefined', () => {
      expect(() => assert.ifError(null)).not.toThrow();
      expect(() => assert.ifError(undefined)).not.toThrow();
    });

    it('should throw for truthy values', () => {
      expect(() => assert.ifError(new Error('test'))).toThrow(Error);
      expect(() => assert.ifError('error')).toThrow(AssertionError);
      expect(() => assert.ifError(1)).toThrow(AssertionError);
    });

    it('should re-throw Error instances', () => {
      const err = new Error('original error');
      expect(() => assert.ifError(err)).toThrow(err);
    });
  });

  describe('assert.strict', () => {
    it('should be the same as assert', () => {
      expect(assert.strict).toBe(assert);
    });
  });
});
