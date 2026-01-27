/**
 * Mini WebContainers MVP - Main Entry Point
 *
 * Provides a browser-based Node.js-like environment
 * with virtual file system and CommonJS module support
 */

export { VirtualFS } from './virtual-fs';
export type { FSNode, Stats, FSWatcher, WatchListener, WatchEventType } from './virtual-fs';
export { Runtime, execute, Module, RuntimeOptions, RequireFunction } from './runtime';
export { createFsShim, FsShim } from './shims/fs';
export { createProcess, Process, ProcessEnv } from './shims/process';
export * as path from './shims/path';
export * as http from './shims/http';
export * as net from './shims/net';
export * as events from './shims/events';
export * as stream from './shims/stream';
export * as url from './shims/url';
export * as querystring from './shims/querystring';
export * as util from './shims/util';
export * as npm from './npm';
export { PackageManager, install } from './npm';
export { ServerBridge, getServerBridge, resetServerBridge } from './server-bridge';
// New shims for Vite support
export * as chokidar from './shims/chokidar';
export * as ws from './shims/ws';
export * as fsevents from './shims/fsevents';
export * as readdirp from './shims/readdirp';
export * as module from './shims/module';
export * as perf_hooks from './shims/perf_hooks';
export * as worker_threads from './shims/worker_threads';
export * as esbuild from './shims/esbuild';
export * as rollup from './shims/rollup';

import { VirtualFS } from './virtual-fs';
import { Runtime, RuntimeOptions } from './runtime';
import { PackageManager } from './npm';
import { ServerBridge, getServerBridge } from './server-bridge';

export interface ContainerOptions extends RuntimeOptions {
  baseUrl?: string;
  onServerReady?: (port: number, url: string) => void;
}

/**
 * Create a new WebContainer-like environment
 */
export function createContainer(options?: ContainerOptions): {
  vfs: VirtualFS;
  runtime: Runtime;
  npm: PackageManager;
  serverBridge: ServerBridge;
  execute: (code: string, filename?: string) => { exports: unknown };
  runFile: (filename: string) => { exports: unknown };
  on: (event: string, listener: (...args: unknown[]) => void) => void;
} {
  const vfs = new VirtualFS();
  const runtime = new Runtime(vfs, options);
  const npmManager = new PackageManager(vfs);
  const serverBridge = getServerBridge({
    baseUrl: options?.baseUrl,
    onServerReady: options?.onServerReady,
  });

  return {
    vfs,
    runtime,
    npm: npmManager,
    serverBridge,
    execute: (code: string, filename?: string) => runtime.execute(code, filename),
    runFile: (filename: string) => runtime.runFile(filename),
    on: (event: string, listener: (...args: unknown[]) => void) => {
      serverBridge.on(event, listener);
    },
  };
}

export default createContainer;
