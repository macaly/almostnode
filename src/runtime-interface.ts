/**
 * Runtime Interface - Common interface for main-thread and worker runtimes
 */

import type { VirtualFS } from './virtual-fs';

export interface IRuntimeOptions {
  cwd?: string;
  env?: Record<string, string>;
  onConsole?: (method: string, args: unknown[]) => void;
}

export interface IModule {
  id: string;
  filename: string;
  exports: unknown;
  loaded: boolean;
  children: IModule[];
  paths: string[];
}

export interface IExecuteResult {
  exports: unknown;
  module: IModule;
}

/**
 * Common runtime interface implemented by both MainThreadRuntime and WorkerRuntime
 */
export interface IRuntime {
  /**
   * Execute code as a module
   */
  execute(code: string, filename?: string): Promise<IExecuteResult>;

  /**
   * Run a file from the virtual file system
   */
  runFile(filename: string): Promise<IExecuteResult>;

  /**
   * Clear the module cache
   */
  clearCache(): void;

  /**
   * Get the virtual file system (only available on main thread runtime)
   */
  getVFS?(): VirtualFS;

  /**
   * Terminate the runtime (only applicable to worker runtime)
   */
  terminate?(): void;
}

/**
 * Options for creating a runtime
 */
export interface CreateRuntimeOptions extends IRuntimeOptions {
  /**
   * Cross-origin sandbox URL for secure code execution.
   * When set, code runs in a cross-origin iframe, providing browser-enforced
   * isolation from cookies, localStorage, and IndexedDB.
   *
   * Example: 'https://myapp-sandbox.vercel.app'
   */
  sandbox?: string;

  /**
   * Explicitly allow same-origin execution (less secure).
   * Required when not using sandbox mode.
   *
   * WARNING: Same-origin execution allows untrusted code to access
   * cookies, localStorage, and other same-origin resources.
   * Only use this for trusted code or demos.
   */
  dangerouslyAllowSameOrigin?: boolean;

  /**
   * Whether to use a Web Worker for code execution (same-origin only)
   * - false (default): Execute on main thread
   * - true: Execute in a Web Worker
   * - 'auto': Use worker if available, fallback to main thread
   *
   * Note: Workers provide thread isolation but NOT origin isolation.
   * They still have access to IndexedDB and can make network requests.
   */
  useWorker?: boolean | 'auto';

  /**
   * URL of the pre-built almostnode runtime worker script.
   *
   * By default, WorkerRuntime uses `new URL('./worker/runtime-worker.ts', import.meta.url)`
   * which Vite resolves at build time. This works fine with Vite, but breaks with Turbopack
   * and Webpack because they try to statically resolve the asset path at build time and fail
   * when the path is a server-relative `/assets/...` URL from the almostnode dist.
   *
   * To fix this, serve the worker file yourself and pass its URL here:
   *
   * @example Next.js (App Router)
   * ```typescript
   * // app/api/almostnode-worker/route.ts
   * import { getWorkerContent } from 'almostnode/next';
   * export async function GET() {
   *   return new Response(getWorkerContent(), {
   *     headers: { 'Content-Type': 'application/javascript' },
   *   });
   * }
   *
   * // In your component:
   * const runtime = await createRuntime(vfs, {
   *   dangerouslyAllowSameOrigin: true,
   *   useWorker: true,
   *   workerUrl: '/api/almostnode-worker',
   * });
   * ```
   */
  workerUrl?: string | URL;
}

/**
 * VFS snapshot for transferring to worker
 */
export interface VFSSnapshot {
  files: VFSFileEntry[];
}

export interface VFSFileEntry {
  path: string;
  type: 'file' | 'directory';
  content?: string; // base64 encoded for binary files
}
