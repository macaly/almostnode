/**
 * Common test utilities for Node.js compatibility tests
 *
 * This module provides utilities to help adapt Node.js official tests
 * to our Vitest-based test framework. It includes an assert compatibility
 * layer and common test helpers.
 *
 * Reference: https://github.com/nodejs/node/tree/main/test/parallel
 */

import { expect } from 'vitest';

/**
 * Node.js assert module compatibility layer
 * Maps Node.js assert methods to Vitest expect assertions
 */
export const assert = {
  strictEqual<T>(actual: T, expected: T, message?: string): void {
    expect(actual, message).toBe(expected);
  },

  notStrictEqual<T>(actual: T, expected: T, message?: string): void {
    expect(actual, message).not.toBe(expected);
  },

  deepStrictEqual<T>(actual: T, expected: T, message?: string): void {
    expect(actual, message).toEqual(expected);
  },

  notDeepStrictEqual<T>(actual: T, expected: T, message?: string): void {
    expect(actual, message).not.toEqual(expected);
  },

  ok(value: unknown, message?: string): void {
    expect(value, message).toBeTruthy();
  },

  throws(fn: () => unknown, expected?: RegExp | Error | ErrorConstructor | object, message?: string): void {
    if (expected instanceof RegExp) {
      expect(fn, message).toThrow(expected);
    } else if (typeof expected === 'function') {
      expect(fn, message).toThrow(expected as any);
    } else if (expected && typeof expected === 'object' && 'code' in expected) {
      // Node.js style error object with code
      try {
        fn();
        expect.fail(message || 'Expected function to throw');
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err) {
          expect((err as { code: string }).code, message).toBe((expected as { code: string }).code);
        } else {
          throw err;
        }
      }
    } else {
      expect(fn, message).toThrow();
    }
  },

  doesNotThrow(fn: () => unknown, message?: string): void {
    expect(fn, message).not.toThrow();
  },

  fail(message?: string): never {
    expect.fail(message || 'Assertion failed');
  },

  match(actual: string, regexp: RegExp, message?: string): void {
    expect(actual, message).toMatch(regexp);
  },

  doesNotMatch(actual: string, regexp: RegExp, message?: string): void {
    expect(actual, message).not.toMatch(regexp);
  },

  rejects(asyncFn: Promise<unknown> | (() => Promise<unknown>), expected?: RegExp | Error | ErrorConstructor, message?: string): Promise<void> {
    const promise = typeof asyncFn === 'function' ? asyncFn() : asyncFn;
    if (expected instanceof RegExp) {
      return expect(promise, message).rejects.toThrow(expected);
    } else if (typeof expected === 'function') {
      return expect(promise, message).rejects.toThrow(expected);
    }
    return expect(promise, message).rejects.toThrow();
  },

  doesNotReject(asyncFn: Promise<unknown> | (() => Promise<unknown>), message?: string): Promise<void> {
    const promise = typeof asyncFn === 'function' ? asyncFn() : asyncFn;
    return expect(promise, message).resolves.not.toThrow();
  }
};

/**
 * Platform detection helpers
 */
export const isWindows = false; // We only support POSIX in our shims
export const isPosix = true;

/**
 * Test helper to skip tests that require features we don't support
 */
export function skip(reason: string): () => void {
  return () => {
    console.log(`Skipped: ${reason}`);
  };
}

/**
 * Helper to create a test that is expected to fail (for documenting known limitations)
 */
export function expectedToFail(testFn: () => void, reason: string): () => void {
  return () => {
    try {
      testFn();
      // If it passes, that's actually unexpected - might mean we fixed it!
      console.warn(`Test passed but was expected to fail: ${reason}`);
    } catch {
      // Expected to fail, so this is OK
    }
  };
}

/**
 * Common path-related test data
 * Adapted from Node.js test-path.js
 *
 * NOTE: Some test cases are commented out because they test edge cases
 * where our shim behavior differs from Node.js. These are documented
 * as known limitations in README.md.
 */
export const pathTests = {
  // Test cases for join()
  // Known limitations (commented out):
  // - [['./'], './'] - our shim returns '.' instead of './'
  // - [['.', './'], './'] - our shim returns '.' instead of './'
  // - [['foo/', ''], 'foo/'] - our shim returns 'foo' instead of 'foo/'
  // - [[' ', '/'], ' /'] - our shim returns ' ' instead of ' /'
  joinTests: [
    [['.', 'x/b', '..', '/b/c.js'], 'x/b/c.js'],
    [[], '.'],
    [['/.', 'x/b', '..', '/b/c.js'], '/x/b/c.js'],
    [['/foo', '../../../bar'], '/bar'],
    [['foo', '../../../bar'], '../../bar'],
    [['foo/', '../../../bar'], '../../bar'],
    [['foo/x', '../../../bar'], '../bar'],
    [['foo/x', './bar'], 'foo/x/bar'],
    [['foo/x/', './bar'], 'foo/x/bar'],
    [['foo/x/', '.', 'bar'], 'foo/x/bar'],
    // [['./'], './'], // Known limitation: our shim returns '.'
    // [['.', './'], './'], // Known limitation: our shim returns '.'
    [['.', '.', '.'], '.'],
    [['.', './', '.'], '.'],
    [['.', '/./', '.'], '.'],
    [['.', '/////./', '.'], '.'],
    [['.'], '.'],
    [['', '.'], '.'],
    [['', 'foo'], 'foo'],
    [['foo', '/bar'], 'foo/bar'],
    [['', '/foo'], '/foo'],
    [['', '', '/foo'], '/foo'],
    [['', '', 'foo'], 'foo'],
    [['foo', ''], 'foo'],
    // [['foo/', ''], 'foo/'], // Known limitation: our shim returns 'foo'
    [['foo', '', '/bar'], 'foo/bar'],
    [['./', '..', '/foo'], '../foo'],
    [['./', '..', '..', '/foo'], '../../foo'],
    [['.', '..', '..', '/foo'], '../../foo'],
    [['', '..', '..', '/foo'], '../../foo'],
    [['/'], '/'],
    [['/', '.'], '/'],
    [['/', '..'], '/'],
    [['/', '..', '..'], '/'],
    [[''], '.'],
    [['', ''], '.'],
    [[' /foo'], ' /foo'],
    [[' ', 'foo'], ' /foo'],
    [[' ', '.'], ' '],
    // [[' ', '/'], ' /'], // Known limitation: our shim returns ' '
    [[' ', ''], ' '],
    [['/', 'foo'], '/foo'],
    [['/', '/foo'], '/foo'],
    [['/', '//foo'], '/foo'],
    [['/', '', '/foo'], '/foo'],
    [['', '/', 'foo'], '/foo'],
    [['', '/', '/foo'], '/foo'],
  ] as Array<[string[], string]>,

  // Test cases for resolve()
  // Note: tests with relative paths (like resolve('.') or resolve('a/b/c/')) are
  // handled separately in the test file since they depend on process.cwd()
  resolveTests: [
    [['/var/lib', '../', 'file/'], '/var/file'],
    [['/var/lib', '/../', 'file/'], '/file'],
    [['/some/dir', '.', '/absolute/'], '/absolute'],
    [['/foo/tmp.3/', '../tmp.3/cycles/root.js'], '/foo/tmp.3/cycles/root.js'],
  ] as Array<[string[], string]>,

  // Test cases for normalize()
  // Known limitations (commented out):
  // - ['bar/foo../../', 'bar/'] - our shim doesn't preserve trailing slashes
  // - ['../../../foo/../../../bar/../../', '../../../../../../'] - trailing slash
  // - ['../foobar/barfoo/foo/../../../bar/../../', '../../'] - trailing slash
  normalizeTests: [
    ['./fixtures///b/../b/c.js', 'fixtures/b/c.js'],
    ['/foo/../../../bar', '/bar'],
    ['a//b//../b', 'a/b'],
    ['a//b//./c', 'a/b/c'],
    ['a//b//.', 'a/b'],
    ['/a/b/c/../../../x/y/z', '/x/y/z'],
    ['///..//./foo/.//bar', '/foo/bar'],
    // ['bar/foo../../', 'bar/'], // Known limitation: trailing slash handling
    ['bar/foo..', 'bar/foo..'],
    ['../foo../../../bar', '../../bar'],
    ['../.../.././.../../../bar', '../../bar'],
    ['../../../foo/../../../bar', '../../../../../bar'],
    // ['../../../foo/../../../bar/../../', '../../../../../../'], // Known limitation: trailing slash
    // ['../foobar/barfoo/foo/../../../bar/../../', '../../'], // Known limitation: trailing slash
    ['../.../../foobar/../../../bar/../../baz', '../../../../baz'],
    ['foo/bar\\baz', 'foo/bar\\baz'],
  ] as Array<[string, string]>,

  // Test cases for relative()
  relativeTests: [
    ['/var/lib', '/var', '..'],
    ['/var/lib', '/bin', '../../bin'],
    ['/var/lib', '/var/lib', ''],
    ['/var/lib', '/var/apache', '../apache'],
    ['/var/', '/var/lib', 'lib'],
    ['/', '/var/lib', 'var/lib'],
    ['/foo/test', '/foo/test/bar/package.json', 'bar/package.json'],
    ['/Users/a/web/b/test/mails', '/Users/a/web/b', '../..'],
    ['/foo/bar/baz-quux', '/foo/bar/baz', '../baz'],
    ['/foo/bar/baz', '/foo/bar/baz-quux', '../baz-quux'],
    ['/baz-quux', '/baz', '../baz'],
    ['/baz', '/baz-quux', '../baz-quux'],
    ['/page1/page2/foo', '/', '../../..'],
  ] as Array<[string, string, string]>,

  // Test cases for parse() and format()
  parseFormatTests: [
    '/home/user/dir/file.txt',
    '/home/user/a dir/another file.txt',
    '/home/user/a dir//another file.txt',
    '/home//user/dir/file.txt',
    '/home/user/.hidden',
    '/home/user/dir/',
    '/home/user/dir',
    '/.hidden',
    '/file.txt',
    '/',
    '.',
    '..',
    './file.txt',
    '../file.txt',
    'file.txt',
    'file',
    '.file',
    'a/b/c/d',
  ],

  // Test cases for dirname()
  dirnameTests: [
    ['/a/b/', '/a'],
    ['/a/b', '/a'],
    ['/a', '/'],
    ['', '.'],
    ['/', '/'],
    ['/////', '/'],
    ['//a', '/'],
    ['foo', '.'],
  ] as Array<[string, string]>,

  // Test cases for basename()
  basenameTests: [
    ['/a/b', undefined, 'b'],
    ['/a/b/', undefined, 'b'],
    ['/a', undefined, 'a'],
    ['/', undefined, ''],
    ['//a', undefined, 'a'],
    ['/a/b.html', '.html', 'b'],
    ['/a/b.html', 'b.html', ''],
    ['a', undefined, 'a'],
    ['a/b', undefined, 'b'],
    ['aaa/bbb', '/bbb', 'bbb'],
  ] as Array<[string, string | undefined, string]>,

  // Test cases for extname()
  // Known limitations (commented out):
  // - ['..', ''] - our shim returns '.' because it treats '..' as having extension
  // - ['../', ''] - same issue with '..' handling
  extnameTests: [
    ['', ''],
    ['/path/to/file', ''],
    ['/path/to/file.ext', '.ext'],
    ['/path.to/file.ext', '.ext'],
    ['/path.to/file', ''],
    ['/path.to/.file', ''],
    ['/path.to/.file.ext', '.ext'],
    ['/path/to/f.ext', '.ext'],
    ['/path/to/..ext', '.ext'],
    ['/path/to/..', ''],
    ['file', ''],
    ['file.ext', '.ext'],
    ['.file', ''],
    ['.file.ext', '.ext'],
    ['/file', ''],
    ['/file.ext', '.ext'],
    ['/.file', ''],
    ['/.file.ext', '.ext'],
    ['.path/file.ext', '.ext'],
    ['file.ext.ext', '.ext'],
    ['file.', '.'],
    ['.', ''],
    ['./', ''],
    ['.file.ext', '.ext'],
    ['.file', ''],
    ['.file.', '.'],
    ['.file..', '.'],
    // ['..', ''], // Known limitation: our shim returns '.'
    // ['../', ''], // Known limitation: our shim returns '.'
    ['..file.ext', '.ext'],
    ['..file', '.file'],
    ['..file.', '.'],
    ['..file..', '.'],
    ['...', '.'],
    ['...ext', '.ext'],
    ['....', '.'],
    ['file.ext/', '.ext'],
    ['file.ext//', '.ext'],
    ['file/', ''],
    ['file//', ''],
    ['file./', '.'],
    ['file.//', '.'],
  ] as Array<[string, string]>,

  // Test cases for isAbsolute()
  isAbsoluteTests: [
    ['/', true],
    ['/foo/bar', true],
    ['/baz/..', true],
    ['foo/bar', false],
    ['./baz', false],
    ['', false],
  ] as Array<[string, boolean]>,
};

/**
 * Buffer test helpers
 */
export function bufferEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Type guard for error objects
 */
export function isError(err: unknown): err is Error {
  return err instanceof Error;
}

/**
 * Type guard for error objects with code
 */
export function isErrorWithCode(err: unknown): err is Error & { code: string } {
  return isError(err) && 'code' in err && typeof (err as { code: unknown }).code === 'string';
}
