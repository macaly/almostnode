/**
 * esbuild shim - Uses esbuild-wasm for transforms in the browser
 */

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
}

export interface BuildResult {
  errors: unknown[];
  warnings: unknown[];
  outputFiles?: Array<{ path: string; contents: Uint8Array; text: string }>;
}

// State
let esbuildInstance: typeof import('esbuild-wasm') | null = null;
let initPromise: Promise<void> | null = null;
let wasmURL = 'https://unpkg.com/esbuild-wasm@0.20.0/esbuild.wasm';

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

  if (initPromise) {
    return initPromise; // Initialization in progress
  }

  initPromise = (async () => {
    try {
      // Dynamically import esbuild-wasm from CDN
      const esbuild = await import(
        /* @vite-ignore */
        'https://unpkg.com/esbuild-wasm@0.20.0/esm/browser.min.js'
      );

      await esbuild.initialize({
        wasmURL: options?.wasmURL || wasmURL,
      });

      esbuildInstance = esbuild;
      console.log('[esbuild] Initialized successfully');
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

  // In browser, we need write: false to get outputFiles
  return esbuildInstance.build({
    ...options,
    write: false,
  });
}

/**
 * Get the esbuild version
 */
export function version(): string {
  return '0.20.0'; // Version of esbuild-wasm we're using
}

// Default export matching esbuild's API
export default {
  initialize,
  isInitialized,
  transform,
  transformSync,
  transformToCommonJS,
  build,
  version,
  setWasmURL,
};
