/**
 * Runtime - Execute user code with shimmed Node.js globals
 *
 * ESM to CJS transformation is now handled during npm install by transform.ts
 * using esbuild-wasm. This runtime just executes the pre-transformed CJS code.
 */

import { VirtualFS } from './virtual-fs';
import { createFsShim, FsShim } from './shims/fs';
import * as pathShim from './shims/path';
import { createProcess, Process } from './shims/process';
import * as httpShim from './shims/http';
import * as httpsShim from './shims/https';
import * as netShim from './shims/net';
import eventsShim from './shims/events';
import * as streamShim from './shims/stream';
import * as urlShim from './shims/url';
import * as querystringShim from './shims/querystring';
import * as utilShim from './shims/util';
import * as ttyShim from './shims/tty';
import * as osShim from './shims/os';
import * as cryptoShim from './shims/crypto';
import * as zlibShim from './shims/zlib';
import * as dnsShim from './shims/dns';
import bufferShim from './shims/buffer';
import * as childProcessShim from './shims/child_process';
import { initChildProcess } from './shims/child_process';
import { getServerBridge } from './server-bridge';
import * as chokidarShim from './shims/chokidar';
import * as wsShim from './shims/ws';
import * as fseventsShim from './shims/fsevents';
import * as readdirpShim from './shims/readdirp';
import * as moduleShim from './shims/module';
import * as perfHooksShim from './shims/perf_hooks';
import * as workerThreadsShim from './shims/worker_threads';
import * as esbuildShim from './shims/esbuild';
import * as rollupShim from './shims/rollup';
import * as v8Shim from './shims/v8';
import * as readlineShim from './shims/readline';
import * as tlsShim from './shims/tls';
import * as http2Shim from './shims/http2';
import * as clusterShim from './shims/cluster';
import * as dgramShim from './shims/dgram';
import * as vmShim from './shims/vm';
import * as inspectorShim from './shims/inspector';
import * as asyncHooksShim from './shims/async_hooks';

export interface Module {
  id: string;
  filename: string;
  exports: unknown;
  loaded: boolean;
  children: Module[];
  paths: string[];
}

export interface RuntimeOptions {
  cwd?: string;
  env?: Record<string, string>;
  onConsole?: (method: string, args: unknown[]) => void;
}

export interface RequireFunction {
  (id: string): unknown;
  resolve: (id: string) => string;
  cache: Record<string, Module>;
}

/**
 * Create a basic assert module
 */
function createAssertModule() {
  const assert = function (value: unknown, message?: string) {
    if (!value) {
      throw new Error(message || 'Assertion failed');
    }
  };
  assert.ok = assert;
  assert.strictEqual = (a: unknown, b: unknown, message?: string) => {
    if (a !== b) throw new Error(message || `Expected ${a} to equal ${b}`);
  };
  assert.deepStrictEqual = (a: unknown, b: unknown, message?: string) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      throw new Error(message || `Expected ${JSON.stringify(a)} to deep equal ${JSON.stringify(b)}`);
    }
  };
  assert.notStrictEqual = (a: unknown, b: unknown, message?: string) => {
    if (a === b) throw new Error(message || `Expected ${a} to not equal ${b}`);
  };
  assert.throws = (fn: () => void, expected?: unknown, message?: string) => {
    let threw = false;
    try { fn(); } catch { threw = true; }
    if (!threw) throw new Error(message || 'Expected function to throw');
  };
  assert.doesNotThrow = (fn: () => void, message?: string) => {
    try { fn(); } catch { throw new Error(message || 'Expected function not to throw'); }
  };
  assert.fail = (message?: string) => { throw new Error(message || 'Assertion failed'); };
  assert.AssertionError = class AssertionError extends Error {
    constructor(options: { message?: string }) {
      super(options.message || 'Assertion failed');
      this.name = 'AssertionError';
    }
  };
  return assert;
}

/**
 * Create a basic string_decoder module
 */
function createStringDecoderModule() {
  class StringDecoder {
    encoding: string;
    constructor(encoding?: string) {
      this.encoding = encoding || 'utf8';
    }
    write(buffer: Uint8Array): string {
      return new TextDecoder(this.encoding).decode(buffer);
    }
    end(buffer?: Uint8Array): string {
      if (buffer) return this.write(buffer);
      return '';
    }
  }
  return { StringDecoder };
}

/**
 * Create a basic timers module
 */
function createTimersModule() {
  return {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    setImmediate: (fn: () => void) => setTimeout(fn, 0),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    clearImmediate: globalThis.clearTimeout.bind(globalThis),
  };
}

/**
 * Built-in modules registry
 */
const builtinModules: Record<string, unknown> = {
  path: pathShim,
  http: httpShim,
  https: httpsShim, // Separate https shim with https protocol default
  net: netShim,
  events: eventsShim,
  stream: streamShim,
  buffer: bufferShim,
  url: urlShim,
  querystring: querystringShim,
  util: utilShim,
  tty: ttyShim,
  os: osShim,
  crypto: cryptoShim,
  zlib: zlibShim,
  dns: dnsShim,
  child_process: childProcessShim,
  assert: createAssertModule(),
  string_decoder: createStringDecoderModule(),
  timers: createTimersModule(),
  _http_common: {},
  _http_incoming: {},
  _http_outgoing: {},
  // New shims for Vite support
  chokidar: chokidarShim,
  ws: wsShim,
  fsevents: fseventsShim,
  readdirp: readdirpShim,
  module: moduleShim,
  perf_hooks: perfHooksShim,
  worker_threads: workerThreadsShim,
  esbuild: esbuildShim,
  rollup: rollupShim,
  v8: v8Shim,
  readline: readlineShim,
  tls: tlsShim,
  http2: http2Shim,
  cluster: clusterShim,
  dgram: dgramShim,
  vm: vmShim,
  inspector: inspectorShim,
  'inspector/promises': inspectorShim,
  async_hooks: asyncHooksShim,
};

/**
 * Create a require function for a specific module context
 */
function createRequire(
  vfs: VirtualFS,
  fsShim: FsShim,
  process: Process,
  currentDir: string,
  moduleCache: Record<string, Module>,
  options: RuntimeOptions
): RequireFunction {
  const resolveModule = (id: string, fromDir: string): string => {
    // Handle node: protocol prefix (Node.js 16+)
    if (id.startsWith('node:')) {
      id = id.slice(5);
    }

    // Built-in modules
    if (builtinModules[id] || id === 'fs' || id === 'process' || id === 'url' || id === 'querystring' || id === 'util') {
      return id;
    }

    // Relative paths
    if (id.startsWith('./') || id.startsWith('../') || id.startsWith('/')) {
      const resolved = id.startsWith('/')
        ? id
        : pathShim.resolve(fromDir, id);

      // Try exact path
      if (vfs.existsSync(resolved)) {
        const stats = vfs.statSync(resolved);
        if (stats.isFile()) {
          return resolved;
        }
        // Directory - look for index.js
        const indexPath = pathShim.join(resolved, 'index.js');
        if (vfs.existsSync(indexPath)) {
          return indexPath;
        }
      }

      // Try with extensions
      const extensions = ['.js', '.json'];
      for (const ext of extensions) {
        const withExt = resolved + ext;
        if (vfs.existsSync(withExt)) {
          return withExt;
        }
      }

      throw new Error(`Cannot find module '${id}' from '${fromDir}'`);
    }

    // Helper to try resolving a path with extensions
    const tryResolveFile = (basePath: string): string | null => {
      // Try exact path first
      if (vfs.existsSync(basePath)) {
        const stats = vfs.statSync(basePath);
        if (stats.isFile()) {
          return basePath;
        }
        // Directory - look for index.js
        const indexPath = pathShim.join(basePath, 'index.js');
        if (vfs.existsSync(indexPath)) {
          return indexPath;
        }
      }

      // Try with extensions
      const extensions = ['.js', '.json', '.node'];
      for (const ext of extensions) {
        const withExt = basePath + ext;
        if (vfs.existsSync(withExt)) {
          return withExt;
        }
      }

      return null;
    };

    // Helper to resolve from a node_modules directory
    const tryResolveFromNodeModules = (nodeModulesDir: string, moduleId: string): string | null => {
      const fullPath = pathShim.join(nodeModulesDir, moduleId);

      // Check if path exists (as file or directory)
      const resolved = tryResolveFile(fullPath);
      if (resolved) return resolved;

      // Check if this is a package (has package.json)
      // For sub-paths like "pkg/sub", we need to find the package root first
      const parts = moduleId.split('/');
      const pkgName = parts[0].startsWith('@') && parts.length > 1
        ? `${parts[0]}/${parts[1]}`  // Scoped package
        : parts[0];

      const pkgRoot = pathShim.join(nodeModulesDir, pkgName);
      const pkgPath = pathShim.join(pkgRoot, 'package.json');

      if (vfs.existsSync(pkgPath)) {
        const pkgContent = vfs.readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(pkgContent);

        // If this is the package root (no sub-path), use main entry
        if (pkgName === moduleId) {
          const main = pkg.main || 'index.js';
          const mainPath = pathShim.join(pkgRoot, main);
          const resolvedMain = tryResolveFile(mainPath);
          if (resolvedMain) return resolvedMain;
        } else {
          // This is a sub-path within the package
          // Check if package has exports field
          if (pkg.exports) {
            const subPath = './' + moduleId.slice(pkgName.length + 1);
            const exportEntry = pkg.exports[subPath];
            if (exportEntry) {
              const exportPath = typeof exportEntry === 'string'
                ? exportEntry
                : (exportEntry.require || exportEntry.default || exportEntry.node);
              if (exportPath) {
                const resolved = tryResolveFile(pathShim.join(pkgRoot, exportPath));
                if (resolved) return resolved;
              }
            }
          }
        }
      }

      return null;
    };

    // Node modules resolution
    let searchDir = fromDir;
    while (searchDir !== '/') {
      const nodeModulesDir = pathShim.join(searchDir, 'node_modules');
      const resolved = tryResolveFromNodeModules(nodeModulesDir, id);
      if (resolved) return resolved;

      searchDir = pathShim.dirname(searchDir);
    }

    // Try root node_modules as last resort
    const rootResolved = tryResolveFromNodeModules('/node_modules', id);
    if (rootResolved) return rootResolved;

    throw new Error(`Cannot find module '${id}'`);
  };

  const loadModule = (resolvedPath: string): Module => {
    // Return cached module
    if (moduleCache[resolvedPath]) {
      return moduleCache[resolvedPath];
    }

    // Create module object
    const module: Module = {
      id: resolvedPath,
      filename: resolvedPath,
      exports: {},
      loaded: false,
      children: [],
      paths: [],
    };

    // Cache before loading to handle circular dependencies
    moduleCache[resolvedPath] = module;

    // Handle JSON files
    if (resolvedPath.endsWith('.json')) {
      const content = vfs.readFileSync(resolvedPath, 'utf8');
      module.exports = JSON.parse(content);
      module.loaded = true;
      return module;
    }

    // Read and execute JS file
    // Note: ESM packages are pre-transformed to CJS during npm install
    const code = vfs.readFileSync(resolvedPath, 'utf8');
    const dirname = pathShim.dirname(resolvedPath);

    // Create require for this module
    const moduleRequire = createRequire(
      vfs,
      fsShim,
      process,
      dirname,
      moduleCache,
      options
    );
    moduleRequire.cache = moduleCache;

    // Create console wrapper
    const consoleWrapper = createConsoleWrapper(options.onConsole);

    // Execute module code
    // We use an outer/inner function pattern to avoid conflicts:
    // - Outer function receives parameters and sets up vars
    // - Inner function runs the code, allowing let/const to shadow without "already declared" errors
    // - import.meta is provided for ESM code that uses it
    try {
      const importMetaUrl = 'file://' + resolvedPath;
      const wrappedCode = `(function($exports, $require, $module, $filename, $dirname, $process, $console, $importMeta) {
var exports = $exports;
var require = $require;
var module = $module;
var __filename = $filename;
var __dirname = $dirname;
var process = $process;
var console = $console;
var import_meta = $importMeta;
return (function() {
${code}
}).call(this);
})`;

      let fn;
      try {
        fn = eval(wrappedCode);
      } catch (evalError) {
        console.error('[runtime] Eval failed for:', resolvedPath);
        console.error('[runtime] First 500 chars of code:', code.substring(0, 500));
        throw evalError;
      }
      fn(
        module.exports,
        moduleRequire,
        module,
        resolvedPath,
        dirname,
        process,
        consoleWrapper,
        { url: importMetaUrl, dirname, filename: resolvedPath }
      );

      module.loaded = true;
    } catch (error) {
      // Remove from cache on error
      delete moduleCache[resolvedPath];
      throw error;
    }

    return module;
  };

  const require: RequireFunction = (id: string): unknown => {
    // Handle node: protocol prefix (Node.js 16+)
    if (id.startsWith('node:')) {
      id = id.slice(5);
    }

    // Built-in modules
    if (id === 'fs') {
      return fsShim;
    }
    if (id === 'fs/promises') {
      return fsShim.promises;
    }
    if (id === 'process') {
      return process;
    }
    // Special handling for 'module' - provide a working createRequire
    if (id === 'module') {
      return {
        ...moduleShim,
        createRequire: (filenameOrUrl: string) => {
          // Convert file:// URL to path
          let fromPath = filenameOrUrl;
          if (filenameOrUrl.startsWith('file://')) {
            fromPath = filenameOrUrl.slice(7); // Remove 'file://'
            // Handle Windows-style file:///C:/ URLs (though unlikely in our env)
            if (fromPath.startsWith('/') && fromPath[2] === ':') {
              fromPath = fromPath.slice(1);
            }
          }
          // Get directory from the path
          const fromDir = pathShim.dirname(fromPath);
          // Return a require function that resolves from this directory
          const newRequire = createRequire(
            vfs,
            fsShim,
            process,
            fromDir,
            moduleCache,
            options
          );
          newRequire.cache = moduleCache;
          return newRequire;
        },
      };
    }
    if (builtinModules[id]) {
      return builtinModules[id];
    }

    // Intercept rollup and esbuild - always use our shims
    // These packages have native binaries that don't work in browser
    if (id === 'rollup' || id.startsWith('rollup/') || id.startsWith('@rollup/')) {
      return builtinModules['rollup'];
    }
    if (id === 'esbuild' || id.startsWith('esbuild/') || id.startsWith('@esbuild/')) {
      return builtinModules['esbuild'];
    }

    const resolved = resolveModule(id, currentDir);

    // If resolved to a built-in name (shouldn't happen but safety check)
    if (builtinModules[resolved]) {
      return builtinModules[resolved];
    }

    // Also check if resolved path is to rollup or esbuild in node_modules
    if (resolved.includes('/node_modules/rollup/') ||
        resolved.includes('/node_modules/@rollup/')) {
      return builtinModules['rollup'];
    }
    if (resolved.includes('/node_modules/esbuild/') ||
        resolved.includes('/node_modules/@esbuild/')) {
      return builtinModules['esbuild'];
    }

    return loadModule(resolved).exports;
  };

  require.resolve = (id: string): string => {
    if (id === 'fs' || id === 'process' || builtinModules[id]) {
      return id;
    }
    return resolveModule(id, currentDir);
  };

  require.cache = moduleCache;

  return require;
}

/**
 * Create a console wrapper that can capture output
 */
function createConsoleWrapper(
  onConsole?: (method: string, args: unknown[]) => void
): Console {
  const wrapper = {
    log: (...args: unknown[]) => {
      console.log(...args);
      onConsole?.('log', args);
    },
    error: (...args: unknown[]) => {
      console.error(...args);
      onConsole?.('error', args);
    },
    warn: (...args: unknown[]) => {
      console.warn(...args);
      onConsole?.('warn', args);
    },
    info: (...args: unknown[]) => {
      console.info(...args);
      onConsole?.('info', args);
    },
    debug: (...args: unknown[]) => {
      console.debug(...args);
      onConsole?.('debug', args);
    },
    trace: (...args: unknown[]) => {
      console.trace(...args);
      onConsole?.('trace', args);
    },
    dir: (obj: unknown) => {
      console.dir(obj);
      onConsole?.('dir', [obj]);
    },
    time: console.time.bind(console),
    timeEnd: console.timeEnd.bind(console),
    timeLog: console.timeLog.bind(console),
    assert: console.assert.bind(console),
    clear: console.clear.bind(console),
    count: console.count.bind(console),
    countReset: console.countReset.bind(console),
    group: console.group.bind(console),
    groupCollapsed: console.groupCollapsed.bind(console),
    groupEnd: console.groupEnd.bind(console),
    table: console.table.bind(console),
  };

  return wrapper as unknown as Console;
}

/**
 * Runtime class for executing code in virtual environment
 */
export class Runtime {
  private vfs: VirtualFS;
  private fsShim: FsShim;
  private process: Process;
  private moduleCache: Record<string, Module> = {};
  private options: RuntimeOptions;

  constructor(vfs: VirtualFS, options: RuntimeOptions = {}) {
    this.vfs = vfs;
    this.fsShim = createFsShim(vfs);
    this.process = createProcess({
      cwd: options.cwd || '/',
      env: options.env,
    });
    this.options = options;

    // Initialize child_process with VFS for bash command support
    initChildProcess(vfs);

    // Initialize file watcher shims with VFS
    chokidarShim.setVFS(vfs);
    readdirpShim.setVFS(vfs);
  }

  /**
   * Execute code as a module
   */
  execute(
    code: string,
    filename: string = '/index.js'
  ): { exports: unknown; module: Module } {
    const dirname = pathShim.dirname(filename);

    // Write code to virtual file system
    this.vfs.writeFileSync(filename, code);

    // Create require function
    const require = createRequire(
      this.vfs,
      this.fsShim,
      this.process,
      dirname,
      this.moduleCache,
      this.options
    );

    // Create module object
    const module: Module = {
      id: filename,
      filename,
      exports: {},
      loaded: false,
      children: [],
      paths: [],
    };

    // Cache the module
    this.moduleCache[filename] = module;

    // Create console wrapper
    const consoleWrapper = createConsoleWrapper(this.options.onConsole);

    // Execute code
    // Use the same wrapper pattern as loadModule for consistency
    try {
      const importMetaUrl = 'file://' + filename;
      const wrappedCode = `(function($exports, $require, $module, $filename, $dirname, $process, $console, $importMeta) {
var exports = $exports;
var require = $require;
var module = $module;
var __filename = $filename;
var __dirname = $dirname;
var process = $process;
var console = $console;
var import_meta = $importMeta;
return (function() {
${code}
}).call(this);
})`;

      const fn = eval(wrappedCode);
      fn(
        module.exports,
        require,
        module,
        filename,
        dirname,
        this.process,
        consoleWrapper,
        { url: importMetaUrl, dirname, filename }
      );

      module.loaded = true;
    } catch (error) {
      delete this.moduleCache[filename];
      throw error;
    }

    return { exports: module.exports, module };
  }

  /**
   * Run a file from the virtual file system
   */
  runFile(filename: string): { exports: unknown; module: Module } {
    const code = this.vfs.readFileSync(filename, 'utf8');
    return this.execute(code, filename);
  }

  /**
   * Clear the module cache
   */
  clearCache(): void {
    this.moduleCache = {};
  }

  /**
   * Get the virtual file system
   */
  getVFS(): VirtualFS {
    return this.vfs;
  }

  /**
   * Get the process object
   */
  getProcess(): Process {
    return this.process;
  }
}

/**
 * Create and execute code in a new runtime
 */
export function execute(
  code: string,
  vfs: VirtualFS,
  options?: RuntimeOptions
): { exports: unknown; module: Module } {
  const runtime = new Runtime(vfs, options);
  return runtime.execute(code);
}

export default Runtime;
