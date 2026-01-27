/**
 * ESM to CJS Transformer using esbuild-wasm
 *
 * Transforms ES modules to CommonJS format during npm install,
 * so require() can work synchronously.
 */

import { VirtualFS } from './virtual-fs';

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// esbuild instance
let esbuild: {
  transform: (code: string, options: unknown) => Promise<{ code: string }>;
  initialize: (options: unknown) => Promise<void>;
} | null = null;

let initPromise: Promise<void> | null = null;

/**
 * Initialize esbuild-wasm
 */
export async function initTransformer(): Promise<void> {
  // Skip in non-browser environments (tests)
  if (!isBrowser) {
    console.log('[transform] Skipping esbuild init (not in browser)');
    return;
  }

  if (esbuild) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('[transform] Loading esbuild-wasm...');

      // Load esbuild-wasm from CDN
      const mod = await import(
        /* @vite-ignore */
        'https://esm.sh/esbuild-wasm@0.20.0'
      );

      // esm.sh wraps the module - get the actual esbuild object
      const esbuildMod = mod.default || mod;

      await esbuildMod.initialize({
        wasmURL: 'https://unpkg.com/esbuild-wasm@0.20.0/esbuild.wasm',
      });

      esbuild = esbuildMod;
      console.log('[transform] esbuild-wasm initialized');
    } catch (error) {
      console.error('[transform] Failed to initialize esbuild:', error);
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Check if transformer is ready
 */
export function isTransformerReady(): boolean {
  // In non-browser, we skip transformation
  if (!isBrowser) return true;
  return esbuild !== null;
}

/**
 * Transform a single file from ESM to CJS
 */
export async function transformFile(
  code: string,
  filename: string
): Promise<string> {
  // Skip in non-browser environments
  if (!isBrowser) {
    return code;
  }

  if (!esbuild) {
    await initTransformer();
  }

  if (!esbuild) {
    throw new Error('esbuild not initialized');
  }

  // Determine loader based on file extension
  let loader: 'js' | 'jsx' | 'ts' | 'tsx' = 'js';
  if (filename.endsWith('.jsx')) loader = 'jsx';
  else if (filename.endsWith('.ts')) loader = 'ts';
  else if (filename.endsWith('.tsx')) loader = 'tsx';
  else if (filename.endsWith('.mjs')) loader = 'js';

  try {
    const result = await esbuild.transform(code, {
      loader,
      format: 'cjs',
      target: 'esnext',
      platform: 'neutral',
      // Replace import.meta with our runtime-provided variable
      // This is the proper esbuild way to handle import.meta in CJS
      define: {
        'import.meta.url': 'import_meta.url',
        'import.meta.dirname': 'import_meta.dirname',
        'import.meta.filename': 'import_meta.filename',
        'import.meta': 'import_meta',
      },
    });

    let transformed = result.code;

    // Convert dynamic import() of node: modules to require()
    // This is necessary because the browser tries to fetch 'node:http' as a URL
    // Pattern: import("node:xxx") or import('node:xxx') -> Promise.resolve(require("node:xxx"))
    transformed = transformed.replace(
      /\bimport\s*\(\s*["']node:([^"']+)["']\s*\)/g,
      'Promise.resolve(require("node:$1"))'
    );

    // Also handle dynamic imports of bare node built-in modules (without node: prefix)
    const nodeBuiltins = [
      'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns',
      'events', 'fs', 'http', 'http2', 'https', 'net', 'os', 'path', 'perf_hooks',
      'querystring', 'readline', 'stream', 'string_decoder', 'timers', 'tls',
      'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib', 'async_hooks', 'inspector', 'module'
    ];
    for (const builtin of nodeBuiltins) {
      // Match import("fs") or import('fs') but not import("fs-extra") etc
      const pattern = new RegExp(`\\bimport\\s*\\(\\s*["']${builtin}["']\\s*\\)`, 'g');
      transformed = transformed.replace(pattern, `Promise.resolve(require("${builtin}"))`);
    }

    return transformed;
  } catch (error: unknown) {
    // Check if it's a top-level await error - these files are usually CLI entry points
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('Top-level await')) {
      console.log(`[transform] Skipping ${filename} (has top-level await, likely CLI entry point)`);
      // Return original code - it won't be require()'d directly anyway
      return code;
    }

    console.warn(`[transform] Failed to transform ${filename}:`, error);
    // Return original code if transform fails
    return code;
  }
}

/**
 * Check if a file needs ESM to CJS transformation
 */
function needsTransform(filename: string, code: string): boolean {
  // .mjs files are always ESM
  if (filename.endsWith('.mjs')) {
    return true;
  }

  // .cjs files are always CJS
  if (filename.endsWith('.cjs')) {
    return false;
  }

  // Check for ESM syntax
  const hasImport = /\bimport\s+[\w{*'"]/m.test(code);
  const hasExport = /\bexport\s+(?:default|const|let|var|function|class|{|\*)/m.test(code);
  const hasImportMeta = /\bimport\.meta\b/.test(code);

  return hasImport || hasExport || hasImportMeta;
}

/**
 * Check if a file has dynamic imports that need patching
 */
function hasDynamicNodeImports(code: string): boolean {
  // Check for import("node:...") or import('node:...')
  if (/\bimport\s*\(\s*["']node:/.test(code)) {
    return true;
  }
  // Check for dynamic imports of common node builtins
  if (/\bimport\s*\(\s*["'](fs|path|http|https|net|url|util|events|stream|os|crypto)["']/.test(code)) {
    return true;
  }
  return false;
}

/**
 * Patch dynamic imports in already-CJS code (e.g., pre-bundled packages)
 */
function patchDynamicImports(code: string): string {
  let patched = code;

  // Convert dynamic import() of node: modules to require()
  patched = patched.replace(
    /\bimport\s*\(\s*["']node:([^"']+)["']\s*\)/g,
    'Promise.resolve(require("node:$1"))'
  );

  // Also handle dynamic imports of bare node built-in modules
  const nodeBuiltins = [
    'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns',
    'events', 'fs', 'http', 'http2', 'https', 'net', 'os', 'path', 'perf_hooks',
    'querystring', 'readline', 'stream', 'string_decoder', 'timers', 'tls',
    'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib', 'async_hooks', 'inspector', 'module'
  ];
  for (const builtin of nodeBuiltins) {
    const pattern = new RegExp(`\\bimport\\s*\\(\\s*["']${builtin}["']\\s*\\)`, 'g');
    patched = patched.replace(pattern, `Promise.resolve(require("${builtin}"))`);
  }

  return patched;
}

/**
 * Transform all ESM files in a package directory to CJS
 */
export async function transformPackage(
  vfs: VirtualFS,
  pkgPath: string,
  onProgress?: (msg: string) => void
): Promise<number> {
  let transformedCount = 0;

  // Find all JS files in the package
  const jsFiles = findJsFiles(vfs, pkgPath);

  onProgress?.(`  Transforming ${jsFiles.length} files in ${pkgPath}...`);

  // Transform files in batches
  const BATCH_SIZE = 10;
  for (let i = 0; i < jsFiles.length; i += BATCH_SIZE) {
    const batch = jsFiles.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (filePath) => {
        try {
          const code = vfs.readFileSync(filePath, 'utf8');

          if (needsTransform(filePath, code)) {
            // Full ESM to CJS transformation
            const transformed = await transformFile(code, filePath);
            vfs.writeFileSync(filePath, transformed);
            transformedCount++;
          } else if (hasDynamicNodeImports(code)) {
            // Just patch dynamic imports in already-CJS code
            const patched = patchDynamicImports(code);
            vfs.writeFileSync(filePath, patched);
            transformedCount++;
          }
        } catch (error) {
          // Skip files that can't be read/transformed
          console.warn(`[transform] Skipping ${filePath}:`, error);
        }
      })
    );
  }

  return transformedCount;
}

/**
 * Find all JavaScript files in a directory recursively
 */
function findJsFiles(vfs: VirtualFS, dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = vfs.readdirSync(dir);

    for (const entry of entries) {
      const fullPath = dir + '/' + entry;

      try {
        const stat = vfs.statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip node_modules inside packages (nested deps)
          if (entry !== 'node_modules') {
            files.push(...findJsFiles(vfs, fullPath));
          }
        } else if (
          entry.endsWith('.js') ||
          entry.endsWith('.mjs') ||
          entry.endsWith('.jsx')
        ) {
          files.push(fullPath);
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return files;
}
