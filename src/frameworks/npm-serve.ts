/**
 * NPM package bundling for browser consumption.
 *
 * Bundles npm packages installed in VFS node_modules into single ESM files
 * using esbuild-wasm. This replaces esm.sh CDN for packages that are
 * locally installed, giving us full control over resolution (no CDN bugs).
 *
 * React packages are kept external — they continue to load from esm.sh
 * so the entire app shares one React instance.
 */

import { build, setVFS, type BuildResult } from '../shims/esbuild';
import type { VirtualFS } from '../virtual-fs';

/** Packages that must stay external (loaded via import map / esm.sh). */
const ALWAYS_EXTERNAL = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom/client',
];

/** In-memory cache: specifier → bundled ESM code. */
const bundleCache = new Map<string, string>();

/** VFS instance for resolving package entry points. */
let moduleVFS: VirtualFS | null = null;

/** Clear the bundle cache (e.g., after npm install). */
export function clearNpmBundleCache(): void {
  bundleCache.clear();
}

/**
 * Ensure the esbuild VFS plugin can access our virtual file system.
 * Must be called before bundleNpmModuleForBrowser.
 */
export function initNpmServe(vfs: VirtualFS): void {
  setVFS(vfs);
  moduleVFS = vfs;
}

/**
 * Resolve a package specifier to its CJS entry point in VFS.
 * Prefers `require` condition over `import` to avoid .mjs files
 * (which were ESM→CJS transformed but keep the .mjs extension,
 * confusing esbuild's module format detection).
 */
/**
 * Recursively resolve nested export conditions to a file path string.
 * Handles doubly-nested conditions like convex uses:
 *   { "import": { "types": "...", "import": "./dist/esm/server/index.js" },
 *     "require": { "types": "...", "require": "./dist/cjs/server/index.js" } }
 *
 * Prefers require > import > module > default (CJS-first to avoid .mjs issues).
 * Skips 'types' condition (resolves to .d.ts files).
 */
const CJS_CONDITION_PRIORITY = ['require', 'import', 'module', 'default'] as const;

function resolveExportEntry(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object' && entry !== null) {
    const obj = entry as Record<string, unknown>;
    for (const condition of CJS_CONDITION_PRIORITY) {
      const value = obj[condition];
      if (value !== undefined) {
        const result = resolveExportEntry(value);
        if (result) return result;
      }
    }
  }
  return undefined;
}

/** Check that a VFS path is an existing file (not a directory). */
function isFile(path: string): boolean {
  if (!moduleVFS) return false;
  if (!moduleVFS.existsSync(path)) return false;
  try { return !moduleVFS.statSync(path).isDirectory(); } catch { return false; }
}

function resolvePackageEntry(specifier: string): string | null {
  if (!moduleVFS) return null;

  const parts = specifier.split('/');
  const isScoped = parts[0].startsWith('@');
  const pkgName = isScoped ? parts.slice(0, 2).join('/') : parts[0];
  const subPath = isScoped ? parts.slice(2).join('/') : parts.slice(1).join('/');

  const pkgDir = '/node_modules/' + pkgName;
  const pkgJsonPath = pkgDir + '/package.json';
  if (!moduleVFS.existsSync(pkgJsonPath)) return null;

  try {
    const pkgJson = JSON.parse(moduleVFS.readFileSync(pkgJsonPath, 'utf8'));
    const exports = pkgJson.exports;

    if (exports && typeof exports === 'object') {
      const key = subPath ? './' + subPath : '.';
      const entry = (exports as Record<string, unknown>)[key];
      if (entry) {
        const resolved = resolveExportEntry(entry);
        if (resolved) {
          const fullPath = pkgDir + '/' + resolved.replace(/^\.\//, '');
          if (isFile(fullPath)) return fullPath;
        }
      }
    }

    // Fallback to main/module fields
    if (!subPath) {
      const mainEntry = pkgJson.main || pkgJson.module;
      if (mainEntry) {
        const fullPath = pkgDir + '/' + mainEntry.replace(/^\.\//, '');
        if (isFile(fullPath)) return fullPath;
      }
      // Default: index.js
      const defaultPath = pkgDir + '/index.js';
      if (isFile(defaultPath)) return defaultPath;
    } else {
      // Direct path for subpath imports
      const directPath = pkgDir + '/' + subPath;
      for (const ext of ['', '.js', '.cjs', '.mjs', '.json']) {
        if (isFile(directPath + ext)) return directPath + ext;
      }
    }
  } catch { /* ignore parse errors */ }
  return null;
}

/**
 * Extract named export identifiers from a CJS file produced by ESM→CJS transform.
 * Looks for esbuild's `__export(xxx, { name: () => ... })` pattern.
 */
function extractCjsExportNames(content: string): string[] {
  // Match esbuild's __export(varName, { key: () => ..., key2: () => ... })
  const match = content.match(/__export\(\w+,\s*\{([^}]+)\}/);
  if (match) {
    return [...match[1].matchAll(/(\w+)\s*:/g)]
      .map(m => m[1])
      .filter(n => n !== 'default' && n !== '__esModule');
  }
  // Fallback: exports.X = ... pattern
  return [...new Set(
    [...content.matchAll(/exports\.(\w+)\s*=/g)]
      .map(m => m[1])
      .filter(n => n !== 'default' && n !== '__esModule')
  )];
}

/**
 * Post-process esbuild's CJS→ESM bundle to add explicit named exports.
 *
 * esbuild wraps CJS entries as `export default require_xxx();` with no named
 * exports. We find the require function name from that line, then append
 * explicit `export var X = __pkg.X;` for each known export name.
 */
function addNamedExports(code: string, exportNames: string[]): string {
  if (exportNames.length === 0) return code;

  // Find `export default require_xxx();` — the CJS wrapper export
  const match = code.match(/export\s+default\s+(require_\w+)\(\)\s*;?/);
  if (!match) return code;

  const fnName = match[0];
  const requireFn = match[1];

  const replacement =
    `var __pkg = ${requireFn}();\nexport default __pkg;\n` +
    exportNames.map(n => `export var ${n} = __pkg.${n};`).join('\n') + '\n';

  return code.replace(fnName, replacement);
}

/**
 * Replace esbuild's `__require("ext")` calls with proper ESM imports.
 *
 * esbuild generates `__require("react")` for CJS external dependencies in ESM
 * format, which throws at runtime. We find ALL `__require("...")` calls,
 * add ESM `import * as` declarations at the top, and replace each call
 * with the namespace reference.
 */
function patchExternalRequires(code: string): string {
  // Find all unique __require("specifier") calls
  const matches = new Set<string>();
  for (const m of code.matchAll(/__require\(["']([^"']+)["']\)/g)) {
    matches.add(m[1]);
  }
  if (matches.size === 0) return code;

  const specs = [...matches];
  const imports = specs.map((ext, i) =>
    `import * as __ext${i} from "${ext}";`
  ).join('\n');

  let patched = code;
  for (let i = 0; i < specs.length; i++) {
    const ext = specs[i];
    patched = patched.split(`__require("${ext}")`).join(`__ext${i}`);
    patched = patched.split(`__require('${ext}')`).join(`__ext${i}`);
  }

  return imports + '\n' + patched;
}

/**
 * Bundle an npm package from VFS node_modules into a single ESM file.
 *
 * @param specifier - The bare npm specifier (e.g., "@ai-sdk/react", "zod/v4")
 * @returns The bundled ESM code string
 */
export async function bundleNpmModuleForBrowser(specifier: string): Promise<string> {
  // Check cache first
  const cached = bundleCache.get(specifier);
  if (cached) return cached;

  // Resolve the CJS entry point directly to avoid .mjs module format issues.
  // All packages in VFS have been ESM→CJS transformed during install,
  // so we prefer the `require` condition to get a native .js/.cjs file
  // that esbuild can correctly detect as CJS and extract named exports.
  const entryPath = resolvePackageEntry(specifier);

  // Extract named exports from the CJS entry before bundling.
  // esbuild can't statically extract named exports from CJS, so we
  // parse the entry file for __export() patterns and post-process.
  let exportNames: string[] = [];
  if (entryPath && moduleVFS) {
    try {
      const entryContent = moduleVFS.readFileSync(entryPath, 'utf8');
      exportNames = extractCjsExportNames(entryContent);
    } catch { /* ignore read errors */ }
  }

  let result: BuildResult;

  if (entryPath) {
    // Use the resolved CJS entry as a direct entry point
    result = await build({
      entryPoints: [entryPath],
      bundle: true,
      format: 'esm',
      target: 'esnext',
      external: ALWAYS_EXTERNAL,
      write: false,
    });
  } else {
    // Fallback: use stdin with bare specifier (for packages without exports field)
    const virtualEntry = `export * from '${specifier}';\n`;
    result = await build({
      stdin: {
        contents: virtualEntry,
        resolveDir: '/node_modules',
        loader: 'js',
      },
      bundle: true,
      format: 'esm',
      target: 'esnext',
      external: ALWAYS_EXTERNAL,
      write: false,
    });
  }

  if (!result.outputFiles || result.outputFiles.length === 0) {
    throw new Error(`esbuild produced no output for '${specifier}'`);
  }

  // esbuild-wasm's outputFiles have `contents` (Uint8Array) and `text` (getter)
  // Use contents + TextDecoder as a reliable fallback
  const outFile = result.outputFiles[0];
  let code = outFile.text;
  if (!code && outFile.contents && outFile.contents.length > 0) {
    code = new TextDecoder().decode(outFile.contents);
  }

  if (!code) {
    throw new Error(`esbuild produced empty output for '${specifier}' (entry: ${entryPath || 'stdin'})`);
  }

  // Post-process: replace __require("ext") with ESM imports
  code = patchExternalRequires(code);

  // Post-process: add named ESM exports for CJS bundles
  if (exportNames.length > 0) {
    code = addNamedExports(code, exportNames);
  }

  bundleCache.set(specifier, code);
  return code;
}
