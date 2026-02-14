/**
 * esbuild shim - Uses esbuild-wasm for transforms in the browser
 * Provides VFS integration for file access
 */

import type { VirtualFS } from '../virtual-fs';
import { ESBUILD_WASM_BINARY_CDN, ESBUILD_WASM_BROWSER_CDN } from '../config/cdn';

/**
 * Node.js built-in module names. Used by the VFS plugin to provide empty stubs
 * for builtins that leak as transitive deps (e.g., `path` from `@vercel/oidc`).
 */
const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns',
  'events', 'fs', 'http', 'http2', 'https', 'net', 'os', 'path', 'perf_hooks',
  'querystring', 'readline', 'stream', 'string_decoder', 'timers', 'tls',
  'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib', 'async_hooks',
  'inspector', 'module', 'process', 'console', 'constants', 'domain',
  'punycode', 'sys', 'tty',
]);

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Represents a package.json exports map entry.
 * Can be a direct path string or a conditional exports object with nested conditions.
 *
 * @example Direct string entry:
 * ```json
 * { "exports": "./dist/index.js" }
 * ```
 *
 * @example Conditional exports:
 * ```json
 * {
 *   "exports": {
 *     ".": {
 *       "import": "./dist/esm/index.js",
 *       "require": "./dist/cjs/index.js"
 *     }
 *   }
 * }
 * ```
 *
 * @example Nested conditions (e.g., convex package):
 * ```json
 * {
 *   "exports": {
 *     "./server": {
 *       "convex": {
 *         "import": "./dist/server.js"
 *       },
 *       "default": "./dist/server.js"
 *     }
 *   }
 * }
 * ```
 */
type ExportEntry = string | ExportConditions;

/**
 * Conditional exports object mapping condition names to export entries.
 * Conditions can be nested to support complex resolution scenarios.
 */
interface ExportConditions {
  [condition: string]: ExportEntry;
}

/**
 * Result of resolving a node module import.
 */
interface NodeModuleResolution {
  /** The resolved absolute path to the module file */
  path: string;
  /** Plugin data to pass to the onLoad handler */
  pluginData: { fromVFS: boolean };
}

// esbuild-wasm types
export interface TransformOptions {
  loader?: 'js' | 'jsx' | 'ts' | 'tsx' | 'json' | 'css';
  format?: 'iife' | 'cjs' | 'esm';
  target?: string | string[];
  minify?: boolean;
  sourcemap?: boolean | 'inline' | 'external';
  jsx?: 'transform' | 'preserve';
  jsxFactory?: string;
  jsxFragment?: string;
}

export interface TransformResult {
  code: string;
  map: string;
  warnings: unknown[];
}

export interface BuildOptions {
  entryPoints?: string[];
  stdin?: { contents: string; resolveDir?: string; loader?: 'js' | 'jsx' | 'ts' | 'tsx' | 'json' | 'css' };
  bundle?: boolean;
  outdir?: string;
  outfile?: string;
  format?: 'iife' | 'cjs' | 'esm';
  platform?: 'browser' | 'node' | 'neutral';
  target?: string | string[];
  minify?: boolean;
  sourcemap?: boolean | 'inline' | 'external';
  external?: string[];
  write?: boolean;
  plugins?: unknown[];
  absWorkingDir?: string;
}

export interface BuildResult {
  errors: unknown[];
  warnings: unknown[];
  outputFiles?: Array<{ path: string; contents: Uint8Array; text: string }>;
  metafile?: { inputs?: Record<string, unknown>; outputs?: Record<string, unknown> };
}

// Window.__esbuild type is declared in src/types/external.d.ts

// ============================================================================
// Export Condition Resolution
// ============================================================================

/**
 * The priority order for export conditions when resolving package exports.
 *
 * Order rationale:
 * 1. "module" - ESM entry point (preferred for modern bundlers)
 * 2. "import" - ESM import condition (standard Node.js condition)
 * 3. "require" - CJS require condition (fallback for CommonJS)
 * 4. "default" - Fallback condition (lowest priority)
 *
 * Packages with custom conditions (e.g. "convex", "react-native") will
 * fall through to one of these standard conditions.
 */
const EXPORT_CONDITION_PRIORITY = ['module', 'import', 'require', 'default'] as const;

/**
 * Resolves a package.json exports entry to a file path by evaluating export conditions.
 *
 * This function handles the Node.js package exports map resolution algorithm,
 * supporting both simple string exports and conditional exports with nested structures.
 *
 * @param entry - The exports map entry to resolve. Can be:
 *   - A string path (e.g., "./dist/index.js")
 *   - A conditional exports object with condition keys
 *   - Nested conditional objects for complex packages
 *
 * @returns The resolved file path relative to the package root, or undefined if
 *          no matching condition is found.
 *
 * @example Simple string entry:
 * ```ts
 * resolveExportConditions("./dist/index.js")
 * // Returns: "./dist/index.js"
 * ```
 *
 * @example Conditional exports:
 * ```ts
 * resolveExportConditions({
 *   import: "./dist/esm/index.js",
 *   require: "./dist/cjs/index.js",
 *   default: "./dist/index.js"
 * })
 * // Returns: "./dist/esm/index.js" (import has higher priority)
 * ```
 *
 * @example Nested conditions (convex package style):
 * ```ts
 * resolveExportConditions({
 *   convex: { import: "./dist/convex.js" },
 *   default: "./dist/default.js"
 * })
 * // Returns: "./dist/convex.js" (convex condition with nested import)
 * ```
 */
function resolveExportConditions(entry: ExportEntry): string | undefined {
  // Direct string path - return as-is
  if (typeof entry === 'string') {
    return entry;
  }

  // Conditional exports object - evaluate conditions in priority order
  if (typeof entry === 'object' && entry !== null) {
    for (const condition of EXPORT_CONDITION_PRIORITY) {
      const conditionValue = entry[condition];
      if (conditionValue !== undefined) {
        // Recursively resolve nested conditions
        const result = resolveExportConditions(conditionValue);
        if (result) {
          return result;
        }
      }
    }
  }

  return undefined;
}

// ============================================================================
// Node Modules Resolution
// ============================================================================

/**
 * Resolves a bare import (e.g., "convex/server", "react") to an absolute file path
 * in the VFS node_modules directory.
 *
 * ## Why resolve from VFS instead of marking as external?
 *
 * We resolve modules from the VFS node_modules directory instead of marking them
 * as external because:
 *
 * 1. **Browser bundling**: In the browser environment, we need to bundle all
 *    dependencies since there's no Node.js runtime to resolve modules at runtime.
 *
 * 2. **VFS isolation**: The virtual file system contains a snapshot of dependencies
 *    that may differ from what's available in the host environment.
 *
 * 3. **Consistent builds**: By resolving from VFS, we ensure builds are
 *    reproducible regardless of the host machine's node_modules.
 *
 * ## Resolution Algorithm
 *
 * 1. Parse the import path to extract the package name and subpath
 *    - Scoped packages: "@scope/pkg/sub" -> name="@scope/pkg", subpath="sub"
 *    - Regular packages: "pkg/sub" -> name="pkg", subpath="sub"
 *
 * 2. Check if the package exists in /project/node_modules/{name}
 *
 * 3. Read the package.json and resolve the entry point:
 *    a. For subpath imports (e.g., "convex/server"):
 *       - Check exports map for "./{subpath}" key
 *       - Fall back to direct file path resolution
 *    b. For main imports (e.g., "convex"):
 *       - Check exports map for "." key
 *       - Fall back to "module" or "main" fields
 *
 * 4. Verify the resolved file exists with supported extensions
 *
 * @param vfs - The virtual file system instance
 * @param importPath - The bare import path (e.g., "convex/server", "react")
 * @param extensions - File extensions to try when resolving (e.g., ['', '.ts', '.js'])
 *
 * @returns Resolution result with the absolute path, or null if the module
 *          cannot be resolved (should be marked as external)
 */
function resolveNodeModuleImport(
  vfs: VirtualFS,
  importPath: string,
  extensions: string[]
): NodeModuleResolution | null {
  // Parse the import path to extract package name and subpath
  // Scoped packages: "@scope/pkg/sub" -> ["@scope", "pkg", "sub"]
  // Regular packages: "pkg/sub" -> ["pkg", "sub"]
  const pathParts = importPath.split('/');
  const isScoped = pathParts[0].startsWith('@');

  const moduleName = isScoped
    ? pathParts.slice(0, 2).join('/')   // "@scope/pkg"
    : pathParts[0];                      // "pkg"

  const subPath = isScoped
    ? pathParts.slice(2).join('/')       // Everything after "@scope/pkg/"
    : pathParts.slice(1).join('/');      // Everything after "pkg/"

  // Check if the package exists in VFS node_modules
  // Try /node_modules/ first (dev server), then /project/node_modules/ (convex)
  let nodeModulesBase = '/node_modules/' + moduleName;
  if (!vfs.existsSync(nodeModulesBase)) {
    nodeModulesBase = '/project/node_modules/' + moduleName;
    if (!vfs.existsSync(nodeModulesBase)) {
      return null;
    }
  }

  // Read package.json to determine the entry point
  const packageJsonPath = nodeModulesBase + '/package.json';
  if (!vfs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const packageJsonContent = vfs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent) as {
      exports?: Record<string, ExportEntry> | ExportEntry;
      module?: string;
      main?: string;
    };

    let resolvedPath: string | null = null;

    if (subPath) {
      // Importing a subpath like "convex/server"
      resolvedPath = resolveSubpathImport(
        vfs,
        packageJson,
        nodeModulesBase,
        subPath,
        extensions
      );
    } else {
      // Importing the main module like "convex"
      resolvedPath = resolveMainImport(
        vfs,
        packageJson,
        nodeModulesBase,
        extensions
      );
    }

    if (resolvedPath) {
      return { path: resolvedPath, pluginData: { fromVFS: true } };
    }
  } catch {
    // Failed to read package.json, fall through to return null
  }

  return null;
}

/**
 * Resolves a subpath import (e.g., "convex/server" -> "./server" subpath).
 *
 * Resolution order:
 * 1. Check exports map for "./{subpath}" key with condition resolution
 * 2. Fall back to direct file path resolution with extensions
 */
function resolveSubpathImport(
  vfs: VirtualFS,
  packageJson: { exports?: Record<string, ExportEntry> | ExportEntry },
  nodeModulesBase: string,
  subPath: string,
  extensions: string[]
): string | null {
  // Try exports map first
  if (packageJson.exports && typeof packageJson.exports === 'object') {
    const exportKey = './' + subPath;
    const exportsMap = packageJson.exports as Record<string, ExportEntry>;
    const exportEntry = exportsMap[exportKey];

    if (exportEntry) {
      const exportPath = resolveExportConditions(exportEntry);
      if (exportPath) {
        const resolvedPath = nodeModulesBase + '/' + exportPath.replace(/^\.\//, '');
        const foundPath = findVFSFile(vfs, resolvedPath, ['', '.js', '.ts', '.mjs']);
        if (foundPath) {
          return foundPath;
        }
      }
    }
  }

  // Fall back to direct path resolution
  const directPath = nodeModulesBase + '/' + subPath;
  return findVFSFile(vfs, directPath, extensions);
}

/**
 * Resolves the main entry point of a package (e.g., "convex" without subpath).
 *
 * Resolution order:
 * 1. Check exports map "." key with condition resolution
 * 2. Fall back to "module" field (ESM entry)
 * 3. Fall back to "main" field (CJS entry)
 * 4. Default to "index.js"
 */
function resolveMainImport(
  vfs: VirtualFS,
  packageJson: {
    exports?: Record<string, ExportEntry> | ExportEntry;
    module?: string;
    main?: string;
  },
  nodeModulesBase: string,
  extensions: string[]
): string | null {
  // Try exports map first
  if (packageJson.exports) {
    // The main export can be at "." key or be the exports value itself
    const mainExport = typeof packageJson.exports === 'object' && !Array.isArray(packageJson.exports)
      ? (packageJson.exports['.'] || packageJson.exports)
      : packageJson.exports;

    const exportPath = resolveExportConditions(mainExport as ExportEntry);
    if (exportPath) {
      const resolvedPath = nodeModulesBase + '/' + exportPath.replace(/^\.\//, '');
      const foundPath = findVFSFile(vfs, resolvedPath, ['', '.js', '.ts', '.mjs']);
      if (foundPath) {
        return foundPath;
      }
    }
  }

  // Fall back to module/main fields
  // Prefer "module" (ESM) over "main" (CJS) for better tree-shaking
  const mainField = packageJson.module || packageJson.main || 'index.js';
  const resolvedPath = nodeModulesBase + '/' + mainField.replace(/^\.\//, '');
  return findVFSFile(vfs, resolvedPath, extensions);
}

// ============================================================================
// Module State
// ============================================================================

// State
let esbuildInstance: typeof import('esbuild-wasm') | null = null;
let initPromise: Promise<void> | null = null;
let wasmURL = ESBUILD_WASM_BINARY_CDN;
let globalVFS: VirtualFS | null = null;

/**
 * Set the VirtualFS instance for file access
 */
export function setVFS(vfs: VirtualFS): void {
  globalVFS = vfs;
}

/**
 * Set the URL for the esbuild WASM file
 */
export function setWasmURL(url: string): void {
  wasmURL = url;
}

/**
 * Initialize esbuild-wasm
 * Must be called before using transform or build
 */
export async function initialize(options?: { wasmURL?: string }): Promise<void> {
  if (esbuildInstance) {
    return; // Already initialized
  }

  // Check for shared esbuild instance from transform.ts
  if (typeof window !== 'undefined' && window.__esbuild) {
    esbuildInstance = window.__esbuild;
    return;
  }

  // Wait for any in-progress initialization from transform.ts
  if (typeof window !== 'undefined' && window.__esbuildInitPromise) {
    await window.__esbuildInitPromise;
    if (window.__esbuild) {
      esbuildInstance = window.__esbuild;
      return;
    }
  }

  if (initPromise) {
    return initPromise; // Our initialization in progress
  }

  initPromise = (async () => {
    try {
      // Dynamically import esbuild-wasm from CDN
      const esbuild = await import(
        /* @vite-ignore */
        ESBUILD_WASM_BROWSER_CDN
      );

      await esbuild.initialize({
        wasmURL: options?.wasmURL || wasmURL,
      });

      esbuildInstance = esbuild;
    } catch (error) {
      initPromise = null;
      throw new Error(`Failed to initialize esbuild-wasm: ${error}`);
    }
  })();

  return initPromise;
}

/**
 * Check if esbuild is initialized
 */
export function isInitialized(): boolean {
  return esbuildInstance !== null;
}

// ============================================================================
// Transform API
// ============================================================================

/**
 * Transform code using esbuild
 */
export async function transform(
  code: string,
  options?: TransformOptions
): Promise<TransformResult> {
  if (!esbuildInstance) {
    await initialize();
  }

  if (!esbuildInstance) {
    throw new Error('esbuild not initialized');
  }

  return esbuildInstance.transform(code, options);
}

/**
 * Transform code synchronously (requires prior initialization)
 */
export function transformSync(
  code: string,
  options?: TransformOptions
): TransformResult {
  if (!esbuildInstance) {
    throw new Error('esbuild not initialized. Call initialize() first.');
  }

  // esbuild-wasm doesn't have sync API in browser, so we throw
  throw new Error('transformSync is not available in browser. Use transform() instead.');
}

/**
 * Transform ESM to CJS
 */
export async function transformToCommonJS(
  code: string,
  options?: { loader?: TransformOptions['loader'] }
): Promise<string> {
  const result = await transform(code, {
    loader: options?.loader || 'js',
    format: 'cjs',
    target: 'es2020',
  });

  return result.code;
}

// ============================================================================
// VFS Path Resolution Helpers
// ============================================================================

/**
 * Apply path remapping for VFS.
 * Currently a passthrough — no remapping needed.
 */
function remapVFSPath(path: string): string {
  return path;
}

/**
 * Check if file exists at path or remapped path
 * Returns the original path if found (to preserve output naming)
 */
function findVFSFile(vfs: VirtualFS, originalPath: string, extensions: string[]): string | null {
  for (const ext of extensions) {
    const pathWithExt = originalPath + ext;
    // First check original path — must be a file, not a directory
    if (vfs.existsSync(pathWithExt)) {
      try {
        if (!vfs.statSync(pathWithExt).isDirectory()) {
          return pathWithExt;
        }
      } catch {
        return pathWithExt;
      }
    }
    // Then try remapped path
    const remapped = remapVFSPath(pathWithExt);
    if (remapped !== pathWithExt && vfs.existsSync(remapped)) {
      try {
        if (!vfs.statSync(remapped).isDirectory()) {
          return pathWithExt;
        }
      } catch {
        return pathWithExt;
      }
    }
  }
  return null;
}

// ============================================================================
// VFS Plugin for esbuild
// ============================================================================

/**
 * Create a VFS plugin for esbuild to read files from VirtualFS.
 *
 * This plugin enables esbuild to resolve and load files from the virtual file system,
 * which is essential for browser-based bundling where we don't have access to the
 * real file system.
 *
 * The plugin handles three types of imports:
 * 1. Absolute paths (/project/src/file.ts)
 * 2. Relative paths (./file.ts, ../file.ts)
 * 3. Bare imports (convex/server, react)
 */
function createVFSPlugin(externals?: string[]): unknown {
  if (!globalVFS) {
    return null;
  }

  const vfs = globalVFS;

  return {
    name: 'vfs-loader',
    setup(build: unknown) {
      const b = build as {
        onResolve: (options: { filter: RegExp; namespace?: string }, callback: (args: { path: string; importer: string; kind: string }) => unknown) => void;
        onLoad: (options: { filter: RegExp; namespace?: string }, callback: (args: { path: string }) => unknown) => void;
      };

      // Helper: Normalize .mjs/.cjs paths to .js so esbuild auto-detects
      // module format. Packages in VFS were ESM→CJS transformed during install
      // but keep their original .mjs extension. esbuild forces ESM parsing for
      // .mjs files even when content is CJS, breaking export detection.
      // We store the real path in pluginData for onLoad to read from VFS.
      function vfsResolved(foundPath: string) {
        if (foundPath.endsWith('.mjs') || foundPath.endsWith('.cjs')) {
          const jsPath = foundPath.slice(0, -4) + '.js';
          return { path: jsPath, pluginData: { fromVFS: true, realPath: foundPath } };
        }
        return { path: foundPath, pluginData: { fromVFS: true } };
      }

      // Resolve file paths - handles both imports and entry points
      b.onResolve({ filter: /.*/ }, (args: { path: string; importer: string }) => {
        const { path: importPath, importer } = args;

        // Skip external modules (node_modules, bare imports)
        if (importPath.startsWith('node_modules/')) {
          return { external: true };
        }

        const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];

        // Absolute paths - check if file exists in VFS (or remapped location)
        if (importPath.startsWith('/')) {
          const foundPath = findVFSFile(vfs, importPath, extensions);
          if (foundPath) {
            return vfsResolved(foundPath);
          }
          // File not found
          return { external: true };
        }

        // Relative paths
        if (importPath.startsWith('.')) {
          let resolved = importPath;
          if (importer) {
            // Use realPath from pluginData if the importer was remapped from .mjs/.cjs
            const importerDir = importer.substring(0, importer.lastIndexOf('/'));
            resolved = importerDir + '/' + importPath;
          }
          // Normalize path
          const parts = resolved.split('/').filter(Boolean);
          const normalized: string[] = [];
          for (const part of parts) {
            if (part === '..') {
              normalized.pop();
            } else if (part !== '.') {
              normalized.push(part);
            }
          }
          resolved = '/' + normalized.join('/');

          // Try to find the file with various extensions
          const foundPath = findVFSFile(vfs, resolved, extensions);
          if (foundPath) {
            return vfsResolved(foundPath);
          }

          // Try index files
          for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
            const indexPath = resolved + '/index' + ext;
            const foundIndex = findVFSFile(vfs, indexPath, ['']);
            if (foundIndex) {
              return vfsResolved(foundIndex);
            }
          }
        }

        // Bare imports (no ./ or ../ or /) - resolve from node_modules in VFS
        // See resolveNodeModuleImport() JSDoc for why we resolve from VFS instead of
        // marking as external (browser bundling, VFS isolation, consistent builds)

        // Check externals list first — packages like react must stay as ESM imports
        if (externals && externals.some(ext => importPath === ext || importPath.startsWith(ext + '/'))) {
          return { external: true };
        }

        const resolution = resolveNodeModuleImport(vfs, importPath, extensions);
        if (resolution) {
          // Apply .mjs/.cjs normalization for bare imports too
          if (resolution.path && (resolution.path.endsWith('.mjs') || resolution.path.endsWith('.cjs'))) {
            const jsPath = resolution.path.slice(0, -4) + '.js';
            return { path: jsPath, pluginData: { ...resolution.pluginData, realPath: resolution.path } };
          }
          return resolution;
        }

        // Node.js builtins that aren't in VFS node_modules should be
        // stubbed as empty modules rather than externalized. When externalized,
        // patchExternalRequires() converts them to bare ESM imports that the
        // browser can't resolve. An empty stub is safe because these builtins
        // are typically only used in server-only code paths (e.g., @vercel/oidc).
        const bareModule = importPath.replace(/^node:/, '');
        if (NODE_BUILTINS.has(bareModule)) {
          return { path: `/__node_stub__/${bareModule}`, namespace: 'node-stub' };
        }

        // Could not resolve from node_modules, treat as external
        return { external: true };
      });

      // Load empty stubs for Node.js builtins not available in VFS
      b.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => {
        return { contents: 'module.exports = {};', loader: 'js' as const };
      });

      // Load file contents from VFS
      // Apply path remapping when reading to find the actual file
      b.onLoad({ filter: /^\/.*/ }, (args: { path: string; pluginData?: { fromVFS?: boolean; realPath?: string } }) => {
        // Only handle files that were resolved by our plugin
        if (!args.pluginData?.fromVFS) {
          return null; // Let other loaders handle it
        }
        try {
          // Use realPath if available (set when .mjs/.cjs was normalized to .js)
          const vfsPath = args.pluginData.realPath || args.path;
          let contents: string;
          const remappedPath = remapVFSPath(vfsPath);

          if (vfs.existsSync(vfsPath)) {
            contents = vfs.readFileSync(vfsPath, 'utf8');
          } else if (remappedPath !== vfsPath && vfs.existsSync(remappedPath)) {
            contents = vfs.readFileSync(remappedPath, 'utf8');
          } else {
            throw new Error(`File not found: ${vfsPath} (tried ${remappedPath})`);
          }

          const ext = args.path.substring(args.path.lastIndexOf('.'));
          let loader: 'ts' | 'tsx' | 'js' | 'jsx' | 'json' = 'ts';
          if (ext === '.tsx') loader = 'tsx';
          else if (ext === '.js' || ext === '.mjs' || ext === '.cjs') loader = 'js';
          else if (ext === '.jsx') loader = 'jsx';
          else if (ext === '.json') loader = 'json';

          return { contents, loader };
        } catch (err) {
          return { errors: [{ text: `Failed to load ${args.path}: ${err}` }] };
        }
      });
    },
  };
}

// ============================================================================
// Build API
// ============================================================================

/**
 * Build/bundle code (limited support in browser)
 */
export async function build(options: BuildOptions): Promise<BuildResult> {
  if (!esbuildInstance) {
    await initialize();
  }

  if (!esbuildInstance) {
    throw new Error('esbuild not initialized');
  }

  // Add VFS plugin if VFS is available
  const vfsPlugin = createVFSPlugin(options.external);
  const plugins = [...(options.plugins || [])];
  if (vfsPlugin) {
    plugins.unshift(vfsPlugin);
  }

  // Resolve entry points to absolute paths.
  // Path remapping (if any) happens in the VFS plugin's onLoad handler instead,
  // preserving the original paths for esbuild's output file naming.
  let entryPoints = options.entryPoints;
  if (entryPoints && globalVFS) {
    const absWorkingDir = options.absWorkingDir || (typeof globalThis !== 'undefined' && globalThis.process && typeof globalThis.process.cwd === 'function' ? globalThis.process.cwd() : '/');
    entryPoints = entryPoints.map(ep => {
      // Handle paths that came from previous builds with vfs: namespace prefix
      if (ep.includes('vfs:')) {
        const vfsIndex = ep.indexOf('vfs:');
        ep = ep.substring(vfsIndex + 4);
      }

      // If already absolute, use as-is
      if (ep.startsWith('/')) {
        return ep;
      }

      if (ep.startsWith('./')) {
        // Join with absWorkingDir but DO NOT remap paths
        const base = absWorkingDir.endsWith('/') ? absWorkingDir.slice(0, -1) : absWorkingDir;
        const relative = ep.slice(2);
        const resolved = base + '/' + relative;
        return resolved;
      }
      if (ep.startsWith('../')) {
        const base = absWorkingDir.endsWith('/') ? absWorkingDir.slice(0, -1) : absWorkingDir;
        const parts = base.split('/').filter(Boolean);
        parts.pop();
        const relative = ep.slice(3);
        const resolved = '/' + parts.join('/') + '/' + relative;
        return resolved;
      }
      return ep;
    });
  }

  // In browser, we need write: false to get outputFiles
  // Pass absWorkingDir so metafile paths are relative to the correct directory
  const resolvedAbsWorkingDir = options.absWorkingDir || (typeof globalThis !== 'undefined' && globalThis.process && typeof globalThis.process.cwd === 'function' ? globalThis.process.cwd() : '/');
  const result = await esbuildInstance.build({
    ...options,
    entryPoints,
    plugins,
    write: false,
    absWorkingDir: resolvedAbsWorkingDir,
  }) as BuildResult;

  // Strip 'vfs:' namespace prefix from all output paths.
  // esbuild-wasm may prefix paths with the plugin namespace; strip it everywhere.
  if (result.outputFiles) {
    for (const file of result.outputFiles) {
      if (file.path.includes('vfs:')) {
        file.path = file.path.replace(/vfs:/g, '');
      }
    }
  }
  if (result.metafile) {
    const meta = result.metafile as { inputs?: Record<string, unknown>; outputs?: Record<string, unknown> };
    for (const key of ['inputs', 'outputs'] as const) {
      const obj = meta[key];
      if (obj) {
        for (const k of Object.keys(obj)) {
          if (k.includes('vfs:')) {
            obj[k.replace(/vfs:/g, '')] = obj[k];
            delete obj[k];
          }
        }
      }
    }
  }

  return result;
}

/**
 * Build synchronously (not supported in browser, throws error)
 */
export function buildSync(_options: BuildOptions): BuildResult {
  throw new Error('buildSync is not available in browser. Use build() instead.');
}

/**
 * Get the esbuild version
 */
export function version(): string {
  return '0.20.0'; // Version of esbuild-wasm we're using
}

// Context API (minimal stub for compatibility)
export async function context(_options: BuildOptions): Promise<unknown> {
  throw new Error('esbuild context API is not supported in browser');
}

// Default export matching esbuild's API
export default {
  initialize,
  isInitialized,
  transform,
  transformSync,
  transformToCommonJS,
  build,
  buildSync,
  context,
  version,
  setWasmURL,
  setVFS,
};
