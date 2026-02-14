import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';

// Mock the esbuild build function since esbuild-wasm is not available in test env
vi.mock('../src/shims/esbuild', () => ({
  build: vi.fn(),
  setVFS: vi.fn(),
}));

import { bundleNpmModuleForBrowser, clearNpmBundleCache, initNpmServe } from '../src/frameworks/npm-serve';
import { build } from '../src/shims/esbuild';

const mockBuild = vi.mocked(build);

/**
 * Helper: create a VFS with a realistic package structure and init npm-serve.
 * Returns the VFS so tests can inspect or extend it.
 */
function setupVFS(): VirtualFS {
  const vfs = new VirtualFS();
  initNpmServe(vfs);
  return vfs;
}

/**
 * Helper: create a package in VFS node_modules with given package.json fields
 * and optional file stubs.
 */
function addPackage(
  vfs: VirtualFS,
  name: string,
  pkgJson: Record<string, unknown>,
  files: Record<string, string> = {},
): void {
  const dir = '/node_modules/' + name;
  vfs.mkdirSync(dir, { recursive: true });
  vfs.writeFileSync(dir + '/package.json', JSON.stringify({ name, ...pkgJson }));
  for (const [path, content] of Object.entries(files)) {
    const fullPath = dir + '/' + path;
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    vfs.mkdirSync(parentDir, { recursive: true });
    vfs.writeFileSync(fullPath, content);
  }
}

function mockBuildSuccess(text = 'export default {};') {
  mockBuild.mockResolvedValue({
    errors: [],
    warnings: [],
    outputFiles: [{ path: '', contents: new Uint8Array(), text }],
  });
}

// ── Basic bundling ────────────────────────────────────────────────

describe('bundleNpmModuleForBrowser', () => {
  beforeEach(() => {
    clearNpmBundleCache();
    mockBuild.mockReset();
  });

  it('falls back to stdin when package is not in VFS', async () => {
    setupVFS(); // empty VFS — no packages
    mockBuildSuccess();

    await bundleNpmModuleForBrowser('@ai-sdk/react');

    expect(mockBuild).toHaveBeenCalledOnce();
    const opts = mockBuild.mock.calls[0][0];
    expect(opts.stdin).toBeDefined();
    expect(opts.stdin!.contents).toContain("from '@ai-sdk/react'");
    expect(opts.stdin!.resolveDir).toBe('/node_modules');
    expect(opts.external).toContain('react');
    expect(opts.external).toContain('react-dom');
  });

  it('caches results on second call', async () => {
    setupVFS();
    mockBuildSuccess('cached!');

    const first = await bundleNpmModuleForBrowser('cached-pkg');
    const second = await bundleNpmModuleForBrowser('cached-pkg');

    expect(first).toBe('cached!');
    expect(second).toBe('cached!');
    expect(mockBuild).toHaveBeenCalledOnce();
  });

  it('throws when esbuild produces no output', async () => {
    setupVFS();
    mockBuild.mockResolvedValue({ errors: [], warnings: [], outputFiles: [] });

    await expect(bundleNpmModuleForBrowser('bad-pkg')).rejects.toThrow('no output');
  });

  it('clears cache when clearNpmBundleCache is called', async () => {
    setupVFS();
    mockBuildSuccess('v1');

    await bundleNpmModuleForBrowser('pkg');
    expect(mockBuild).toHaveBeenCalledOnce();

    clearNpmBundleCache();
    mockBuildSuccess('v2');

    const result = await bundleNpmModuleForBrowser('pkg');
    expect(result).toBe('v2');
    expect(mockBuild).toHaveBeenCalledTimes(2);
  });
});

// ── Entry point resolution ────────────────────────────────────────

describe('resolvePackageEntry (via bundleNpmModuleForBrowser)', () => {
  beforeEach(() => {
    clearNpmBundleCache();
    mockBuild.mockReset();
  });

  it('resolves simple string exports', async () => {
    const vfs = setupVFS();
    addPackage(vfs, 'simple-pkg', {
      exports: { '.': './dist/index.js' },
    }, {
      'dist/index.js': 'module.exports = {};',
    });
    mockBuildSuccess();

    await bundleNpmModuleForBrowser('simple-pkg');

    const opts = mockBuild.mock.calls[0][0];
    expect(opts.entryPoints).toEqual(['/node_modules/simple-pkg/dist/index.js']);
    expect(opts.stdin).toBeUndefined();
  });

  it('resolves flat conditional exports (require condition)', async () => {
    const vfs = setupVFS();
    addPackage(vfs, 'flat-cond', {
      exports: {
        '.': {
          require: './dist/cjs/index.js',
          import: './dist/esm/index.mjs',
        },
      },
    }, {
      'dist/cjs/index.js': 'module.exports = {};',
      'dist/esm/index.mjs': 'export default {};',
    });
    mockBuildSuccess();

    await bundleNpmModuleForBrowser('flat-cond');

    const opts = mockBuild.mock.calls[0][0];
    // Should prefer require condition (CJS-first)
    expect(opts.entryPoints).toEqual(['/node_modules/flat-cond/dist/cjs/index.js']);
  });

  it('resolves doubly-nested exports like convex', async () => {
    const vfs = setupVFS();
    // This is the EXACT structure from `npm view convex exports`
    addPackage(vfs, 'convex', {
      exports: {
        '.': {
          import: {
            types: './dist/esm-types/index.d.ts',
            import: './dist/esm/index.js',
          },
          require: {
            types: './dist/cjs-types/index.d.ts',
            require: './dist/cjs/index.js',
          },
        },
        './server': {
          import: {
            types: './dist/esm-types/server/index.d.ts',
            import: './dist/esm/server/index.js',
          },
          require: {
            types: './dist/cjs-types/server/index.d.ts',
            require: './dist/cjs/server/index.js',
          },
        },
        './react': {
          import: {
            types: './dist/esm-types/react/index.d.ts',
            import: './dist/esm/react/index.js',
          },
          require: {
            types: './dist/cjs-types/react/index.d.ts',
            require: './dist/cjs/react/index.js',
          },
        },
        './values': {
          import: {
            types: './dist/esm-types/values/index.d.ts',
            import: './dist/esm/values/index.js',
          },
          require: {
            types: './dist/cjs-types/values/index.d.ts',
            require: './dist/cjs/values/index.js',
          },
        },
      },
    }, {
      // Create the actual files that should be resolved
      'dist/cjs/index.js': 'module.exports = {};',
      'dist/cjs/server/index.js': 'module.exports = {};',
      'dist/cjs/react/index.js': 'module.exports = {};',
      'dist/cjs/values/index.js': 'module.exports = {};',
      'dist/esm/index.js': 'export default {};',
      'dist/esm/server/index.js': 'export default {};',
      'dist/esm/react/index.js': 'export default {};',
      'dist/esm/values/index.js': 'export default {};',
    });
    mockBuildSuccess();

    // Test main entry
    await bundleNpmModuleForBrowser('convex');
    expect(mockBuild.mock.calls[0][0].entryPoints).toEqual([
      '/node_modules/convex/dist/cjs/index.js',
    ]);

    // Test subpath: convex/server
    clearNpmBundleCache();
    mockBuild.mockReset();
    mockBuildSuccess();

    await bundleNpmModuleForBrowser('convex/server');
    expect(mockBuild.mock.calls[0][0].entryPoints).toEqual([
      '/node_modules/convex/dist/cjs/server/index.js',
    ]);

    // Test subpath: convex/react
    clearNpmBundleCache();
    mockBuild.mockReset();
    mockBuildSuccess();

    await bundleNpmModuleForBrowser('convex/react');
    expect(mockBuild.mock.calls[0][0].entryPoints).toEqual([
      '/node_modules/convex/dist/cjs/react/index.js',
    ]);
  });

  it('does NOT resolve a directory as entry point', async () => {
    const vfs = setupVFS();
    // Package with a "server" directory but no matching exports
    addPackage(vfs, 'dir-trap', {
      exports: { '.': './index.js' },
      // No ./server export
    }, {
      'index.js': 'module.exports = {};',
      'server/index.js': 'module.exports = {};', // creates server/ directory
    });
    mockBuildSuccess();

    await bundleNpmModuleForBrowser('dir-trap/server');

    const opts = mockBuild.mock.calls[0][0];
    // Should NOT pass '/node_modules/dir-trap/server' (a directory) as entry
    // Should either resolve to server/index.js or fall back to stdin
    if (opts.entryPoints) {
      expect(opts.entryPoints[0]).not.toBe('/node_modules/dir-trap/server');
    }
  });

  it('resolves subpath to direct file when no exports match', async () => {
    const vfs = setupVFS();
    addPackage(vfs, 'no-exports', {
      main: './index.js',
      // No exports field
    }, {
      'index.js': 'module.exports = {};',
      'utils.js': 'module.exports = {};',
    });
    mockBuildSuccess();

    await bundleNpmModuleForBrowser('no-exports/utils');

    const opts = mockBuild.mock.calls[0][0];
    expect(opts.entryPoints).toEqual(['/node_modules/no-exports/utils.js']);
  });

  it('resolves main field when no exports', async () => {
    const vfs = setupVFS();
    addPackage(vfs, 'main-only', {
      main: './lib/main.js',
    }, {
      'lib/main.js': 'module.exports = {};',
    });
    mockBuildSuccess();

    await bundleNpmModuleForBrowser('main-only');

    const opts = mockBuild.mock.calls[0][0];
    expect(opts.entryPoints).toEqual(['/node_modules/main-only/lib/main.js']);
  });

  it('resolves scoped package with nested exports', async () => {
    const vfs = setupVFS();
    addPackage(vfs, '@ai-sdk/openai', {
      exports: {
        '.': {
          import: {
            types: './dist/index.d.ts',
            import: './dist/index.js',
          },
          require: {
            types: './dist/index.d.cts',
            require: './dist/index.cjs',
          },
        },
      },
    }, {
      'dist/index.js': 'export {};',
      'dist/index.cjs': 'module.exports = {};',
    });
    mockBuildSuccess();

    await bundleNpmModuleForBrowser('@ai-sdk/openai');

    const opts = mockBuild.mock.calls[0][0];
    expect(opts.entryPoints).toEqual(['/node_modules/@ai-sdk/openai/dist/index.cjs']);
  });

  it('falls back to import condition when require file missing', async () => {
    const vfs = setupVFS();
    addPackage(vfs, 'esm-only', {
      exports: {
        '.': {
          import: './dist/index.mjs',
          // require condition missing
        },
      },
    }, {
      'dist/index.mjs': 'export default {};',
    });
    mockBuildSuccess();

    await bundleNpmModuleForBrowser('esm-only');

    const opts = mockBuild.mock.calls[0][0];
    expect(opts.entryPoints).toEqual(['/node_modules/esm-only/dist/index.mjs']);
  });
});

// ── Post-processing ───────────────────────────────────────────────

describe('post-processing', () => {
  beforeEach(() => {
    clearNpmBundleCache();
    mockBuild.mockReset();
  });

  it('patches __require() calls to ESM imports', async () => {
    setupVFS();
    mockBuild.mockResolvedValue({
      errors: [],
      warnings: [],
      outputFiles: [{
        path: '',
        contents: new Uint8Array(),
        text: 'var x = __require("react");\nvar y = __require("react-dom");',
      }],
    });

    const result = await bundleNpmModuleForBrowser('needs-patch');
    expect(result).toContain('import * as __ext0 from "react"');
    expect(result).toContain('import * as __ext1 from "react-dom"');
    expect(result).not.toContain('__require("react")');
  });

  it('adds named exports for CJS bundles', async () => {
    const vfs = setupVFS();
    addPackage(vfs, 'cjs-named', {
      exports: { '.': './index.js' },
    }, {
      // CJS file with esbuild's __export pattern
      'index.js': '__export(foo_exports, { createThing: () => createThing, doStuff: () => doStuff });',
    });
    mockBuild.mockResolvedValue({
      errors: [],
      warnings: [],
      outputFiles: [{
        path: '',
        contents: new Uint8Array(),
        text: 'var stuff = 1;\nexport default require_cjs_named();',
      }],
    });

    const result = await bundleNpmModuleForBrowser('cjs-named');
    expect(result).toContain('export var createThing = __pkg.createThing;');
    expect(result).toContain('export var doStuff = __pkg.doStuff;');
  });
});
