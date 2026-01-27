/**
 * Rollup shim - Uses @rollup/browser for browser-compatible Rollup
 *
 * Vite uses Rollup for bundling. The native Rollup package doesn't work
 * in browsers, so we need to use @rollup/browser instead.
 */

// Rollup instance loaded from CDN
let rollupInstance: unknown = null;
let loadPromise: Promise<unknown> | null = null;

/**
 * Load Rollup from CDN
 */
async function loadRollup(): Promise<unknown> {
  if (rollupInstance) return rollupInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      // Load @rollup/browser from CDN
      const rollup = await import(
        /* @vite-ignore */
        'https://esm.sh/@rollup/browser@4.9.0'
      );
      rollupInstance = rollup;
      console.log('[rollup] Browser version loaded');
      return rollup;
    } catch (error) {
      console.error('[rollup] Failed to load browser version:', error);
      loadPromise = null;
      throw error;
    }
  })();

  return loadPromise;
}

// For synchronous require(), we need a stub that works before async load
// This will be replaced when loadRollup() is called

export const VERSION = '4.9.0';

export async function rollup(options: unknown): Promise<unknown> {
  const r = await loadRollup() as { rollup: (options: unknown) => Promise<unknown> };
  return r.rollup(options);
}

export async function watch(options: unknown): Promise<unknown> {
  const r = await loadRollup() as { watch: (options: unknown) => unknown };
  return r.watch(options);
}

// Export a function to pre-load rollup
export { loadRollup };

// Define plugin context types that Vite expects
export interface Plugin {
  name: string;
  [key: string]: unknown;
}

export interface PluginContext {
  meta: { rollupVersion: string };
  parse: (code: string) => unknown;
  [key: string]: unknown;
}

// Stub for native module detection - this prevents the "unsupported platform" error
export function getPackageBase(): string {
  return '';
}

// Export default that matches Rollup's API
export default {
  VERSION,
  rollup,
  watch,
  loadRollup,
};
