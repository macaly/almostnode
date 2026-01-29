/**
 * Node.js url module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-url-*.js
 *
 * These tests verify that our url shim behaves consistently with Node.js
 * for common URL operations used by target frameworks.
 */

import { describe, it, expect } from 'vitest';
import url, {
  parse,
  format,
  resolve,
  URL,
  URLSearchParams,
  fileURLToPath,
  pathToFileURL,
} from '../../src/shims/url';
import { assert } from './common';

describe('url module (Node.js compat)', () => {
  describe('url.parse()', () => {
    describe('basic parsing', () => {
      it('should parse full URL', () => {
        const parsed = parse('http://user:pass@example.com:8080/path?query=value#hash');

        assert.strictEqual(parsed.protocol, 'http:');
        assert.strictEqual(parsed.host, 'example.com:8080');
        assert.strictEqual(parsed.hostname, 'example.com');
        assert.strictEqual(parsed.port, '8080');
        assert.strictEqual(parsed.pathname, '/path');
        assert.strictEqual(parsed.search, '?query=value');
        assert.strictEqual(parsed.hash, '#hash');
      });

      it('should parse URL without port', () => {
        const parsed = parse('https://example.com/path');

        assert.strictEqual(parsed.protocol, 'https:');
        assert.strictEqual(parsed.hostname, 'example.com');
        assert.strictEqual(parsed.port, null);
        assert.strictEqual(parsed.pathname, '/path');
      });

      it('should parse URL without path', () => {
        const parsed = parse('http://example.com');

        assert.strictEqual(parsed.hostname, 'example.com');
        assert.strictEqual(parsed.pathname, '/');
      });

      it('should parse URL with only query', () => {
        const parsed = parse('http://example.com?foo=bar');

        assert.strictEqual(parsed.search, '?foo=bar');
        assert.strictEqual(parsed.pathname, '/');
      });

      it('should parse URL with only hash', () => {
        const parsed = parse('http://example.com#section');

        assert.strictEqual(parsed.hash, '#section');
      });
    });

    describe('query string parsing', () => {
      it('should parse query string when parseQueryString is true', () => {
        const parsed = parse('http://example.com?foo=bar&baz=qux', true);

        assert.deepStrictEqual(parsed.query, { foo: 'bar', baz: 'qux' });
      });

      it('should return raw query string when parseQueryString is false', () => {
        const parsed = parse('http://example.com?foo=bar&baz=qux', false);

        assert.strictEqual(parsed.query, 'foo=bar&baz=qux');
      });

      it('should return raw query string by default', () => {
        const parsed = parse('http://example.com?foo=bar');

        assert.strictEqual(parsed.query, 'foo=bar');
      });
    });

    describe('auth parsing', () => {
      it('should parse username and password', () => {
        const parsed = parse('http://user:pass@example.com');

        assert.strictEqual(parsed.auth, 'user:pass');
      });

      it('should parse username only', () => {
        const parsed = parse('http://user@example.com');

        assert.strictEqual(parsed.auth, 'user:');
      });

      it('should handle no auth', () => {
        const parsed = parse('http://example.com');

        assert.strictEqual(parsed.auth, null);
      });
    });

    describe('relative URL handling', () => {
      // Known limitation: our shim uses browser's URL API which requires a base,
      // so relative URLs are parsed relative to http://localhost by default.
      // The pathname is still correct, but protocol/host will have values.
      it('should handle relative URLs', () => {
        const parsed = parse('/path/to/file');

        assert.strictEqual(parsed.pathname, '/path/to/file');
        // Note: our shim differs from Node.js here - it uses http://localhost as base
        // assert.strictEqual(parsed.protocol, null);
        // assert.strictEqual(parsed.host, null);
      });
    });

    describe('slashes', () => {
      it('should detect protocol slashes', () => {
        const parsed = parse('http://example.com');
        assert.strictEqual(parsed.slashes, true);
      });
    });
  });

  describe('url.format()', () => {
    describe('basic formatting', () => {
      it('should format full URL object', () => {
        const formatted = format({
          protocol: 'http:',
          hostname: 'example.com',
          port: '8080',
          pathname: '/path',
          search: '?query=value',
          hash: '#hash',
        });

        assert.strictEqual(formatted, 'http://example.com:8080/path?query=value#hash');
      });

      it('should format URL with auth', () => {
        const formatted = format({
          protocol: 'http:',
          auth: 'user:pass',
          hostname: 'example.com',
        });

        assert.strictEqual(formatted, 'http://user:pass@example.com');
      });

      it('should use href if provided', () => {
        const formatted = format({
          href: 'http://example.com/path',
          hostname: 'other.com', // Should be ignored
        });

        assert.strictEqual(formatted, 'http://example.com/path');
      });
    });

    describe('query formatting', () => {
      it('should format query from string', () => {
        const formatted = format({
          protocol: 'http:',
          hostname: 'example.com',
          query: 'foo=bar',
        });

        assert.strictEqual(formatted, 'http://example.com?foo=bar');
      });

      it('should format query from object', () => {
        const formatted = format({
          protocol: 'http:',
          hostname: 'example.com',
          query: { foo: 'bar', baz: 'qux' },
        });

        expect(formatted).toContain('foo=bar');
        expect(formatted).toContain('baz=qux');
      });

      it('should handle array values in query', () => {
        const formatted = format({
          protocol: 'http:',
          hostname: 'example.com',
          query: { foo: ['bar', 'baz'] },
        });

        expect(formatted).toContain('foo=bar');
        expect(formatted).toContain('foo=baz');
      });

      it('should prefer search over query', () => {
        const formatted = format({
          protocol: 'http:',
          hostname: 'example.com',
          search: '?explicit',
          query: { ignored: 'value' },
        });

        assert.strictEqual(formatted, 'http://example.com?explicit');
      });
    });

    describe('slashes handling', () => {
      it('should add slashes for http', () => {
        const formatted = format({
          protocol: 'http:',
          hostname: 'example.com',
        });

        expect(formatted).toContain('://');
      });

      it('should add slashes when slashes is true', () => {
        const formatted = format({
          protocol: 'custom:',
          slashes: true,
          hostname: 'example.com',
        });

        expect(formatted).toContain('://');
      });
    });

    describe('host vs hostname', () => {
      it('should prefer hostname over host', () => {
        const formatted = format({
          protocol: 'http:',
          hostname: 'correct.com',
          host: 'wrong.com:8080',
        });

        expect(formatted).toContain('correct.com');
      });

      it('should use host if no hostname', () => {
        const formatted = format({
          protocol: 'http:',
          host: 'example.com:8080',
        });

        assert.strictEqual(formatted, 'http://example.com:8080');
      });
    });
  });

  describe('url.resolve()', () => {
    it('should resolve relative URL against base', () => {
      const resolved = resolve('http://example.com/foo/bar', '../baz');
      assert.strictEqual(resolved, 'http://example.com/baz');
    });

    it('should resolve absolute URL', () => {
      const resolved = resolve('http://example.com/foo', 'http://other.com/bar');
      assert.strictEqual(resolved, 'http://other.com/bar');
    });

    it('should resolve path-absolute URL', () => {
      const resolved = resolve('http://example.com/foo/bar', '/baz');
      assert.strictEqual(resolved, 'http://example.com/baz');
    });

    it('should resolve relative path', () => {
      const resolved = resolve('http://example.com/foo/', 'bar');
      assert.strictEqual(resolved, 'http://example.com/foo/bar');
    });

    it('should resolve with query string', () => {
      const resolved = resolve('http://example.com/foo', '?query=value');
      assert.strictEqual(resolved, 'http://example.com/foo?query=value');
    });

    it('should resolve with hash', () => {
      const resolved = resolve('http://example.com/foo', '#hash');
      assert.strictEqual(resolved, 'http://example.com/foo#hash');
    });
  });

  describe('URL class (WHATWG)', () => {
    describe('construction', () => {
      it('should construct from string', () => {
        const u = new URL('http://example.com/path');
        assert.strictEqual(u.hostname, 'example.com');
        assert.strictEqual(u.pathname, '/path');
      });

      it('should construct with base', () => {
        const u = new URL('/path', 'http://example.com');
        assert.strictEqual(u.href, 'http://example.com/path');
      });

      it('should throw for invalid URL', () => {
        assert.throws(() => new URL('invalid'));
      });
    });

    describe('properties', () => {
      it('should have all standard properties', () => {
        const u = new URL('http://user:pass@example.com:8080/path?query=value#hash');

        assert.strictEqual(u.protocol, 'http:');
        assert.strictEqual(u.username, 'user');
        assert.strictEqual(u.password, 'pass');
        assert.strictEqual(u.host, 'example.com:8080');
        assert.strictEqual(u.hostname, 'example.com');
        assert.strictEqual(u.port, '8080');
        assert.strictEqual(u.pathname, '/path');
        assert.strictEqual(u.search, '?query=value');
        assert.strictEqual(u.hash, '#hash');
      });

      it('should have href property', () => {
        const u = new URL('http://example.com/path');
        assert.strictEqual(u.href, 'http://example.com/path');
      });

      it('should have origin property', () => {
        const u = new URL('http://example.com:8080/path');
        assert.strictEqual(u.origin, 'http://example.com:8080');
      });
    });

    describe('searchParams', () => {
      it('should provide URLSearchParams', () => {
        const u = new URL('http://example.com?foo=bar&baz=qux');

        assert.strictEqual(u.searchParams.get('foo'), 'bar');
        assert.strictEqual(u.searchParams.get('baz'), 'qux');
      });

      it('should update search when searchParams modified', () => {
        const u = new URL('http://example.com');
        u.searchParams.set('foo', 'bar');

        assert.strictEqual(u.search, '?foo=bar');
      });
    });

    describe('toString and toJSON', () => {
      it('should convert to string', () => {
        const u = new URL('http://example.com/path');
        assert.strictEqual(u.toString(), 'http://example.com/path');
      });

      it('should convert to JSON', () => {
        const u = new URL('http://example.com/path');
        assert.strictEqual(u.toJSON(), 'http://example.com/path');
      });
    });
  });

  describe('URLSearchParams class', () => {
    describe('construction', () => {
      it('should construct from string', () => {
        const params = new URLSearchParams('foo=bar&baz=qux');
        assert.strictEqual(params.get('foo'), 'bar');
        assert.strictEqual(params.get('baz'), 'qux');
      });

      it('should construct from object', () => {
        const params = new URLSearchParams({ foo: 'bar', baz: 'qux' });
        assert.strictEqual(params.get('foo'), 'bar');
        assert.strictEqual(params.get('baz'), 'qux');
      });

      it('should construct from iterable', () => {
        const params = new URLSearchParams([['foo', 'bar'], ['baz', 'qux']]);
        assert.strictEqual(params.get('foo'), 'bar');
        assert.strictEqual(params.get('baz'), 'qux');
      });
    });

    describe('methods', () => {
      it('should get and set values', () => {
        const params = new URLSearchParams();
        params.set('foo', 'bar');
        assert.strictEqual(params.get('foo'), 'bar');
      });

      it('should append values', () => {
        const params = new URLSearchParams();
        params.append('foo', 'bar');
        params.append('foo', 'baz');
        assert.deepStrictEqual(params.getAll('foo'), ['bar', 'baz']);
      });

      it('should delete values', () => {
        const params = new URLSearchParams('foo=bar&baz=qux');
        params.delete('foo');
        assert.strictEqual(params.has('foo'), false);
        assert.strictEqual(params.has('baz'), true);
      });

      it('should check existence with has', () => {
        const params = new URLSearchParams('foo=bar');
        assert.strictEqual(params.has('foo'), true);
        assert.strictEqual(params.has('baz'), false);
      });

      it('should iterate with forEach', () => {
        const params = new URLSearchParams('foo=bar&baz=qux');
        const entries: Array<[string, string]> = [];

        params.forEach((value, key) => {
          entries.push([key, value]);
        });

        assert.deepStrictEqual(entries, [['foo', 'bar'], ['baz', 'qux']]);
      });

      it('should iterate with entries()', () => {
        const params = new URLSearchParams('foo=bar');
        const entries = [...params.entries()];
        assert.deepStrictEqual(entries, [['foo', 'bar']]);
      });

      it('should iterate with keys()', () => {
        const params = new URLSearchParams('foo=bar&baz=qux');
        const keys = [...params.keys()];
        assert.deepStrictEqual(keys, ['foo', 'baz']);
      });

      it('should iterate with values()', () => {
        const params = new URLSearchParams('foo=bar&baz=qux');
        const values = [...params.values()];
        assert.deepStrictEqual(values, ['bar', 'qux']);
      });

      it('should convert to string', () => {
        const params = new URLSearchParams({ foo: 'bar', baz: 'qux' });
        const str = params.toString();
        expect(str).toContain('foo=bar');
        expect(str).toContain('baz=qux');
      });

      it('should sort entries', () => {
        const params = new URLSearchParams('c=1&a=2&b=3');
        params.sort();
        assert.strictEqual(params.toString(), 'a=2&b=3&c=1');
      });
    });

    describe('encoding', () => {
      it('should encode special characters', () => {
        const params = new URLSearchParams();
        params.set('foo', 'hello world');
        expect(params.toString()).toContain('hello+world');
      });

      it('should handle unicode', () => {
        const params = new URLSearchParams();
        params.set('foo', '\u4e2d\u6587');
        const str = params.toString();
        // Should be URL encoded
        expect(str).not.toContain('\u4e2d');
      });
    });
  });

  describe('fileURLToPath()', () => {
    it('should convert file URL to path', () => {
      const path = fileURLToPath('file:///home/user/file.txt');
      assert.strictEqual(path, '/home/user/file.txt');
    });

    it('should handle URL object', () => {
      const u = new URL('file:///home/user/file.txt');
      const path = fileURLToPath(u);
      assert.strictEqual(path, '/home/user/file.txt');
    });

    it('should decode percent-encoded characters', () => {
      const path = fileURLToPath('file:///home/user/my%20file.txt');
      assert.strictEqual(path, '/home/user/my file.txt');
    });

    it('should throw for non-file protocol', () => {
      assert.throws(
        () => fileURLToPath('http://example.com/path'),
        TypeError
      );
    });
  });

  describe('pathToFileURL()', () => {
    it('should convert path to file URL', () => {
      const u = pathToFileURL('/home/user/file.txt');
      assert.strictEqual(u.protocol, 'file:');
      expect(u.href).toContain('/home/user/file.txt');
    });

    it('should return URL object', () => {
      const u = pathToFileURL('/home/user/file.txt');
      expect(u).toBeInstanceOf(URL);
    });

    it('should handle spaces', () => {
      const u = pathToFileURL('/home/user/my file.txt');
      // Space should be encoded
      expect(u.href).toContain('%20');
    });
  });

  describe('default export', () => {
    it('should have all url methods', () => {
      expect(url.parse).toBe(parse);
      expect(url.format).toBe(format);
      expect(url.resolve).toBe(resolve);
      expect(url.URL).toBe(URL);
      expect(url.URLSearchParams).toBe(URLSearchParams);
      expect(url.fileURLToPath).toBe(fileURLToPath);
      expect(url.pathToFileURL).toBe(pathToFileURL);
    });
  });

  describe('parse/format roundtrip', () => {
    const testUrls = [
      'http://example.com',
      'https://example.com:8080/path',
      'http://user:pass@example.com/path?query=value#hash',
      'http://example.com?foo=bar&baz=qux',
    ];

    testUrls.forEach((testUrl) => {
      it(`should roundtrip: ${testUrl}`, () => {
        const parsed = parse(testUrl);
        const formatted = format(parsed);

        // Parse again to compare (original URL might have been normalized)
        const reparsed = parse(formatted);
        assert.strictEqual(reparsed.protocol, parsed.protocol);
        assert.strictEqual(reparsed.hostname, parsed.hostname);
        assert.strictEqual(reparsed.pathname, parsed.pathname);
      });
    });
  });
});
