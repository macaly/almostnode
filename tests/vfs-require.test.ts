import { describe, it, expect } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import { createVfsRequire } from '../src/frameworks/vfs-require';
import { executeApiHandler, createMockRequest, createMockResponse } from '../src/frameworks/next-api-handler';

// ─── Helper ──────────────────────────────────────────────────────────────────

function setupVfs() {
  const vfs = new VirtualFS();
  return vfs;
}

function createRequire(vfs: VirtualFS, fromDir = '/', builtinModules: Record<string, unknown> = {}) {
  const { require, moduleCache } = createVfsRequire(vfs, fromDir, {
    builtinModules,
    process: { env: {}, cwd: () => '/', platform: 'browser' },
  });
  return { require, moduleCache };
}

// ─── Resolution ──────────────────────────────────────────────────────────────

describe('VFS require — resolution', () => {
  it('resolves bare package import from /node_modules/', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/my-pkg', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/my-pkg/package.json',
      JSON.stringify({ name: 'my-pkg', main: 'index.js' })
    );
    vfs.writeFileSync('/node_modules/my-pkg/index.js', 'module.exports = "hello";');

    const { require } = createRequire(vfs);
    expect(require('my-pkg')).toBe('hello');
  });

  it('resolves from package.json main field', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/custom-main', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/custom-main/package.json',
      JSON.stringify({ name: 'custom-main', main: 'lib/entry.js' })
    );
    vfs.mkdirSync('/node_modules/custom-main/lib', { recursive: true });
    vfs.writeFileSync('/node_modules/custom-main/lib/entry.js', 'module.exports = 42;');

    const { require } = createRequire(vfs);
    expect(require('custom-main')).toBe(42);
  });

  it('resolves from package.json exports field', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/exports-pkg', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/exports-pkg/package.json',
      JSON.stringify({
        name: 'exports-pkg',
        exports: { '.': { require: './dist/index.cjs.js' } },
      })
    );
    vfs.mkdirSync('/node_modules/exports-pkg/dist', { recursive: true });
    vfs.writeFileSync('/node_modules/exports-pkg/dist/index.cjs.js', 'module.exports = "from-exports";');

    const { require } = createRequire(vfs);
    expect(require('exports-pkg')).toBe('from-exports');
  });

  it('resolves scoped packages (@scope/pkg)', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/@my-scope/my-lib', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/@my-scope/my-lib/package.json',
      JSON.stringify({ name: '@my-scope/my-lib', main: 'index.js' })
    );
    vfs.writeFileSync('/node_modules/@my-scope/my-lib/index.js', 'module.exports = "scoped";');

    const { require } = createRequire(vfs);
    expect(require('@my-scope/my-lib')).toBe('scoped');
  });

  it('resolves sub-path imports (pkg/sub)', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/utils/lib', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/utils/package.json',
      JSON.stringify({ name: 'utils' })
    );
    vfs.writeFileSync('/node_modules/utils/lib/helper.js', 'module.exports = "sub-path";');

    const { require } = createRequire(vfs);
    expect(require('utils/lib/helper')).toBe('sub-path');
  });

  it('resolves relative paths', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/project/lib', { recursive: true });
    vfs.writeFileSync('/project/lib/utils.js', 'module.exports = "relative";');

    const { require } = createRequire(vfs, '/project');
    expect(require('./lib/utils')).toBe('relative');
  });

  it('resolves JSON files', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/json-pkg', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/json-pkg/package.json',
      JSON.stringify({ name: 'json-pkg', main: 'data.json' })
    );
    vfs.writeFileSync('/node_modules/json-pkg/data.json', JSON.stringify({ key: 'value' }));

    const { require } = createRequire(vfs);
    expect(require('json-pkg')).toEqual({ key: 'value' });
  });

  it('throws on missing modules', () => {
    const vfs = setupVfs();
    const { require } = createRequire(vfs);
    expect(() => require('nonexistent')).toThrow("Cannot find module 'nonexistent'");
  });

  it('skips CJS stub files starting with throw', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/esm-only', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/esm-only/package.json',
      JSON.stringify({
        name: 'esm-only',
        exports: {
          '.': {
            require: './index.cjs',
            import: './index.mjs',
          },
        },
      })
    );
    vfs.writeFileSync('/node_modules/esm-only/index.cjs', 'throw new Error("CJS not supported");');
    // ESM file with import/export will get transformed
    vfs.writeFileSync('/node_modules/esm-only/index.mjs', 'module.exports = "esm-fallback";');

    const { require } = createRequire(vfs);
    expect(require('esm-only')).toBe('esm-fallback');
  });

  it('resolves directory with index.js', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/dir-pkg/lib', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/dir-pkg/package.json',
      JSON.stringify({ name: 'dir-pkg', main: './lib' })
    );
    vfs.writeFileSync('/node_modules/dir-pkg/lib/index.js', 'module.exports = "from-index";');

    const { require } = createRequire(vfs);
    expect(require('dir-pkg')).toBe('from-index');
  });

  it('resolves browser field over main', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/browser-pkg', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/browser-pkg/package.json',
      JSON.stringify({ name: 'browser-pkg', main: 'node.js', browser: 'browser.js' })
    );
    vfs.writeFileSync('/node_modules/browser-pkg/node.js', 'module.exports = "node";');
    vfs.writeFileSync('/node_modules/browser-pkg/browser.js', 'module.exports = "browser";');

    const { require } = createRequire(vfs);
    expect(require('browser-pkg')).toBe('browser');
  });
});

// ─── Loading ─────────────────────────────────────────────────────────────────

describe('VFS require — loading', () => {
  it('loads and executes CJS modules', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/cjs-mod', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/cjs-mod/package.json',
      JSON.stringify({ name: 'cjs-mod', main: 'index.js' })
    );
    vfs.writeFileSync(
      '/node_modules/cjs-mod/index.js',
      'var x = 1 + 2; module.exports = { sum: x, name: "cjs" };'
    );

    const { require } = createRequire(vfs);
    expect(require('cjs-mod')).toEqual({ sum: 3, name: 'cjs' });
  });

  it('caches modules (same object returned on re-require)', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/cached-mod', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/cached-mod/package.json',
      JSON.stringify({ name: 'cached-mod', main: 'index.js' })
    );
    vfs.writeFileSync('/node_modules/cached-mod/index.js', 'module.exports = { val: Math.random() };');

    const { require } = createRequire(vfs);
    const first = require('cached-mod');
    const second = require('cached-mod');
    expect(first).toBe(second); // Same object reference
  });

  it('supports circular dependencies (partial exports)', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/lib', { recursive: true });
    vfs.writeFileSync('/lib/a.js', `
      exports.name = "a";
      var b = require("./b");
      exports.bName = b.name;
    `);
    vfs.writeFileSync('/lib/b.js', `
      exports.name = "b";
      var a = require("./a");
      exports.aName = a.name;
    `);

    const { require } = createRequire(vfs, '/lib');
    const a = require('./a') as any;
    expect(a.name).toBe('a');
    expect(a.bName).toBe('b');
  });

  it('handles nested requires (package A requires package B)', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/pkg-a', { recursive: true });
    vfs.mkdirSync('/node_modules/pkg-b', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/pkg-a/package.json',
      JSON.stringify({ name: 'pkg-a', main: 'index.js' })
    );
    vfs.writeFileSync(
      '/node_modules/pkg-b/package.json',
      JSON.stringify({ name: 'pkg-b', main: 'index.js' })
    );
    vfs.writeFileSync('/node_modules/pkg-b/index.js', 'module.exports = 100;');
    vfs.writeFileSync(
      '/node_modules/pkg-a/index.js',
      'var b = require("pkg-b"); module.exports = b + 1;'
    );

    const { require } = createRequire(vfs);
    expect(require('pkg-a')).toBe(101);
  });

  it('strips shebangs', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/shebang-pkg', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/shebang-pkg/package.json',
      JSON.stringify({ name: 'shebang-pkg', main: 'index.js' })
    );
    vfs.writeFileSync(
      '/node_modules/shebang-pkg/index.js',
      '#!/usr/bin/env node\nmodule.exports = "shebang-stripped";'
    );

    const { require } = createRequire(vfs);
    expect(require('shebang-pkg')).toBe('shebang-stripped');
  });

  it('applies ESM→CJS safety-net transform', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/esm-mod', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/esm-mod/package.json',
      JSON.stringify({ name: 'esm-mod', main: 'index.js' })
    );
    // ESM code that wasn't pre-transformed
    // transformEsmToCjsSimple converts `export default function X()` to `module.exports = function X()`
    vfs.writeFileSync(
      '/node_modules/esm-mod/index.js',
      'export default function greet() { return "hi"; }'
    );

    const { require } = createRequire(vfs);
    const mod = require('esm-mod') as any;
    // transformEsmToCjsSimple sets module.exports directly (not .default)
    expect(typeof mod).toBe('function');
    expect(mod()).toBe('hi');
  });

  it('provides __filename and __dirname to modules', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/meta-mod', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/meta-mod/package.json',
      JSON.stringify({ name: 'meta-mod', main: 'index.js' })
    );
    vfs.writeFileSync(
      '/node_modules/meta-mod/index.js',
      'module.exports = { file: __filename, dir: __dirname };'
    );

    const { require } = createRequire(vfs);
    const mod = require('meta-mod') as any;
    expect(mod.file).toBe('/node_modules/meta-mod/index.js');
    expect(mod.dir).toBe('/node_modules/meta-mod');
  });

  it('provides process object to modules', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/env-mod', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/env-mod/package.json',
      JSON.stringify({ name: 'env-mod', main: 'index.js' })
    );
    vfs.writeFileSync(
      '/node_modules/env-mod/index.js',
      'module.exports = process.env.MY_VAR;'
    );

    const { require: vfsRequire } = createVfsRequire(vfs, '/', {
      builtinModules: {},
      process: { env: { MY_VAR: 'hello-env' }, cwd: () => '/' },
    });

    expect(vfsRequire('env-mod')).toBe('hello-env');
  });
});

// ─── Builtins priority ──────────────────────────────────────────────────────

describe('VFS require — builtins', () => {
  it('returns builtins before checking VFS', () => {
    const vfs = setupVfs();
    // Create a package with same name as a builtin
    vfs.mkdirSync('/node_modules/path', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/path/package.json',
      JSON.stringify({ name: 'path', main: 'index.js' })
    );
    vfs.writeFileSync('/node_modules/path/index.js', 'module.exports = "vfs-path";');

    const fakePathModule = { join: () => 'fake' };
    const { require } = createRequire(vfs, '/', { path: fakePathModule });
    expect(require('path')).toBe(fakePathModule);
  });

  it('strips node: prefix for builtins', () => {
    const fakeFs = { readFileSync: () => 'mock' };
    const vfs = setupVfs();
    const { require } = createRequire(vfs, '/', { fs: fakeFs });
    expect(require('node:fs')).toBe(fakeFs);
  });
});

// ─── Integration with executeApiHandler ─────────────────────────────────────

describe('VFS require — integration with executeApiHandler', () => {
  it('API handler can require() a package from VFS node_modules', async () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/my-util', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/my-util/package.json',
      JSON.stringify({ name: 'my-util', main: 'index.js' })
    );
    vfs.writeFileSync('/node_modules/my-util/index.js', 'module.exports = { greet: function(n) { return "Hello " + n; } };');

    const builtins: Record<string, unknown> = {};
    const { require: vfsRequire } = createVfsRequire(vfs, '/', {
      builtinModules: builtins,
      process: { env: {}, cwd: () => '/' },
    });

    const handlerCode = `
      var util = require('my-util');
      module.exports.default = function(req, res) {
        res.json({ message: util.greet('World') });
      };
    `;

    const req = createMockRequest('GET', '/api/test', {});
    const res = createMockResponse();
    await executeApiHandler(handlerCode, req, res, {}, builtins, vfsRequire);

    const response = res.toResponse();
    expect(JSON.parse(response.body.toString())).toEqual({ message: 'Hello World' });
  });

  it('builtins take priority over VFS packages in handler', async () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/path', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/path/package.json',
      JSON.stringify({ name: 'path', main: 'index.js' })
    );
    vfs.writeFileSync('/node_modules/path/index.js', 'module.exports = { join: function() { return "vfs"; } };');

    const builtins: Record<string, unknown> = {
      path: { join: (...args: string[]) => args.join('/') },
    };
    const { require: vfsRequire } = createVfsRequire(vfs, '/', {
      builtinModules: builtins,
      process: { env: {}, cwd: () => '/' },
    });

    const handlerCode = `
      var path = require('path');
      module.exports.default = function(req, res) {
        res.json({ result: path.join('a', 'b') });
      };
    `;

    const req = createMockRequest('GET', '/api/test', {});
    const res = createMockResponse();
    await executeApiHandler(handlerCode, req, res, {}, builtins, vfsRequire);

    const response = res.toResponse();
    expect(JSON.parse(response.body.toString())).toEqual({ result: 'a/b' });
  });

  it('works without vfsRequire (backward compat)', async () => {
    const builtins: Record<string, unknown> = {};

    const handlerCode = `
      module.exports.default = function(req, res) {
        res.json({ ok: true });
      };
    `;

    const req = createMockRequest('GET', '/api/test', {});
    const res = createMockResponse();
    await executeApiHandler(handlerCode, req, res, {}, builtins);

    const response = res.toResponse();
    expect(JSON.parse(response.body.toString())).toEqual({ ok: true });
  });

  it('throws when module not found and no vfsRequire', async () => {
    const builtins: Record<string, unknown> = {};

    const handlerCode = `
      var pkg = require('nonexistent');
      module.exports.default = function(req, res) {
        res.json({ ok: true });
      };
    `;

    const req = createMockRequest('GET', '/api/test', {});
    const res = createMockResponse();
    await expect(
      executeApiHandler(handlerCode, req, res, {}, builtins)
    ).rejects.toThrow('Module not found: nonexistent');
  });
});

// ─── CORS proxy ──────────────────────────────────────────────────────────────

describe('VFS require — CORS proxy via process.env', () => {
  it('process.env.CORS_PROXY_URL is available to loaded modules', () => {
    const vfs = setupVfs();
    vfs.mkdirSync('/node_modules/proxy-check', { recursive: true });
    vfs.writeFileSync(
      '/node_modules/proxy-check/package.json',
      JSON.stringify({ name: 'proxy-check', main: 'index.js' })
    );
    vfs.writeFileSync(
      '/node_modules/proxy-check/index.js',
      'module.exports = process.env.CORS_PROXY_URL;'
    );

    const { require: vfsRequire } = createVfsRequire(vfs, '/', {
      builtinModules: {},
      process: {
        env: { CORS_PROXY_URL: 'https://proxy.example.com/?' },
        cwd: () => '/',
      },
    });

    expect(vfsRequire('proxy-check')).toBe('https://proxy.example.com/?');
  });
});
