/**
 * API Examples Integration Tests
 *
 * These tests verify that all the API examples from the documentation
 * and README actually work correctly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import { Runtime, RuntimeOptions } from '../src/runtime';
import { PackageManager } from '../src/npm';

// Helper to create a container (mirrors the exported createContainer function)
function createContainer(options?: RuntimeOptions) {
  const vfs = new VirtualFS();
  const runtime = new Runtime(vfs, options);
  const npm = new PackageManager(vfs);

  return {
    vfs,
    runtime,
    npm,
    execute: (code: string, filename?: string) => runtime.execute(code, filename),
    runFile: (filename: string) => runtime.runFile(filename),
  };
}

describe('API Examples (Integration Tests)', () => {
  describe('Basic Usage - Running Code', () => {
    it('should execute JavaScript code directly', () => {
      const container = createContainer();

      const result = container.execute(`
        const path = require('path');
        module.exports = path.join('/home', 'user', 'file.txt');
      `);

      expect(result.exports).toBe('/home/user/file.txt');
    });

    it('should write and read files from virtual filesystem', () => {
      const container = createContainer();

      const result = container.execute(`
        const fs = require('fs');

        fs.writeFileSync('/hello.txt', 'Hello from the browser!');
        module.exports = fs.readFileSync('/hello.txt', 'utf8');
      `);

      expect(result.exports).toBe('Hello from the browser!');
    });

    it('should use Node.js APIs in the browser', () => {
      const container = createContainer();

      const result = container.execute(`
        const path = require('path');
        const fs = require('fs');
        const os = require('os');

        module.exports = {
          joined: path.join('/home', 'user', 'file.txt'),
          platform: os.platform(),
          homedir: os.homedir(),
        };
      `);

      expect(result.exports).toEqual({
        joined: '/home/user/file.txt',
        platform: expect.any(String),
        homedir: expect.any(String),
      });
    });
  });

  describe('Working with Virtual File System', () => {
    it('should pre-populate and read from the virtual filesystem', () => {
      const container = createContainer();
      const { vfs, execute } = container;

      // Pre-populate the virtual filesystem
      vfs.writeFileSync(
        '/src/index.js',
        `
        const data = require('./data.json');
        module.exports = { count: data.users.length, firstUser: data.users[0].name };
      `
      );

      vfs.writeFileSync(
        '/src/data.json',
        JSON.stringify({
          users: [{ name: 'Alice' }, { name: 'Bob' }],
        })
      );

      // Run from the virtual filesystem
      const result = container.runFile('/src/index.js');

      expect(result.exports).toEqual({
        count: 2,
        firstUser: 'Alice',
      });
    });

    it('should support mkdir, readdir, stat operations', () => {
      const container = createContainer();
      const { vfs } = container;

      // Create directory structure
      vfs.mkdirSync('/app/src', { recursive: true });
      vfs.writeFileSync('/app/src/index.js', 'console.log("hello")');
      vfs.writeFileSync('/app/src/utils.js', 'module.exports = {}');
      vfs.writeFileSync('/app/package.json', '{}');

      // List directory contents
      const appContents = vfs.readdirSync('/app');
      expect(appContents.sort()).toEqual(['package.json', 'src']);

      const srcContents = vfs.readdirSync('/app/src');
      expect(srcContents.sort()).toEqual(['index.js', 'utils.js']);

      // Check file stats
      const stat = vfs.statSync('/app/src/index.js');
      expect(stat.isFile()).toBe(true);
      expect(stat.isDirectory()).toBe(false);

      const dirStat = vfs.statSync('/app/src');
      expect(dirStat.isFile()).toBe(false);
      expect(dirStat.isDirectory()).toBe(true);
    });

    it('should support existsSync and unlinkSync', () => {
      const container = createContainer();
      const { vfs } = container;

      vfs.writeFileSync('/temp.txt', 'temporary');
      expect(vfs.existsSync('/temp.txt')).toBe(true);

      vfs.unlinkSync('/temp.txt');
      expect(vfs.existsSync('/temp.txt')).toBe(false);
    });
  });

  describe('Container Options', () => {
    it('should accept custom environment variables', () => {
      const container = createContainer({
        env: {
          NODE_ENV: 'production',
          API_KEY: 'secret123',
          CUSTOM_VAR: 'custom_value',
        },
      });

      const result = container.execute(`
        module.exports = {
          nodeEnv: process.env.NODE_ENV,
          apiKey: process.env.API_KEY,
          customVar: process.env.CUSTOM_VAR,
        };
      `);

      expect(result.exports).toEqual({
        nodeEnv: 'production',
        apiKey: 'secret123',
        customVar: 'custom_value',
      });
    });

    it('should accept custom working directory', () => {
      const container = createContainer({
        cwd: '/app',
      });

      const result = container.execute(`
        module.exports = process.cwd();
      `);

      expect(result.exports).toBe('/app');
    });

    it('should capture console output with onConsole callback', () => {
      const logs: Array<{ method: string; args: unknown[] }> = [];

      const container = createContainer({
        onConsole: (method, args) => logs.push({ method, args }),
      });

      container.execute(`
        console.log('Hello', 'World');
        console.error('Error occurred');
        console.warn('Warning!');
        console.info('Info message');
      `);

      expect(logs).toContainEqual({ method: 'log', args: ['Hello', 'World'] });
      expect(logs).toContainEqual({ method: 'error', args: ['Error occurred'] });
      expect(logs).toContainEqual({ method: 'warn', args: ['Warning!'] });
      expect(logs).toContainEqual({ method: 'info', args: ['Info message'] });
    });
  });

  describe('Module Resolution', () => {
    it('should resolve relative modules', () => {
      const container = createContainer();
      const { vfs } = container;

      vfs.writeFileSync('/lib/math.js', `
        module.exports = {
          add: (a, b) => a + b,
          multiply: (a, b) => a * b,
        };
      `);

      const result = container.execute(`
        const math = require('./lib/math');
        module.exports = {
          sum: math.add(2, 3),
          product: math.multiply(4, 5),
        };
      `);

      expect(result.exports).toEqual({ sum: 5, product: 20 });
    });

    it('should resolve JSON modules', () => {
      const container = createContainer();
      const { vfs } = container;

      vfs.writeFileSync(
        '/config.json',
        JSON.stringify({
          port: 3000,
          host: 'localhost',
          debug: true,
        })
      );

      const result = container.execute(`
        const config = require('./config.json');
        module.exports = config;
      `);

      expect(result.exports).toEqual({
        port: 3000,
        host: 'localhost',
        debug: true,
      });
    });

    it('should resolve directory with index.js', () => {
      const container = createContainer();
      const { vfs } = container;

      vfs.mkdirSync('/utils', { recursive: true });
      vfs.writeFileSync('/utils/index.js', `
        module.exports = {
          version: '1.0.0',
          name: 'utils',
        };
      `);

      const result = container.execute(`
        const utils = require('./utils');
        module.exports = utils;
      `);

      expect(result.exports).toEqual({ version: '1.0.0', name: 'utils' });
    });

    it('should resolve node_modules packages', () => {
      const container = createContainer();
      const { vfs } = container;

      // Simulate an installed package
      vfs.mkdirSync('/node_modules/my-package', { recursive: true });
      vfs.writeFileSync(
        '/node_modules/my-package/package.json',
        JSON.stringify({ name: 'my-package', main: 'index.js' })
      );
      vfs.writeFileSync('/node_modules/my-package/index.js', `
        module.exports = {
          greet: (name) => 'Hello, ' + name + '!',
        };
      `);

      const result = container.execute(`
        const pkg = require('my-package');
        module.exports = pkg.greet('World');
      `);

      expect(result.exports).toBe('Hello, World!');
    });

    it('should cache modules', () => {
      const container = createContainer();
      const { vfs } = container;

      vfs.writeFileSync('/counter.js', `
        let count = 0;
        module.exports = {
          increment: () => ++count,
          getCount: () => count,
        };
      `);

      const result = container.execute(`
        const counter1 = require('./counter');
        const counter2 = require('./counter');
        counter1.increment();
        counter1.increment();
        counter2.increment();
        module.exports = {
          sameInstance: counter1 === counter2,
          count: counter2.getCount(),
        };
      `);

      expect(result.exports).toEqual({ sameInstance: true, count: 3 });
    });
  });

  describe('Node.js Built-in Modules', () => {
    it('should provide path module', () => {
      const container = createContainer();

      const result = container.execute(`
        const path = require('path');
        module.exports = {
          join: path.join('foo', 'bar', 'baz'),
          resolve: path.resolve('/foo', 'bar', 'baz'),
          dirname: path.dirname('/foo/bar/file.js'),
          basename: path.basename('/foo/bar/file.js'),
          extname: path.extname('/foo/bar/file.js'),
          parse: path.parse('/home/user/file.txt'),
        };
      `);

      expect(result.exports).toEqual({
        join: 'foo/bar/baz',
        resolve: '/foo/bar/baz',
        dirname: '/foo/bar',
        basename: 'file.js',
        extname: '.js',
        parse: {
          root: '/',
          dir: '/home/user',
          base: 'file.txt',
          ext: '.txt',
          name: 'file',
        },
      });
    });

    it('should provide fs module', () => {
      const container = createContainer();

      const result = container.execute(`
        const fs = require('fs');

        // Write
        fs.writeFileSync('/test.txt', 'Hello World');

        // Read
        const content = fs.readFileSync('/test.txt', 'utf8');

        // Stat
        const stat = fs.statSync('/test.txt');

        // Check
        const exists = fs.existsSync('/test.txt');
        const notExists = fs.existsSync('/nope.txt');

        module.exports = {
          content,
          isFile: stat.isFile(),
          exists,
          notExists,
        };
      `);

      expect(result.exports).toEqual({
        content: 'Hello World',
        isFile: true,
        exists: true,
        notExists: false,
      });
    });

    it('should provide process module', () => {
      const container = createContainer({
        cwd: '/app',
        env: { NODE_ENV: 'test' },
      });

      const result = container.execute(`
        const process = require('process');
        module.exports = {
          cwd: process.cwd(),
          env: process.env.NODE_ENV,
          platform: process.platform,
          version: process.version,
          hasArgv: Array.isArray(process.argv),
        };
      `);

      expect(result.exports).toEqual({
        cwd: '/app',
        env: 'test',
        platform: expect.any(String),
        version: expect.stringMatching(/^v\d+\.\d+\.\d+/),
        hasArgv: true,
      });
    });

    it('should provide events module', () => {
      const container = createContainer();

      const result = container.execute(`
        const EventEmitter = require('events');
        const emitter = new EventEmitter();

        const received = [];
        emitter.on('data', (value) => received.push(value));
        emitter.emit('data', 'first');
        emitter.emit('data', 'second');

        module.exports = {
          received,
          listenerCount: emitter.listenerCount('data'),
        };
      `);

      expect(result.exports).toEqual({
        received: ['first', 'second'],
        listenerCount: 1,
      });
    });

    it('should provide url module', () => {
      const container = createContainer();

      const result = container.execute(`
        const url = require('url');

        const parsed = new url.URL('https://example.com:8080/path?foo=bar#hash');

        module.exports = {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port,
          pathname: parsed.pathname,
          search: parsed.search,
          hash: parsed.hash,
        };
      `);

      expect(result.exports).toEqual({
        protocol: 'https:',
        hostname: 'example.com',
        port: '8080',
        pathname: '/path',
        search: '?foo=bar',
        hash: '#hash',
      });
    });

    it('should provide querystring module', () => {
      const container = createContainer();

      const result = container.execute(`
        const qs = require('querystring');

        const parsed = qs.parse('foo=bar&baz=qux&num=123');
        const stringified = qs.stringify({ a: 1, b: 2, c: 'hello' });

        module.exports = { parsed, stringified };
      `);

      expect(result.exports).toEqual({
        parsed: { foo: 'bar', baz: 'qux', num: '123' },
        stringified: 'a=1&b=2&c=hello',
      });
    });

    it('should provide util module', () => {
      const container = createContainer();

      const result = container.execute(`
        const util = require('util');

        module.exports = {
          formatted: util.format('Hello %s, you have %d messages', 'User', 5),
          isArray: util.isArray([1, 2, 3]),
          isString: util.isString('hello'),
        };
      `);

      expect(result.exports).toEqual({
        formatted: 'Hello User, you have 5 messages',
        isArray: true,
        isString: true,
      });
    });

    it('should provide os module', () => {
      const container = createContainer();

      const result = container.execute(`
        const os = require('os');

        module.exports = {
          platform: os.platform(),
          arch: os.arch(),
          homedir: os.homedir(),
          tmpdir: os.tmpdir(),
          hostname: os.hostname(),
          hasEOL: typeof os.EOL === 'string',
        };
      `);

      expect(result.exports).toEqual({
        platform: expect.any(String),
        arch: expect.any(String),
        homedir: expect.any(String),
        tmpdir: expect.any(String),
        hostname: expect.any(String),
        hasEOL: true,
      });
    });

    it('should provide crypto module', () => {
      const container = createContainer();

      const result = container.execute(`
        const crypto = require('crypto');

        const hash = crypto.createHash('sha256').update('hello').digest('hex');
        const uuid = crypto.randomUUID();
        const bytes = crypto.randomBytes(16);

        module.exports = {
          hashLength: hash.length,
          uuidFormat: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid),
          bytesLength: bytes.length,
        };
      `);

      expect(result.exports).toEqual({
        hashLength: 64, // SHA-256 produces 64 hex characters
        uuidFormat: true,
        bytesLength: 16,
      });
    });

    it('should provide buffer module', () => {
      const container = createContainer();

      const result = container.execute(`
        const { Buffer } = require('buffer');

        const buf1 = Buffer.from('Hello');
        const buf2 = Buffer.from([72, 101, 108, 108, 111]); // "Hello" in ASCII
        const buf3 = Buffer.alloc(5); // Note: our shim doesn't support fill parameter

        module.exports = {
          fromString: buf1.toString(),
          fromArray: buf2.toString(),
          allocatedLength: buf3.length,
          concat: Buffer.concat([buf1, Buffer.from(' World')]).toString(),
        };
      `);

      expect(result.exports).toEqual({
        fromString: 'Hello',
        fromArray: 'Hello',
        allocatedLength: 5,
        concat: 'Hello World',
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw on missing module', () => {
      const container = createContainer();

      expect(() => container.execute('require("nonexistent-package")')).toThrow(
        /Cannot find module/
      );
    });

    it('should throw on syntax error', () => {
      const container = createContainer();

      expect(() => container.execute('const x = {')).toThrow();
    });

    it('should propagate runtime errors', () => {
      const container = createContainer();

      expect(() =>
        container.execute(`
        throw new Error('Runtime error');
      `)
      ).toThrow('Runtime error');
    });

    it('should throw on reading non-existent file', () => {
      const container = createContainer();

      expect(() =>
        container.execute(`
        const fs = require('fs');
        fs.readFileSync('/nonexistent.txt');
      `)
      ).toThrow(/ENOENT/);
    });
  });

  describe('Playground Use Case', () => {
    it('should work as an isolated code playground', () => {
      function createPlayground() {
        const container = createContainer();
        const logs: string[] = [];

        // Note: We can't easily capture console in this test setup,
        // so we'll use a different approach
        return {
          run: (code: string) => {
            try {
              // Wrap code to capture output
              const wrappedCode = `
                const _logs = [];
                const _console = {
                  log: (...args) => _logs.push('[log] ' + args.join(' ')),
                  error: (...args) => _logs.push('[error] ' + args.join(' ')),
                  warn: (...args) => _logs.push('[warn] ' + args.join(' ')),
                };
                (function(console) {
                  ${code}
                })(_console);
                module.exports = { _logs, _result: typeof result !== 'undefined' ? result : undefined };
              `;
              const { exports } = container.execute(wrappedCode);
              const exp = exports as { _logs: string[]; _result?: unknown };
              return { success: true, logs: exp._logs, result: exp._result };
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                logs: [],
              };
            }
          },
          reset: () => {
            container.runtime.clearCache();
          },
        };
      }

      const playground = createPlayground();

      // Test successful execution
      const result1 = playground.run(`
        console.log('Hello');
        console.log('World');
        const result = 42;
      `);
      expect(result1.success).toBe(true);
      expect(result1.logs).toContain('[log] Hello');
      expect(result1.logs).toContain('[log] World');

      // Test error handling
      const result2 = playground.run(`
        throw new Error('Oops!');
      `);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('Oops!');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle a multi-file application', () => {
      const container = createContainer();
      const { vfs } = container;

      // Set up a multi-file app structure
      vfs.mkdirSync('/app/src', { recursive: true });
      vfs.mkdirSync('/app/lib', { recursive: true });

      vfs.writeFileSync(
        '/app/package.json',
        JSON.stringify({ name: 'my-app', version: '1.0.0' })
      );

      vfs.writeFileSync('/app/lib/math.js', `
        exports.add = (a, b) => a + b;
        exports.subtract = (a, b) => a - b;
        exports.multiply = (a, b) => a * b;
        exports.divide = (a, b) => a / b;
      `);

      vfs.writeFileSync('/app/lib/string.js', `
        exports.capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
        exports.reverse = (str) => str.split('').reverse().join('');
      `);

      vfs.writeFileSync('/app/src/index.js', `
        const math = require('../lib/math');
        const string = require('../lib/string');
        const pkg = require('../package.json');

        module.exports = {
          name: pkg.name,
          version: pkg.version,
          calculations: {
            sum: math.add(10, 5),
            diff: math.subtract(10, 5),
            product: math.multiply(10, 5),
            quotient: math.divide(10, 5),
          },
          strings: {
            capitalized: string.capitalize('hello'),
            reversed: string.reverse('hello'),
          },
        };
      `);

      const result = container.runFile('/app/src/index.js');

      expect(result.exports).toEqual({
        name: 'my-app',
        version: '1.0.0',
        calculations: {
          sum: 15,
          diff: 5,
          product: 50,
          quotient: 2,
        },
        strings: {
          capitalized: 'Hello',
          reversed: 'olleh',
        },
      });
    });

    it('should handle circular dependencies gracefully', () => {
      const container = createContainer();
      const { vfs } = container;

      vfs.writeFileSync('/a.js', `
        exports.name = 'a';
        const b = require('./b');
        exports.b = b.name;
      `);

      vfs.writeFileSync('/b.js', `
        exports.name = 'b';
        const a = require('./a');
        exports.a = a.name;
      `);

      const result = container.execute(`
        const a = require('./a');
        const b = require('./b');
        module.exports = {
          aName: a.name,
          aBRef: a.b,
          bName: b.name,
          bARef: b.a,
        };
      `);

      expect(result.exports).toEqual({
        aName: 'a',
        aBRef: 'b',
        bName: 'b',
        bARef: 'a',
      });
    });
  });
});
