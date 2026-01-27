/**
 * Browser-compatible child_process shim
 * This version doesn't use just-bash and throws errors for commands
 * Most CLI tools (like Convex CLI) don't actually need shell execution
 */

import { EventEmitter } from './events';
import { Readable, Writable, Buffer } from './stream';

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  encoding?: BufferEncoding | 'buffer';
  timeout?: number;
  maxBuffer?: number;
  shell?: string | boolean;
}

export interface ExecResult {
  stdout: string | Buffer;
  stderr: string | Buffer;
}

export type ExecCallback = (
  error: Error | null,
  stdout: string | Buffer,
  stderr: string | Buffer
) => void;

/**
 * Initialize child_process - no-op in browser version
 */
export function initChildProcess(): void {
  // No-op - just-bash not used in browser version
}

/**
 * Execute a command in a shell
 */
export function exec(
  command: string,
  optionsOrCallback?: ExecOptions | ExecCallback,
  callback?: ExecCallback
): ChildProcess {
  let cb: ExecCallback | undefined;

  if (typeof optionsOrCallback === 'function') {
    cb = optionsOrCallback;
  } else {
    cb = callback;
  }

  const child = new ChildProcess();

  // Execute asynchronously - emit error
  setTimeout(() => {
    const error = new Error(
      `exec is not supported in browser environment: ${command}`
    );
    child.emit('error', error);
    if (cb) cb(error, '', '');
  }, 0);

  return child;
}

/**
 * Execute a command synchronously
 */
export function execSync(
  command: string,
  options?: ExecOptions
): string | Buffer {
  throw new Error(
    `execSync is not supported in browser environment: ${command}`
  );
}

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  shell?: boolean | string;
  stdio?: 'pipe' | 'inherit' | 'ignore' | Array<'pipe' | 'inherit' | 'ignore'>;
}

/**
 * Spawn a new process
 */
export function spawn(
  command: string,
  args?: string[] | SpawnOptions,
  options?: SpawnOptions
): ChildProcess {
  const child = new ChildProcess();

  // Execute asynchronously - emit error
  setTimeout(() => {
    const error = new Error(
      `spawn is not supported in browser environment: ${command}`
    );
    child.emit('error', error);
  }, 0);

  return child;
}

/**
 * Spawn a new process synchronously
 */
export function spawnSync(
  command: string,
  args?: string[],
  options?: SpawnOptions
): { stdout: Buffer; stderr: Buffer; status: number; error?: Error } {
  throw new Error(
    `spawnSync is not supported in browser environment: ${command}`
  );
}

/**
 * Execute a file
 */
export function execFile(
  file: string,
  args?: string[] | ExecOptions | ExecCallback,
  options?: ExecOptions | ExecCallback,
  callback?: ExecCallback
): ChildProcess {
  let cb: ExecCallback | undefined;

  if (typeof args === 'function') {
    cb = args;
  } else if (typeof options === 'function') {
    cb = options;
  } else {
    cb = callback;
  }

  const child = new ChildProcess();

  setTimeout(() => {
    const error = new Error(
      `execFile is not supported in browser environment: ${file}`
    );
    child.emit('error', error);
    if (cb) cb(error, '', '');
  }, 0);

  return child;
}

/**
 * Fork is not supported in browser
 */
export function fork(): never {
  throw new Error('fork is not supported in browser environment');
}

/**
 * ChildProcess class
 */
export class ChildProcess extends EventEmitter {
  pid: number;
  connected: boolean = false;
  killed: boolean = false;
  exitCode: number | null = null;
  signalCode: string | null = null;
  spawnargs: string[] = [];
  spawnfile: string = '';

  stdin: Writable | null;
  stdout: Readable | null;
  stderr: Readable | null;

  constructor() {
    super();
    this.pid = Math.floor(Math.random() * 10000) + 1000;
    this.stdin = new Writable();
    this.stdout = new Readable();
    this.stderr = new Readable();
  }

  kill(signal?: string): boolean {
    this.killed = true;
    this.emit('exit', null, signal || 'SIGTERM');
    return true;
  }

  disconnect(): void {
    this.connected = false;
  }

  send(message: unknown, callback?: (error: Error | null) => void): boolean {
    // IPC not supported
    if (callback) callback(new Error('IPC not supported'));
    return false;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }
}

export default {
  exec,
  execSync,
  execFile,
  spawn,
  spawnSync,
  fork,
  ChildProcess,
  initChildProcess,
};
