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
});
