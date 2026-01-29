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
import streamShim from './shims/stream';
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
import * as domainShim from './shims/domain';
import * as diagnosticsChannelShim from './shims/diagnostics_channel';
import * as sentryShim from './shims/sentry';
import assertShim from './shims/assert';
import { resolve as resolveExports } from 'resolve.exports';

/**
 * Transform dynamic imports in code: import('x') -> __dynamicImport('x')
 * This allows dynamic imports to work in our eval-based runtime
 */
function transformDynamicImports(code: string): string {
  // Use a regex that matches import( but not things like:
  // - "import(" in strings
  // - // import( in comments
  // This is a simple approach that works for most bundled code
  // For a more robust solution, we'd need a proper parser

  // Match: import( with optional whitespace, not preceded by word char or $
  // This handles: import('x'), import ("x"), await import('x'), etc.
  return code.replace(/(?<![.$\w])import\s*\(/g, '__dynamicImport(');
}

/**
 * Simple synchronous ESM to CJS transform
 * Handles basic import/export syntax without needing esbuild
 */
function transformEsmToCjs(code: string, filename: string): string {
  // Check if code has ESM syntax
  const hasImport = /\bimport\s+[\w{*'"]/m.test(code);
  const hasExport = /\bexport\s+(?:default|const|let|var|function|class|{|\*)/m.test(code);
  const hasImportMeta = /\bimport\.meta\b/.test(code);

  if (!hasImport && !hasExport && !hasImportMeta) {
    return code; // Already CJS or no module syntax
  }

  let transformed = code;

  // Transform import.meta.url to a file:// URL
  transformed = transformed.replace(/\bimport\.meta\.url\b/g, `"file://${filename}"`);
  transformed = transformed.replace(/\bimport\.meta\.dirname\b/g, `"${pathShim.dirname(filename)}"`);
  transformed = transformed.replace(/\bimport\.meta\.filename\b/g, `"${filename}"`);
  transformed = transformed.replace(/\bimport\.meta\b/g, `({ url: "file://${filename}", dirname: "${pathShim.dirname(filename)}", filename: "${filename}" })`);

  // Transform named imports: import { a, b } from 'x' -> const { a, b } = require('x')
  transformed = transformed.replace(
    /\bimport\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]\s*;?/g,
    (_, imports, module) => {
      const cleanImports = imports.replace(/\s+as\s+/g, ': ');
      return `const {${cleanImports}} = require("${module}");`;
    }
  );

  // Transform default imports: import x from 'y' -> const x = require('y').default || require('y')
  transformed = transformed.replace(
    /\bimport\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?/g,
    (_, name, module) => {
      return `const ${name} = (function() { const m = require("${module}"); return m && m.__esModule ? m.default : m; })();`;
    }
  );

  // Transform namespace imports: import * as x from 'y' -> const x = require('y')
  transformed = transformed.replace(
    /\bimport\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?/g,
    'const $1 = require("$2");'
  );

  // Transform side-effect imports: import 'x' -> require('x')
  transformed = transformed.replace(
    /\bimport\s+['"]([^'"]+)['"]\s*;?/g,
    'require("$1");'
  );

  // Transform export default: export default x -> module.exports.default = x; module.exports = x
  transformed = transformed.replace(
    /\bexport\s+default\s+/g,
    'module.exports = module.exports.default = '
  );

  // Transform named exports: export { a, b } -> module.exports.a = a; module.exports.b = b
  transformed = transformed.replace(
    /\bexport\s+\{([^}]+)\}\s*;?/g,
    (_, exports) => {
      const items = exports.split(',').map((item: string) => {
        const [local, exported] = item.trim().split(/\s+as\s+/);
        const exportName = exported || local;
        return `module.exports.${exportName.trim()} = ${local.trim()};`;
      });
      return items.join('\n');
    }
  );

  // Transform export const/let/var: export const x = 1 -> const x = 1; module.exports.x = x
  transformed = transformed.replace(
    /\bexport\s+(const|let|var)\s+(\w+)\s*=/g,
    '$1 $2 = module.exports.$2 ='
  );

  // Transform export function: export function x() {} -> function x() {} module.exports.x = x
  transformed = transformed.replace(
    /\bexport\s+function\s+(\w+)/g,
    'function $1'
  );

  // Transform export class: export class X {} -> class X {} module.exports.X = X
  transformed = transformed.replace(
    /\bexport\s+class\s+(\w+)/g,
    'class $1'
  );

  // Mark as ES module for interop
  if (hasExport) {
    transformed = 'Object.defineProperty(exports, "__esModule", { value: true });\n' + transformed;
  }

  return transformed;
}

/**
 * Create a dynamic import function for a module context
 * Returns a function that wraps require() in a Promise
 */
function createDynamicImport(moduleRequire: RequireFunction): (specifier: string) => Promise<unknown> {
  return async (specifier: string): Promise<unknown> => {
    try {
      const mod = moduleRequire(specifier);

      // If the module has a default export or is already ESM-like, return as-is
      if (mod && typeof mod === 'object' && ('default' in (mod as object) || '__esModule' in (mod as object))) {
        return mod;
      }

      // For CommonJS modules, wrap in an object with default export
      // This matches how dynamic import() handles CJS modules
      return {
        default: mod,
        ...(mod && typeof mod === 'object' ? mod as object : {}),
      };
    } catch (error) {
      // Re-throw as a rejected promise (which is what dynamic import does)
      throw error;
    }
  };
}

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
 * Minimal prettier shim - just returns input unchanged
 * This is needed because prettier uses createRequire which conflicts with our runtime
 */
const prettierShim = {
  format: (source: string, _options?: unknown) => Promise.resolve(source),
  formatWithCursor: (source: string, _options?: unknown) => Promise.resolve({ formatted: source, cursorOffset: 0 }),
  check: (_source: string, _options?: unknown) => Promise.resolve(true),
  resolveConfig: () => Promise.resolve(null),
  resolveConfigFile: () => Promise.resolve(null),
  clearConfigCache: () => {},
  getFileInfo: () => Promise.resolve({ ignored: false, inferredParser: null }),
  getSupportInfo: () => Promise.resolve({ languages: [], options: [] }),
  version: '3.0.0',
  doc: {
    builders: {},
    printer: {},
    utils: {},
  },
};

/**
 * Create a mutable copy of a module for packages that need to patch it
 * (e.g., Sentry needs to patch http.request/http.get)
 */
function makeMutable(mod: Record<string, unknown>): Record<string, unknown> {
  const mutable: Record<string, unknown> = {};
  for (const key of Object.keys(mod)) {
    mutable[key] = mod[key];
  }
  return mutable;
}

/**
 * Built-in modules registry
 */
const builtinModules: Record<string, unknown> = {
  path: pathShim,
  // Make http/https mutable so packages like Sentry can patch them
  http: makeMutable(httpShim as unknown as Record<string, unknown>),
  https: makeMutable(httpsShim as unknown as Record<string, unknown>),
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
  assert: assertShim,
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
  domain: domainShim,
  diagnostics_channel: diagnosticsChannelShim,
  // prettier uses createRequire which doesn't work in our runtime, so we shim it
  prettier: prettierShim,
  // Some packages explicitly require 'console'
  console: console,
  // util/types is accessed as a subpath
  'util/types': utilShim.types,
  // Sentry SDK (no-op since error tracking isn't useful in browser runtime)
  '@sentry/node': sentryShim,
  '@sentry/core': sentryShim,
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

        // Use resolve.exports to handle the exports field
        if (pkg.exports) {
          try {
            // resolveExports expects the full module specifier (e.g., 'convex/server')
            // and returns the resolved path(s) relative to package root
            const resolved = resolveExports(pkg, moduleId, { require: true });
            if (resolved && resolved.length > 0) {
              const exportPath = resolved[0];
              const fullExportPath = pathShim.join(pkgRoot, exportPath);
              const resolvedFile = tryResolveFile(fullExportPath);
              if (resolvedFile) return resolvedFile;
            }
          } catch {
            // resolveExports throws if no match found, fall through to main
          }
        }

        // If this is the package root (no sub-path), use main entry
        if (pkgName === moduleId) {
          const main = pkg.main || 'index.js';
          const mainPath = pathShim.join(pkgRoot, main);
          const resolvedMain = tryResolveFile(mainPath);
          if (resolvedMain) return resolvedMain;
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
    let code = vfs.readFileSync(resolvedPath, 'utf8');
    const dirname = pathShim.dirname(resolvedPath);

    // Transform ESM to CJS if needed (for .mjs files or ESM that wasn't pre-transformed)
    // This handles files that weren't transformed during npm install
    // BUT skip .cjs files and already-bundled CJS code
    const isCjsFile = resolvedPath.endsWith('.cjs');
    const isAlreadyBundledCjs = code.startsWith('"use strict";\nvar __') ||
                                 code.startsWith("'use strict';\nvar __");

    const hasEsmImport = /\bimport\s+[\w{*'"]/m.test(code);
    const hasEsmExport = /\bexport\s+(?:default|const|let|var|function|class|{|\*)/m.test(code);

    if (!isCjsFile && !isAlreadyBundledCjs) {
      if (resolvedPath.endsWith('.mjs') || resolvedPath.includes('/esm/') || hasEsmImport || hasEsmExport) {
        code = transformEsmToCjs(code, resolvedPath);
      }
    }

    // Transform dynamic imports: import('x') -> __dynamicImport('x')
    // This allows dynamic imports to work in our eval-based runtime
    code = transformDynamicImports(code);

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
      const wrappedCode = `(function($exports, $require, $module, $filename, $dirname, $process, $console, $importMeta, $dynamicImport) {
var exports = $exports;
var require = $require;
var module = $module;
var __filename = $filename;
var __dirname = $dirname;
var process = $process;
var console = $console;
var import_meta = $importMeta;
var __dynamicImport = $dynamicImport;
// Set up global.process and globalThis.process for code that accesses them directly
var global = globalThis;
globalThis.process = $process;
global.process = $process;
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
      // Create dynamic import function for this module context
      const dynamicImport = createDynamicImport(moduleRequire);

      fn(
        module.exports,
        moduleRequire,
        module,
        resolvedPath,
        dirname,
        process,
        consoleWrapper,
        { url: importMetaUrl, dirname, filename: resolvedPath },
        dynamicImport
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
      console.log('[runtime] Intercepted rollup:', id);
      return builtinModules['rollup'];
    }
    if (id === 'esbuild' || id.startsWith('esbuild/') || id.startsWith('@esbuild/')) {
      console.log('[runtime] Intercepted esbuild:', id);
      return builtinModules['esbuild'];
    }
    // Intercept prettier - uses createRequire which doesn't work in our runtime
    if (id === 'prettier' || id.startsWith('prettier/')) {
      return builtinModules['prettier'];
    }
    // Intercept Sentry - SDK tries to monkey-patch http which doesn't work
    if (id.startsWith('@sentry/')) {
      return builtinModules['@sentry/node'];
    }

    const resolved = resolveModule(id, currentDir);

    // If resolved to a built-in name (shouldn't happen but safety check)
    if (builtinModules[resolved]) {
      return builtinModules[resolved];
    }

    // Also check if resolved path is to rollup, esbuild, or prettier in node_modules
    if (resolved.includes('/node_modules/rollup/') ||
        resolved.includes('/node_modules/@rollup/')) {
      return builtinModules['rollup'];
    }
    if (resolved.includes('/node_modules/esbuild/') ||
        resolved.includes('/node_modules/@esbuild/')) {
      return builtinModules['esbuild'];
    }
    if (resolved.includes('/node_modules/prettier/')) {
      return builtinModules['prettier'];
    }
    if (resolved.includes('/node_modules/@sentry/')) {
      return builtinModules['@sentry/node'];
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
    // Create process first so we can get cwd for fs shim
    this.process = createProcess({
      cwd: options.cwd || '/',
      env: options.env,
    });
    // Create fs shim with cwd getter for relative path resolution
    this.fsShim = createFsShim(vfs, () => this.process.cwd());
    this.options = options;

    // Initialize child_process with VFS for bash command support
    initChildProcess(vfs);

    // Initialize file watcher shims with VFS
    chokidarShim.setVFS(vfs);
    readdirpShim.setVFS(vfs);

    // Initialize esbuild shim with VFS for file access
    esbuildShim.setVFS(vfs);

    // Polyfill TextDecoder to handle base64/base64url/hex gracefully
    // (Some CLI tools incorrectly try to use TextDecoder for these)
    this.setupTextDecoderPolyfill();
  }

  /**
   * Set up a polyfilled TextDecoder that handles binary encodings
   */
  private setupTextDecoderPolyfill(): void {
    const OriginalTextDecoder = globalThis.TextDecoder;

    class PolyfillTextDecoder {
      private encoding: string;
      private decoder: TextDecoder | null = null;

      constructor(encoding: string = 'utf-8', options?: TextDecoderOptions) {
        this.encoding = encoding.toLowerCase();

        // For valid text encodings, use the real TextDecoder
        const validTextEncodings = [
          'utf-8', 'utf8', 'utf-16le', 'utf-16be', 'utf-16',
          'ascii', 'iso-8859-1', 'latin1', 'windows-1252'
        ];

        if (validTextEncodings.includes(this.encoding)) {
          try {
            this.decoder = new OriginalTextDecoder(encoding, options);
          } catch {
            // Fall back to utf-8
            this.decoder = new OriginalTextDecoder('utf-8', options);
          }
        }
        // For binary encodings (base64, base64url, hex), decoder stays null
      }

      decode(input?: BufferSource, options?: TextDecodeOptions): string {
        if (this.decoder) {
          return this.decoder.decode(input, options);
        }

        // Handle binary encodings manually
        if (!input) return '';

        const bytes = input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);

        if (this.encoding === 'base64') {
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return btoa(binary);
        }

        if (this.encoding === 'base64url') {
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        }

        if (this.encoding === 'hex') {
          let hex = '';
          for (let i = 0; i < bytes.length; i++) {
            hex += bytes[i].toString(16).padStart(2, '0');
          }
          return hex;
        }

        // Fallback: decode as utf-8
        return new OriginalTextDecoder('utf-8').decode(input, options);
      }

      get fatal(): boolean {
        return this.decoder?.fatal ?? false;
      }

      get ignoreBOM(): boolean {
        return this.decoder?.ignoreBOM ?? false;
      }
    }

    globalThis.TextDecoder = PolyfillTextDecoder as unknown as typeof TextDecoder;
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
// Set up global.process and globalThis.process for code that accesses them directly
var global = globalThis;
globalThis.process = $process;
global.process = $process;

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
