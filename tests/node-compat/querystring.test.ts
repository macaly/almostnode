/**
 * Node.js querystring module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-querystring.js
 *
 * These tests verify that our querystring shim behaves consistently with Node.js.
 */

import { describe, it, expect } from 'vitest';
import querystring, {
  parse,
  stringify,
  escape,
  unescape,
  encode,
  decode,
} from '../../src/shims/querystring';
import { assert } from './common';

describe('querystring module (Node.js compat)', () => {
  describe('querystring.parse()', () => {
    it('should parse simple query string', () => {
      assert.deepStrictEqual(parse('foo=bar'), { foo: 'bar' });
    });

    it('should parse multiple key-value pairs', () => {
      assert.deepStrictEqual(parse('foo=bar&baz=qux'), { foo: 'bar', baz: 'qux' });
    });

    it('should parse empty string', () => {
      assert.deepStrictEqual(parse(''), {});
    });

    it('should parse key without value', () => {
      assert.deepStrictEqual(parse('foo'), { foo: '' });
      assert.deepStrictEqual(parse('foo&bar'), { foo: '', bar: '' });
    });

    it('should parse key with empty value', () => {
      assert.deepStrictEqual(parse('foo='), { foo: '' });
      assert.deepStrictEqual(parse('foo=&bar='), { foo: '', bar: '' });
    });

    it('should handle duplicate keys as array', () => {
      assert.deepStrictEqual(parse('foo=bar&foo=baz'), { foo: ['bar', 'baz'] });
      assert.deepStrictEqual(parse('foo=1&foo=2&foo=3'), { foo: ['1', '2', '3'] });
    });

    it('should decode URL-encoded values', () => {
      assert.deepStrictEqual(parse('foo=hello%20world'), { foo: 'hello world' });
      assert.deepStrictEqual(parse('foo=%E4%B8%AD%E6%96%87'), { foo: '中文' });
    });

    it('should decode plus signs as spaces', () => {
      assert.deepStrictEqual(parse('foo=hello+world'), { foo: 'hello world' });
    });

    it('should decode URL-encoded keys', () => {
      assert.deepStrictEqual(parse('hello%20world=foo'), { 'hello world': 'foo' });
    });

    it('should use custom separator', () => {
      assert.deepStrictEqual(parse('foo=bar;baz=qux', ';'), { foo: 'bar', baz: 'qux' });
    });

    it('should use custom equals sign', () => {
      assert.deepStrictEqual(parse('foo:bar&baz:qux', '&', ':'), { foo: 'bar', baz: 'qux' });
    });

    it('should use custom separator and equals sign', () => {
      assert.deepStrictEqual(parse('foo:bar;baz:qux', ';', ':'), { foo: 'bar', baz: 'qux' });
    });

    it('should respect maxKeys option', () => {
      const result = parse('a=1&b=2&c=3&d=4&e=5', '&', '=', { maxKeys: 3 });
      expect(Object.keys(result).length).toBe(3);
      assert.deepStrictEqual(result, { a: '1', b: '2', c: '3' });
    });

    it('should handle maxKeys of 0 as unlimited', () => {
      const result = parse('a=1&b=2&c=3', '&', '=', { maxKeys: 0 });
      expect(Object.keys(result).length).toBe(3);
    });

    it('should handle special characters in values', () => {
      assert.deepStrictEqual(parse('foo=%26%3D%3F'), { foo: '&=?' });
    });

    it('should handle non-string input gracefully', () => {
      assert.deepStrictEqual(parse(null as unknown as string), {});
      assert.deepStrictEqual(parse(undefined as unknown as string), {});
    });

    it('should handle complex query strings', () => {
      const input = 'user=john&age=30&city=new%20york&hobbies=reading&hobbies=coding';
      const expected = {
        user: 'john',
        age: '30',
        city: 'new york',
        hobbies: ['reading', 'coding'],
      };
      assert.deepStrictEqual(parse(input), expected);
    });
  });

  describe('querystring.stringify()', () => {
    it('should stringify simple object', () => {
      assert.strictEqual(stringify({ foo: 'bar' }), 'foo=bar');
    });

    it('should stringify multiple key-value pairs', () => {
      const result = stringify({ foo: 'bar', baz: 'qux' });
      // Order may vary, so check both possibilities
      expect(['foo=bar&baz=qux', 'baz=qux&foo=bar']).toContain(result);
    });

    it('should stringify empty object', () => {
      assert.strictEqual(stringify({}), '');
    });

    it('should stringify array values', () => {
      assert.strictEqual(stringify({ foo: ['bar', 'baz'] }), 'foo=bar&foo=baz');
    });

    it('should encode special characters', () => {
      assert.strictEqual(stringify({ foo: 'hello world' }), 'foo=hello%20world');
      assert.strictEqual(stringify({ foo: '&=?' }), 'foo=%26%3D%3F');
    });

    it('should encode unicode characters', () => {
      assert.strictEqual(stringify({ foo: '中文' }), 'foo=%E4%B8%AD%E6%96%87');
    });

    it('should encode special characters in keys', () => {
      assert.strictEqual(stringify({ 'hello world': 'foo' }), 'hello%20world=foo');
    });

    it('should use custom separator', () => {
      const result = stringify({ foo: 'bar', baz: 'qux' }, ';');
      expect(['foo=bar;baz=qux', 'baz=qux;foo=bar']).toContain(result);
    });

    it('should use custom equals sign', () => {
      const result = stringify({ foo: 'bar', baz: 'qux' }, '&', ':');
      expect(['foo:bar&baz:qux', 'baz:qux&foo:bar']).toContain(result);
    });

    it('should handle number values', () => {
      assert.strictEqual(stringify({ foo: 42 }), 'foo=42');
      assert.strictEqual(stringify({ foo: 3.14 }), 'foo=3.14');
    });

    it('should handle boolean values', () => {
      assert.strictEqual(stringify({ foo: true }), 'foo=true');
      assert.strictEqual(stringify({ foo: false }), 'foo=false');
    });

    it('should skip undefined values', () => {
      assert.strictEqual(stringify({ foo: 'bar', baz: undefined }), 'foo=bar');
    });

    it('should handle non-object input gracefully', () => {
      assert.strictEqual(stringify(null as unknown as Record<string, string>), '');
      assert.strictEqual(stringify(undefined as unknown as Record<string, string>), '');
    });
  });

  describe('querystring.escape()', () => {
    it('should escape special characters', () => {
      assert.strictEqual(escape('hello world'), 'hello%20world');
      assert.strictEqual(escape('foo&bar'), 'foo%26bar');
      assert.strictEqual(escape('foo=bar'), 'foo%3Dbar');
    });

    it('should escape unicode characters', () => {
      assert.strictEqual(escape('中文'), '%E4%B8%AD%E6%96%87');
    });

    it('should not escape unreserved characters', () => {
      assert.strictEqual(escape('abc123'), 'abc123');
      assert.strictEqual(escape('foo-bar_baz.qux~'), 'foo-bar_baz.qux~');
    });

    it('should escape empty string', () => {
      assert.strictEqual(escape(''), '');
    });
  });

  describe('querystring.unescape()', () => {
    it('should unescape percent-encoded characters', () => {
      assert.strictEqual(unescape('hello%20world'), 'hello world');
      assert.strictEqual(unescape('foo%26bar'), 'foo&bar');
      assert.strictEqual(unescape('foo%3Dbar'), 'foo=bar');
    });

    it('should unescape unicode characters', () => {
      assert.strictEqual(unescape('%E4%B8%AD%E6%96%87'), '中文');
    });

    it('should convert plus signs to spaces', () => {
      assert.strictEqual(unescape('hello+world'), 'hello world');
    });

    it('should handle mixed encoding', () => {
      assert.strictEqual(unescape('hello+world%21'), 'hello world!');
    });

    it('should unescape empty string', () => {
      assert.strictEqual(unescape(''), '');
    });
  });

  describe('aliases', () => {
    it('encode should be alias for stringify', () => {
      expect(encode).toBe(stringify);
      expect(querystring.encode).toBe(querystring.stringify);
    });

    it('decode should be alias for parse', () => {
      expect(decode).toBe(parse);
      expect(querystring.decode).toBe(querystring.parse);
    });
  });

  describe('default export', () => {
    it('should have all methods', () => {
      expect(querystring.parse).toBe(parse);
      expect(querystring.stringify).toBe(stringify);
      expect(querystring.escape).toBe(escape);
      expect(querystring.unescape).toBe(unescape);
      expect(querystring.encode).toBe(stringify);
      expect(querystring.decode).toBe(parse);
    });
  });

  describe('roundtrip', () => {
    it('should roundtrip simple object', () => {
      const obj = { foo: 'bar', baz: 'qux' };
      const str = stringify(obj);
      const parsed = parse(str);
      assert.deepStrictEqual(parsed, obj);
    });

    it('should roundtrip object with special characters', () => {
      const obj = { 'hello world': 'foo&bar' };
      const str = stringify(obj);
      const parsed = parse(str);
      assert.deepStrictEqual(parsed, obj);
    });

    it('should roundtrip object with unicode', () => {
      const obj = { key: '中文', '键': 'value' };
      const str = stringify(obj);
      const parsed = parse(str);
      assert.deepStrictEqual(parsed, obj);
    });

    it('should roundtrip object with arrays', () => {
      const obj = { foo: ['a', 'b', 'c'] };
      const str = stringify(obj);
      const parsed = parse(str);
      assert.deepStrictEqual(parsed, obj);
    });
  });

  describe('edge cases', () => {
    it('should handle equals sign in value', () => {
      // foo=bar=baz should parse as foo: 'bar=baz'
      const result = parse('foo=bar=baz');
      assert.strictEqual(result.foo, 'bar=baz');
    });

    it('should handle multiple equals signs', () => {
      const result = parse('equation=1+1=2');
      assert.strictEqual(result.equation, '1 1=2'); // + becomes space
    });

    it('should handle empty key', () => {
      const result = parse('=value');
      assert.strictEqual(result[''], 'value');
    });

    it('should handle trailing separator', () => {
      const result = parse('foo=bar&');
      assert.deepStrictEqual(result, { foo: 'bar', '': '' });
    });

    it('should handle leading separator', () => {
      const result = parse('&foo=bar');
      assert.deepStrictEqual(result, { '': '', foo: 'bar' });
    });

    it('should handle consecutive separators', () => {
      const result = parse('foo=bar&&baz=qux');
      assert.deepStrictEqual(result, { foo: 'bar', '': '', baz: 'qux' });
    });
  });
});
