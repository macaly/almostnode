/**
 * VFS-based module resolution and loading for API route handlers.
 *
 * Lightweight module loader extracted from Runtime (src/runtime.ts).
 * Resolves and loads CJS modules from VirtualFS node_modules so API
 * route handlers can `require()` npm packages installed via PackageManager.
 *
 * Packages are expected to be pre-transformed to CJS by PackageManager
 * (via esbuild-wasm). A safety-net ESM→CJS transform is applied for
 * any files that weren't pre-transformed.
 */

import { VirtualFS } from '../virtual-fs';
import { resolve as resolveExports } from 'resolve.exports';
import * as pathShim from '../shims/path';
import { transformEsmToCjsSimple } from './code-transforms';
import type { PackageJson } from '../types/package-json';

export interface VfsModule {
  id: string;
  filename: string;
  exports: unknown;
  loaded: boolean;
}

export interface VfsRequireOptions {
  /** Builtin modules (node shims + user-supplied apiModules) */
  builtinModules: Record<string, unknown>;
  /** Process object to inject into loaded modules */
  process: Record<string, unknown>;
  /** Shared module cache (persists across requests). If not provided, a new one is created. */
  moduleCache?: Record<string, VfsModule>;
}

/**
 * Create a require() function that resolves modules from VFS.
 *
 * Resolution order:
 * 1. Builtin modules (node shims + apiModules)
 * 2. Bare package imports from /node_modules/ (walking up directories)
 * 3. Relative paths within packages
 *
 * Handles package.json exports, browser, module, main fields.
 * Handles JSON files, CJS stub detection, and module caching.
 */
export function createVfsRequire(
  vfs: VirtualFS,
  fromDir: string,
  options: VfsRequireOptions,
): { require: (id: string) => unknown; moduleCache: Record<string, VfsModule> } {
  const { builtinModules, process } = options;
  const moduleCache = options.moduleCache || {};

  // Package.json parsing cache (resolution-only, not module instances)
  const packageJsonCache = new Map<string, PackageJson | null>();

  function getParsedPackageJson(pkgPath: string): PackageJson | null {
    if (packageJsonCache.has(pkgPath)) return packageJsonCache.get(pkgPath)!;
    try {
      const content = vfs.readFileSync(pkgPath, 'utf8');
      const parsed = JSON.parse(content) as PackageJson;
      packageJsonCache.set(pkgPath, parsed);
      return parsed;
    } catch {
      packageJsonCache.set(pkgPath, null);
      return null;
    }
  }

  // ── Resolution ──

  function tryResolveFile(basePath: string): string | null {
    // Exact path
    if (vfs.existsSync(basePath)) {
      try {
        const stats = vfs.statSync(basePath);
        if (stats.isFile()) return basePath;
        // Directory → index.js
        const indexPath = pathShim.join(basePath, 'index.js');
        if (vfs.existsSync(indexPath)) return indexPath;
      } catch { /* ignore */ }
    }
    // Try extensions
    for (const ext of ['.js', '.json']) {
      const withExt = basePath + ext;
      if (vfs.existsSync(withExt)) return withExt;
    }
    return null;
  }

  function tryResolveFromNodeModules(nodeModulesDir: string, moduleId: string): string | null {
    const parts = moduleId.split('/');
    const pkgName = parts[0].startsWith('@') && parts.length > 1
      ? `${parts[0]}/${parts[1]}`
      : parts[0];

    const pkgRoot = pathShim.join(nodeModulesDir, pkgName);
    const pkgPath = pathShim.join(pkgRoot, 'package.json');

    const pkg = getParsedPackageJson(pkgPath);
    if (pkg) {
      // Use resolve.exports to handle the exports field
      if (pkg.exports) {
        for (const conditions of [{ require: true }, { import: true }] as const) {
          try {
            const resolved = resolveExports(pkg, moduleId, conditions);
            if (resolved && resolved.length > 0) {
              const fullExportPath = pathShim.join(pkgRoot, resolved[0]);
              const resolvedFile = tryResolveFile(fullExportPath);
              if (resolvedFile) {
                // Skip CJS stub files that just throw
                if (resolvedFile.endsWith('.cjs')) {
                  try {
                    const content = vfs.readFileSync(resolvedFile, 'utf8') as string;
                    if (content.trimStart().startsWith('throw ')) continue;
                  } catch { /* proceed */ }
                }
                return resolvedFile;
              }
            }
          } catch { /* resolveExports throws if no match, try next */ }
        }
      }

      // If root import (no sub-path), use browser/module/main
      if (pkgName === moduleId) {
        let main: string | undefined;
        if (typeof pkg.browser === 'string') main = pkg.browser;
        if (!main && pkg.module) main = pkg.module as string;
        if (!main) main = pkg.main || 'index.js';
        const resolvedMain = tryResolveFile(pathShim.join(pkgRoot, main));
        if (resolvedMain) return resolvedMain;
      }
    }

    // Fallback: direct file/directory resolution for sub-paths
    const fullPath = pathShim.join(nodeModulesDir, moduleId);
    return tryResolveFile(fullPath);
  }

  function resolveModule(id: string, currentDir: string): string {
    // Relative or absolute path
    if (id.startsWith('./') || id.startsWith('../') || id.startsWith('/')) {
      const resolved = tryResolveFile(pathShim.resolve(currentDir, id));
      if (resolved) return resolved;
      throw new Error(`Cannot find module '${id}'`);
    }

    // Walk up directories looking for node_modules
    let searchDir = currentDir;
    while (true) {
      const nodeModulesDir = pathShim.join(searchDir, 'node_modules');
      const resolved = tryResolveFromNodeModules(nodeModulesDir, id);
      if (resolved) return resolved;

      const parent = pathShim.dirname(searchDir);
      if (parent === searchDir) break;
      searchDir = parent;
    }

    // Try root node_modules as last resort
    const rootResolved = tryResolveFromNodeModules('/node_modules', id);
    if (rootResolved) return rootResolved;

    throw new Error(`Cannot find module '${id}'`);
  }

  // ── Loading ──

  function loadModule(resolvedPath: string): VfsModule {
    // Return cached module
    if (moduleCache[resolvedPath]) return moduleCache[resolvedPath];

    const mod: VfsModule = {
      id: resolvedPath,
      filename: resolvedPath,
      exports: {},
      loaded: false,
    };

    // Cache before loading (circular dependency support)
    moduleCache[resolvedPath] = mod;

    // Evict oldest if cache too large
    const keys = Object.keys(moduleCache);
    if (keys.length > 2000) delete moduleCache[keys[0]];

    // JSON files
    if (resolvedPath.endsWith('.json')) {
      mod.exports = JSON.parse(vfs.readFileSync(resolvedPath, 'utf8'));
      mod.loaded = true;
      return mod;
    }

    // JS files
    let code = vfs.readFileSync(resolvedPath, 'utf8');
    const dirname = pathShim.dirname(resolvedPath);

    // Strip shebang
    if (code.startsWith('#!')) {
      code = code.slice(code.indexOf('\n') + 1);
    }

    // Safety-net ESM→CJS transform (packages should already be CJS from PackageManager)
    if (!resolvedPath.endsWith('.cjs')) {
      const hasEsm = /\bimport\b|\bexport\b/.test(code);
      if (hasEsm) {
        code = transformEsmToCjsSimple(code);
      }
    }

    // Create require scoped to this module's directory
    const moduleRequire = (id: string) => requireFn(id, dirname);

    // Execute module code
    try {
      const moduleObj = { exports: mod.exports as Record<string, unknown> };
      const fn = new Function(
        'exports', 'require', 'module', '__filename', '__dirname', 'process',
        code,
      );
      fn(moduleObj.exports, moduleRequire, moduleObj, resolvedPath, dirname, process);

      // Update exports (module.exports may have been reassigned)
      mod.exports = moduleObj.exports;
      mod.loaded = true;
    } catch (error) {
      delete moduleCache[resolvedPath];
      if (error instanceof Error && !error.message.includes('(in /')) {
        error.message = `${error.message} (in ${resolvedPath})`;
      }
      throw error;
    }

    return mod;
  }

  // ── Public require function ──

  function requireFn(id: string, currentDir: string): unknown {
    // Strip node: prefix
    const modId = id.startsWith('node:') ? id.slice(5) : id;

    // Builtins first
    if (builtinModules[modId]) return builtinModules[modId];

    // Resolve from VFS
    const resolved = resolveModule(modId, currentDir);
    return loadModule(resolved).exports;
  }

  return {
    require: (id: string) => requireFn(id, fromDir),
    moduleCache,
  };
}
