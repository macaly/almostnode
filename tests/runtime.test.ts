import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import { Runtime, execute } from '../src/runtime';

describe('Runtime', () => {
  let vfs: VirtualFS;
  let runtime: Runtime;

  beforeEach(() => {
    vfs = new VirtualFS();
    runtime = new Runtime(vfs);
  });

  describe('basic execution', () => {
    it('should execute simple code', () => {
      const { exports } = runtime.execute('module.exports = 42;');
      expect(exports).toBe(42);
    });

    it('should provide __filename and __dirname', () => {
      const { exports } = runtime.execute(`
        module.exports = { filename: __filename, dirname: __dirname };
      `, '/test/file.js');
      expect(exports).toEqual({
        filename: '/test/file.js',
        dirname: '/test',
      });
    });

    it('should handle exports object', () => {
      const { exports } = runtime.execute(`
        exports.foo = 'bar';
        exports.num = 123;
      `);
      expect(exports).toEqual({ foo: 'bar', num: 123 });
    });

    it('should handle module.exports object', () => {
      const { exports } = runtime.execute(`
        module.exports = { hello: 'world' };
      `);
      expect(exports).toEqual({ hello: 'world' });
    });
  });

  describe('fs shim', () => {
    it('should provide fs module', () => {
      const { exports } = runtime.execute(`
        const fs = require('fs');
        module.exports = typeof fs.readFileSync;
      `);
      expect(exports).toBe('function');
    });

    it('should read and write files', () => {
      runtime.execute(`
        const fs = require('fs');
        fs.writeFileSync('/output.txt', 'hello from script');
      `);

      expect(vfs.readFileSync('/output.txt', 'utf8')).toBe('hello from script');
    });

    it('should check file existence', () => {
      vfs.writeFileSync('/exists.txt', 'content');

      const { exports } = runtime.execute(`
        const fs = require('fs');
        module.exports = {
          exists: fs.existsSync('/exists.txt'),
          notExists: fs.existsSync('/nonexistent.txt'),
        };
      `);

      expect(exports).toEqual({ exists: true, notExists: false });
    });

    it('should create directories', () => {
      runtime.execute(`
        const fs = require('fs');
        fs.mkdirSync('/mydir');
        fs.mkdirSync('/deep/nested/dir', { recursive: true });
      `);

      expect(vfs.existsSync('/mydir')).toBe(true);
      expect(vfs.existsSync('/deep/nested/dir')).toBe(true);
    });

    it('should list directory contents', () => {
      vfs.writeFileSync('/dir/a.txt', '');
      vfs.writeFileSync('/dir/b.txt', '');

      const { exports } = runtime.execute(`
        const fs = require('fs');
        module.exports = fs.readdirSync('/dir').sort();
      `);

      expect(exports).toEqual(['a.txt', 'b.txt']);
    });
  });

  describe('path shim', () => {
    it('should provide path module', () => {
      const { exports } = runtime.execute(`
        const path = require('path');
        module.exports = {
          join: path.join('/foo', 'bar', 'baz'),
          dirname: path.dirname('/foo/bar/file.js'),
          basename: path.basename('/foo/bar/file.js'),
          extname: path.extname('/foo/bar/file.js'),
        };
      `);

      expect(exports).toEqual({
        join: '/foo/bar/baz',
        dirname: '/foo/bar',
        basename: 'file.js',
        extname: '.js',
      });
    });

    it('should resolve paths', () => {
      const { exports } = runtime.execute(`
        const path = require('path');
        module.exports = path.resolve('/foo/bar', '../baz', 'file.js');
      `);

      expect(exports).toBe('/foo/baz/file.js');
    });
  });

  describe('process shim', () => {
    it('should provide process object', () => {
      const { exports } = runtime.execute(`
        module.exports = {
          cwd: process.cwd(),
          platform: process.platform,
          hasEnv: typeof process.env === 'object',
        };
      `);

      expect(exports).toEqual({
        cwd: '/',
        platform: 'linux', // Pretend to be linux for Node.js compatibility
        hasEnv: true,
      });
    });

    it('should provide process via require', () => {
      const { exports } = runtime.execute(`
        const proc = require('process');
        module.exports = proc.cwd();
      `);

      expect(exports).toBe('/');
    });

    it('should have EventEmitter methods on process', () => {
      const { exports } = runtime.execute(`
        let called = false;
        process.once('test-event', (arg) => {
          called = arg;
        });
        process.emit('test-event', 'hello');
        module.exports = {
          called,
          hasOn: typeof process.on === 'function',
          hasOnce: typeof process.once === 'function',
          hasEmit: typeof process.emit === 'function',
          hasOff: typeof process.off === 'function',
        };
      `);

      expect(exports).toEqual({
        called: 'hello',
        hasOn: true,
        hasOnce: true,
        hasEmit: true,
        hasOff: true,
      });
    });

    it('should allow custom environment variables', () => {
      const customRuntime = new Runtime(vfs, {
        env: { MY_VAR: 'my_value', NODE_ENV: 'test' },
      });

      const { exports } = customRuntime.execute(`
        module.exports = {
          myVar: process.env.MY_VAR,
          nodeEnv: process.env.NODE_ENV,
        };
      `);

      expect(exports).toEqual({
        myVar: 'my_value',
        nodeEnv: 'test',
      });
    });
  });

  describe('module resolution', () => {
    it('should resolve relative modules', () => {
      vfs.writeFileSync('/lib/helper.js', 'module.exports = { value: 42 };');

      const { exports } = runtime.execute(`
        const helper = require('./lib/helper');
        module.exports = helper.value;
      `);

      expect(exports).toBe(42);
    });

    it('should resolve modules with .js extension', () => {
      vfs.writeFileSync('/lib/mod.js', 'module.exports = "found";');

      const { exports } = runtime.execute(`
        module.exports = require('./lib/mod.js');
      `);

      expect(exports).toBe('found');
    });

    it('should resolve modules without extension', () => {
      vfs.writeFileSync('/lib/noext.js', 'module.exports = "no ext";');

      const { exports } = runtime.execute(`
        module.exports = require('./lib/noext');
      `);

      expect(exports).toBe('no ext');
    });

    it('should resolve JSON modules', () => {
      vfs.writeFileSync('/data.json', '{"key": "value", "num": 123}');

      const { exports } = runtime.execute(`
        const data = require('./data.json');
        module.exports = data;
      `);

      expect(exports).toEqual({ key: 'value', num: 123 });
    });

    it('should resolve directory with index.js', () => {
      vfs.writeFileSync('/lib/index.js', 'module.exports = "from index";');

      const { exports } = runtime.execute(`
        module.exports = require('./lib');
      `);

      expect(exports).toBe('from index');
    });

    it('should resolve node_modules packages', () => {
      vfs.writeFileSync(
        '/node_modules/my-pkg/package.json',
        '{"name": "my-pkg", "main": "main.js"}'
      );
      vfs.writeFileSync(
        '/node_modules/my-pkg/main.js',
        'module.exports = "from package";'
      );

      const { exports } = runtime.execute(`
        module.exports = require('my-pkg');
      `);

      expect(exports).toBe('from package');
    });

    it('should resolve node_modules with index.js fallback', () => {
      vfs.writeFileSync(
        '/node_modules/simple-pkg/index.js',
        'module.exports = "simple";'
      );

      const { exports } = runtime.execute(`
        module.exports = require('simple-pkg');
      `);

      expect(exports).toBe('simple');
    });

    it('should cache modules', () => {
      vfs.writeFileSync('/counter.js', `
        let count = 0;
        module.exports = { increment: () => ++count, getCount: () => count };
      `);

      const { exports } = runtime.execute(`
        const counter1 = require('./counter');
        const counter2 = require('./counter');
        counter1.increment();
        counter1.increment();
        module.exports = {
          sameInstance: counter1 === counter2,
          count: counter2.getCount(),
        };
      `);

      expect(exports).toEqual({ sameInstance: true, count: 2 });
    });

    it('should throw on missing module', () => {
      expect(() =>
        runtime.execute('require("nonexistent-module");')
      ).toThrow(/Cannot find module/);
    });
  });

  describe('console capture', () => {
    it('should capture console output', () => {
      const logs: Array<{ method: string; args: unknown[] }> = [];

      const captureRuntime = new Runtime(vfs, {
        onConsole: (method, args) => logs.push({ method, args }),
      });

      captureRuntime.execute(`
        console.log('hello', 'world');
        console.error('error message');
        console.warn('warning');
      `);

      expect(logs).toContainEqual({ method: 'log', args: ['hello', 'world'] });
      expect(logs).toContainEqual({ method: 'error', args: ['error message'] });
      expect(logs).toContainEqual({ method: 'warn', args: ['warning'] });
    });
  });

  describe('runFile', () => {
    it('should run a file from the virtual file system', () => {
      vfs.writeFileSync('/app.js', 'module.exports = "app output";');

      const { exports } = runtime.runFile('/app.js');

      expect(exports).toBe('app output');
    });
  });

  describe('execute helper function', () => {
    it('should execute code with a new runtime', () => {
      const testVfs = new VirtualFS();
      const { exports } = execute('module.exports = "executed";', testVfs);
      expect(exports).toBe('executed');
    });
  });

  describe('clearCache', () => {
    it('should allow reloading modules after cache clear', () => {
      vfs.writeFileSync('/module.js', 'module.exports = 1;');

      const result1 = runtime.execute('module.exports = require("./module");');
      expect(result1.exports).toBe(1);

      // Modify the file
      vfs.writeFileSync('/module.js', 'module.exports = 2;');

      // Without clearing cache, still returns old value
      const result2 = runtime.execute('module.exports = require("./module");');
      expect(result2.exports).toBe(1);

      // After clearing cache, returns new value
      runtime.clearCache();
      const result3 = runtime.execute('module.exports = require("./module");');
      expect(result3.exports).toBe(2);
    });
  });

  describe('module resolution caching', () => {
    it('should resolve the same module path consistently', () => {
      vfs.writeFileSync('/lib/util.js', 'module.exports = { name: "util" };');

      // First require should resolve and cache the path
      const result1 = runtime.execute(`
        const util1 = require('./lib/util');
        const util2 = require('./lib/util');
        module.exports = util1 === util2;
      `);

      // Both requires should return the same cached module
      expect(result1.exports).toBe(true);
    });

    it('should cache module resolution across multiple files', () => {
      vfs.writeFileSync('/shared.js', 'module.exports = { count: 0 };');
      vfs.writeFileSync('/a.js', `
        const shared = require('./shared');
        shared.count++;
        module.exports = shared;
      `);
      vfs.writeFileSync('/b.js', `
        const shared = require('./shared');
        shared.count++;
        module.exports = shared;
      `);

      const result = runtime.execute(`
        const a = require('./a');
        const b = require('./b');
        module.exports = { aCount: a.count, bCount: b.count, same: a === b };
      `);

      // Both should reference the same cached module
      expect((result.exports as any).same).toBe(true);
      expect((result.exports as any).bCount).toBe(2); // Incremented twice
    });

    it('should handle resolution cache for non-existent modules', () => {
      // First attempt should fail
      expect(() => {
        runtime.execute('require("./nonexistent")');
      }).toThrow(/Cannot find module/);

      // Second attempt should also fail (cached negative result)
      expect(() => {
        runtime.execute('require("./nonexistent")');
      }).toThrow(/Cannot find module/);

      // Now create the module
      vfs.writeFileSync('/nonexistent.js', 'module.exports = "found";');

      // After cache clear, should find the module
      runtime.clearCache();
      const result = runtime.execute('module.exports = require("./nonexistent");');
      expect(result.exports).toBe('found');
    });
  });

  describe('processed code caching', () => {
    it('should reuse processed code when module cache is cleared but content unchanged', () => {
      // Create a simple CJS module
      vfs.writeFileSync('/cached-module.js', 'module.exports = { value: 42 };');

      // First execution
      const result1 = runtime.execute(`
        const mod = require('./cached-module.js');
        module.exports = mod.value;
      `);
      expect(result1.exports).toBe(42);

      // Clear module cache
      runtime.clearCache();

      // Second execution - module needs to be re-required but code processing is cached
      const result2 = runtime.execute(`
        const mod = require('./cached-module.js');
        module.exports = mod.value;
      `);
      expect(result2.exports).toBe(42);
    });

    it('should reprocess code when content changes', () => {
      vfs.writeFileSync('/changeable.js', 'module.exports = { num: 1 };');

      const result1 = runtime.execute(`
        const mod = require('./changeable.js');
        module.exports = mod.num;
      `);
      expect(result1.exports).toBe(1);

      // Modify the file
      vfs.writeFileSync('/changeable.js', 'module.exports = { num: 2 };');

      // Clear module cache to force re-require
      runtime.clearCache();

      // Should get new value (code was reprocessed due to content change)
      const result2 = runtime.execute(`
        const mod = require('./changeable.js');
        module.exports = mod.num;
      `);
      expect(result2.exports).toBe(2);
    });

    it('should handle ESM to CJS transformation caching', () => {
      // Create a file with ESM syntax in /esm/ directory (triggers transformation)
      vfs.mkdirSync('/esm', { recursive: true });
      vfs.writeFileSync('/esm/helper.js', `
        export const multiply = (a, b) => a * b;
        export const add = (a, b) => a + b;
      `);

      const result1 = runtime.execute(`
        const helper = require('./esm/helper.js');
        module.exports = helper.multiply(3, 4);
      `);
      expect(result1.exports).toBe(12);

      // Clear module cache
      runtime.clearCache();

      // The transformed code should still work after cache clear
      const result2 = runtime.execute(`
        const helper = require('./esm/helper.js');
        module.exports = helper.add(10, 5);
      `);
      expect(result2.exports).toBe(15);
    });
  });

  describe('createREPL', () => {
    it('should return expression values', () => {
      const repl = runtime.createREPL();
      expect(repl.eval('1 + 2')).toBe(3);
      expect(repl.eval('"hello".toUpperCase()')).toBe('HELLO');
    });

    it('should persist variables across calls', () => {
      const repl = runtime.createREPL();
      repl.eval('var x = 42');
      expect(repl.eval('x')).toBe(42);
    });

    it('should persist const/let as var', () => {
      const repl = runtime.createREPL();
      repl.eval('const a = 1');
      expect(repl.eval('a')).toBe(1);
      repl.eval('let b = 2');
      expect(repl.eval('b')).toBe(2);
    });

    it('should have access to require', () => {
      const repl = runtime.createREPL();
      expect(repl.eval("require('path').join('/foo', 'bar')")).toBe('/foo/bar');
    });

    it('should have access to Buffer', () => {
      const repl = runtime.createREPL();
      const result = repl.eval("Buffer.from('hello').toString('base64')");
      expect(result).toBe('aGVsbG8=');
    });

    it('should have access to process', () => {
      const repl = runtime.createREPL();
      expect(repl.eval('typeof process')).toBe('object');
      expect(repl.eval('typeof process.env')).toBe('object');
    });

    it('should handle require("fs") read/write', () => {
      vfs.mkdirSync('/repl-test', { recursive: true });
      const repl = runtime.createREPL();
      repl.eval("var fs = require('fs')");
      repl.eval("fs.writeFileSync('/repl-test/hello.txt', 'Hello REPL!')");
      expect(repl.eval("fs.readFileSync('/repl-test/hello.txt', 'utf8')")).toBe('Hello REPL!');
    });

    it('should throw on invalid code', () => {
      const repl = runtime.createREPL();
      expect(() => repl.eval('undefined_var')).toThrow();
    });

    it('should handle multi-statement code', () => {
      const repl = runtime.createREPL();
      const result = repl.eval("var a = 1; var b = 2; a + b");
      expect(result).toBe(3);
    });

    it('should capture console.log via onConsole', () => {
      const logs: string[][] = [];
      const rt = new Runtime(vfs, {
        onConsole: (method, args) => { logs.push(args.map(String)); },
      });
      const repl = rt.createREPL();
      repl.eval("console.log('hello from repl')");
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain('hello from repl');
    });

    it('should isolate separate REPL instances', () => {
      const repl1 = runtime.createREPL();
      const repl2 = runtime.createREPL();
      repl1.eval('var x = 100');
      expect(repl1.eval('x')).toBe(100);
      expect(() => repl2.eval('x')).toThrow();
    });
  });

  describe('browser field in package.json', () => {
    it('should prefer browser field (string) over main for package entry', () => {
      // Simulate depd's package.json: "browser": "lib/browser/index.js"
      vfs.writeFileSync('/node_modules/testpkg/package.json', JSON.stringify({
        name: 'testpkg',
        browser: 'lib/browser/index.js',
        main: 'index.js',
      }));
      vfs.writeFileSync('/node_modules/testpkg/index.js', 'module.exports = "node";');
      vfs.writeFileSync('/node_modules/testpkg/lib/browser/index.js', 'module.exports = "browser";');

      const { exports } = runtime.execute('module.exports = require("testpkg");');
      expect(exports).toBe('browser');
    });

    it('should fall back to main when browser field is not set', () => {
      vfs.writeFileSync('/node_modules/nopkg/package.json', JSON.stringify({
        name: 'nopkg',
        main: 'lib/main.js',
      }));
      vfs.writeFileSync('/node_modules/nopkg/lib/main.js', 'module.exports = "main";');

      const { exports } = runtime.execute('module.exports = require("nopkg");');
      expect(exports).toBe('main');
    });

    it('should fall back to index.js when neither browser nor main is set', () => {
      vfs.writeFileSync('/node_modules/defpkg/package.json', JSON.stringify({
        name: 'defpkg',
      }));
      vfs.writeFileSync('/node_modules/defpkg/index.js', 'module.exports = "default";');

      const { exports } = runtime.execute('module.exports = require("defpkg");');
      expect(exports).toBe('default');
    });
  });

  describe('Error.captureStackTrace polyfill', () => {
    it('should provide CallSite objects when prepareStackTrace is set', () => {
      // Save and remove native captureStackTrace to test polyfill
      const origCapture = (Error as any).captureStackTrace;
      const origPrepare = (Error as any).prepareStackTrace;
      delete (Error as any).captureStackTrace;
      delete (Error as any).prepareStackTrace;

      try {
        // Create a fresh runtime which will install the polyfill
        const testVfs = new VirtualFS();
        new Runtime(testVfs);

        // Verify polyfill was installed
        expect(typeof (Error as any).captureStackTrace).toBe('function');

        // Test the depd pattern: set prepareStackTrace, call captureStackTrace, read .stack
        const obj: any = {};
        (Error as any).prepareStackTrace = (_err: any, stack: any[]) => stack;
        (Error as any).captureStackTrace(obj);

        // obj.stack should be an array of CallSite-like objects
        expect(Array.isArray(obj.stack)).toBe(true);
        if (obj.stack.length > 0) {
          const callSite = obj.stack[0];
          expect(typeof callSite.getFileName).toBe('function');
          expect(typeof callSite.getLineNumber).toBe('function');
          expect(typeof callSite.getColumnNumber).toBe('function');
          expect(typeof callSite.getFunctionName).toBe('function');
          expect(typeof callSite.isNative).toBe('function');
          expect(typeof callSite.isEval).toBe('function');
          expect(typeof callSite.toString).toBe('function');
        }
      } finally {
        // Restore native captureStackTrace
        (Error as any).captureStackTrace = origCapture;
        (Error as any).prepareStackTrace = origPrepare;
      }
    });

    it('should set stackTraceLimit when polyfilling', () => {
      const origCapture = (Error as any).captureStackTrace;
      const origLimit = (Error as any).stackTraceLimit;
      delete (Error as any).captureStackTrace;
      delete (Error as any).stackTraceLimit;

      try {
        const testVfs = new VirtualFS();
        new Runtime(testVfs);
        expect((Error as any).stackTraceLimit).toBe(10);
      } finally {
        (Error as any).captureStackTrace = origCapture;
        (Error as any).stackTraceLimit = origLimit;
      }
    });
  });
});
