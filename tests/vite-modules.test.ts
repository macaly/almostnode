/**
 * Test that all Node.js built-in modules required by Vite are available
 */
import { describe, it, expect } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import { Runtime } from '../src/runtime';

describe('Node.js built-in modules for Vite', () => {
  const vfs = new VirtualFS();
  const runtime = new Runtime(vfs);

  // All Node.js built-in modules that Vite and its dependencies might need
  const requiredModules = [
    // Core modules
    'path',
    'fs',
    'url',
    'util',
    'events',
    'stream',
    'buffer',
    'querystring',
    'crypto',
    'os',
    'tty',
    'net',
    'http',
    'https',
    'tls',
    'http2',
    'dns',
    'zlib',

    // Process/Worker modules
    'child_process',
    'cluster',
    'worker_threads',

    // Utility modules
    'assert',
    'string_decoder',
    'timers',
    'readline',
    'vm',
    'v8',

    // Async/Hook modules
    'async_hooks',
    'perf_hooks',

    // Debug/Inspector
    'inspector',

    // Network
    'dgram',

    // Module system
    'module',
  ];

  for (const moduleName of requiredModules) {
    it(`should have shim for '${moduleName}'`, () => {
      // Test that requiring the module doesn't throw
      const code = `
        const mod = require('${moduleName}');
        module.exports = { loaded: true, type: typeof mod };
      `;

      vfs.writeFileSync(`/test-${moduleName.replace('/', '-')}.js`, code);
      const { exports } = runtime.runFile(`/test-${moduleName.replace('/', '-')}.js`);
      const result = exports as { loaded: boolean; type: string };

      expect(result.loaded).toBe(true);
      // Most modules are objects, but assert is a function
      expect(['object', 'function']).toContain(result.type);
    });
  }

  // Test node: prefix works
  it('should handle node: prefix for built-ins', () => {
    const code = `
      const path = require('node:path');
      const fs = require('node:fs');
      module.exports = { path: typeof path, fs: typeof fs };
    `;

    vfs.writeFileSync('/test-node-prefix.js', code);
    const { exports } = runtime.runFile('/test-node-prefix.js');
    const result = exports as { path: string; fs: string };

    expect(result.path).toBe('object');
    expect(result.fs).toBe('object');
  });
});
