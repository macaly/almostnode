/**
 * Runtime Factory - Create sandboxed, worker, or main-thread runtime
 *
 * SECURITY: By default, createRuntime requires either:
 *   1. A sandbox URL for cross-origin isolation (recommended)
 *   2. Explicit opt-in via dangerouslyAllowSameOrigin for trusted code
 *
 * Usage:
 *   // Secure: Cross-origin sandbox (recommended for untrusted code)
 *   const runtime = await createRuntime(vfs, {
 *     sandbox: 'https://myapp-sandbox.vercel.app'
 *   });
 *
 *   // Same-origin with Worker (for demos/trusted code)
 *   const runtime = await createRuntime(vfs, {
 *     dangerouslyAllowSameOrigin: true,
 *     useWorker: true
 *   });
 *
 *   // Same-origin main thread (least secure, trusted code only)
 *   const runtime = await createRuntime(vfs, {
 *     dangerouslyAllowSameOrigin: true
 *   });
 */

import { Runtime } from './runtime';
import { WorkerRuntime } from './worker-runtime';
import { SandboxRuntime } from './sandbox-runtime';
import type { VirtualFS } from './virtual-fs';
import type { IRuntime, IExecuteResult, CreateRuntimeOptions, IRuntimeOptions } from './runtime-interface';

/**
 * Check if Web Workers are available in the current environment
 */
function isWorkerAvailable(): boolean {
  return typeof Worker !== 'undefined';
}

/**
 * Wrapper that makes the synchronous Runtime conform to the async IRuntime interface
 */
class AsyncRuntimeWrapper implements IRuntime {
  private runtime: Runtime;

  constructor(vfs: VirtualFS, options: IRuntimeOptions = {}) {
    this.runtime = new Runtime(vfs, options);
  }

  async execute(code: string, filename?: string): Promise<IExecuteResult> {
    return Promise.resolve(this.runtime.execute(code, filename));
  }

  async runFile(filename: string): Promise<IExecuteResult> {
    return Promise.resolve(this.runtime.runFile(filename));
  }

  clearCache(): void {
    this.runtime.clearCache();
  }

  getVFS(): VirtualFS {
    return this.runtime.getVFS();
  }

  /**
   * Get the underlying sync Runtime for direct access to sync methods
   */
  getSyncRuntime(): Runtime {
    return this.runtime;
  }
}

/**
 * Create a runtime instance based on configuration
 *
 * SECURITY: Requires either sandbox URL or explicit dangerouslyAllowSameOrigin.
 *
 * @param vfs - Virtual file system instance
 * @param options - Runtime options including sandbox/security settings
 * @returns Promise resolving to IRuntime instance
 * @throws Error if neither sandbox nor dangerouslyAllowSameOrigin is specified
 */
export async function createRuntime(
  vfs: VirtualFS,
  options: CreateRuntimeOptions = {}
): Promise<IRuntime> {
  const { sandbox, dangerouslyAllowSameOrigin, useWorker = false, workerUrl, ...runtimeOptions } = options;

  // SECURE: Cross-origin sandbox mode
  if (sandbox) {
    console.log('[createRuntime] Creating SandboxRuntime (cross-origin isolated)');
    const sandboxRuntime = new SandboxRuntime(sandbox, vfs, runtimeOptions);
    // Wait for sandbox to be ready by executing a simple command
    await sandboxRuntime.execute('/* sandbox ready check */', '/__sandbox_init__.js');
    return sandboxRuntime;
  }

  // SECURITY CHECK: Same-origin execution requires explicit opt-in
  if (!dangerouslyAllowSameOrigin) {
    throw new Error(
      'almostnode: For security, you must either:\n' +
      '  1. Use sandbox mode: { sandbox: "https://your-sandbox.vercel.app" }\n' +
      '  2. Explicitly opt-in to same-origin: { dangerouslyAllowSameOrigin: true }\n' +
      '\n' +
      'Same-origin execution allows code to access cookies, localStorage, and IndexedDB.\n' +
      'Only use dangerouslyAllowSameOrigin for trusted code or demos.\n' +
      '\n' +
      'For sandbox setup instructions, see: https://github.com/anthropics/almostnode#sandbox-setup'
    );
  }

  // Same-origin modes (requires explicit opt-in)
  let shouldUseWorker = false;

  if (useWorker === true) {
    shouldUseWorker = isWorkerAvailable();
    if (!shouldUseWorker) {
      console.warn('[createRuntime] Worker requested but not available, falling back to main thread');
    }
  } else if (useWorker === 'auto') {
    shouldUseWorker = isWorkerAvailable();
    console.log(`[createRuntime] Auto mode: using ${shouldUseWorker ? 'worker' : 'main thread'}`);
  }

  if (shouldUseWorker) {
    console.log('[createRuntime] Creating WorkerRuntime (same-origin, thread-isolated)');
    const workerRuntime = new WorkerRuntime(vfs, { ...runtimeOptions, workerUrl });
    // Wait for worker to be ready by executing a simple command
    await workerRuntime.execute('/* worker ready check */', '/__worker_init__.js');
    return workerRuntime;
  }

  console.log('[createRuntime] Creating main-thread Runtime (same-origin, least secure)');
  return new AsyncRuntimeWrapper(vfs, runtimeOptions);
}

// Re-export types and classes for convenience
export { Runtime } from './runtime';
export { WorkerRuntime } from './worker-runtime';
export { SandboxRuntime } from './sandbox-runtime';
export type {
  IRuntime,
  IExecuteResult,
  IRuntimeOptions,
  CreateRuntimeOptions,
  VFSSnapshot,
} from './runtime-interface';
