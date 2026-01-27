/**
 * Node.js process shim
 * Provides minimal process object for browser environment
 * Process is an EventEmitter in Node.js
 */

import { EventEmitter, EventListener } from './events';

export interface ProcessEnv {
  [key: string]: string | undefined;
}

// Stream-like interface with EventEmitter methods
interface ProcessStream {
  isTTY: boolean;
  on: (event: string, listener: EventListener) => ProcessStream;
  once: (event: string, listener: EventListener) => ProcessStream;
  off: (event: string, listener: EventListener) => ProcessStream;
  emit: (event: string, ...args: unknown[]) => boolean;
  addListener: (event: string, listener: EventListener) => ProcessStream;
  removeListener: (event: string, listener: EventListener) => ProcessStream;
  removeAllListeners: (event?: string) => ProcessStream;
  setMaxListeners: (n: number) => ProcessStream;
  pause?: () => ProcessStream;
  resume?: () => ProcessStream;
  setEncoding?: (encoding: string) => ProcessStream;
}

interface ProcessWritableStream extends ProcessStream {
  write: (data: string | Buffer, encoding?: string, callback?: () => void) => boolean;
  end?: (data?: string, callback?: () => void) => void;
}

interface ProcessReadableStream extends ProcessStream {
  read?: (size?: number) => string | Buffer | null;
  setRawMode?: (mode: boolean) => ProcessReadableStream;
}

export interface Process {
  env: ProcessEnv;
  cwd: () => string;
  chdir: (directory: string) => void;
  platform: string;
  version: string;
  versions: { node: string; v8: string; uv: string };
  argv: string[];
  argv0: string;
  execPath: string;
  execArgv: string[];
  pid: number;
  ppid: number;
  exit: (code?: number) => never;
  nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => void;
  stdout: ProcessWritableStream;
  stderr: ProcessWritableStream;
  stdin: ProcessReadableStream;
  hrtime: {
    (time?: [number, number]): [number, number];
    bigint: () => bigint;
  };
  memoryUsage: () => { rss: number; heapTotal: number; heapUsed: number; external: number; arrayBuffers: number };
  uptime: () => number;
  cpuUsage: () => { user: number; system: number };
  // EventEmitter methods
  on: (event: string, listener: EventListener) => Process;
  once: (event: string, listener: EventListener) => Process;
  off: (event: string, listener: EventListener) => Process;
  emit: (event: string, ...args: unknown[]) => boolean;
  addListener: (event: string, listener: EventListener) => Process;
  removeListener: (event: string, listener: EventListener) => Process;
  removeAllListeners: (event?: string) => Process;
  listeners: (event: string) => EventListener[];
  listenerCount: (event: string) => number;
  prependListener: (event: string, listener: EventListener) => Process;
  prependOnceListener: (event: string, listener: EventListener) => Process;
  eventNames: () => string[];
  setMaxListeners: (n: number) => Process;
  getMaxListeners: () => number;
}

// Helper to create a stream-like object with EventEmitter methods
function createProcessStream(
  isWritable: boolean,
  writeImpl?: (data: string) => boolean
): ProcessWritableStream | ProcessReadableStream {
  const emitter = new EventEmitter();

  const stream: ProcessWritableStream & ProcessReadableStream = {
    isTTY: false,

    on(event: string, listener: EventListener) {
      emitter.on(event, listener);
      return stream;
    },
    once(event: string, listener: EventListener) {
      emitter.once(event, listener);
      return stream;
    },
    off(event: string, listener: EventListener) {
      emitter.off(event, listener);
      return stream;
    },
    emit(event: string, ...args: unknown[]) {
      return emitter.emit(event, ...args);
    },
    addListener(event: string, listener: EventListener) {
      emitter.addListener(event, listener);
      return stream;
    },
    removeListener(event: string, listener: EventListener) {
      emitter.removeListener(event, listener);
      return stream;
    },
    removeAllListeners(event?: string) {
      emitter.removeAllListeners(event);
      return stream;
    },
    setMaxListeners(n: number) {
      emitter.setMaxListeners(n);
      return stream;
    },
    pause() {
      return stream;
    },
    resume() {
      return stream;
    },
    setEncoding(_encoding: string) {
      return stream;
    },
  };

  if (isWritable && writeImpl) {
    stream.write = (data: string | Buffer, _encoding?: string, callback?: () => void) => {
      const result = writeImpl(typeof data === 'string' ? data : data.toString());
      if (callback) queueMicrotask(callback);
      return result;
    };
    stream.end = (_data?: string, callback?: () => void) => {
      if (callback) queueMicrotask(callback);
    };
  } else {
    // stdin
    stream.read = () => null;
    stream.setRawMode = (_mode: boolean) => stream;
  }

  return stream;
}

export function createProcess(options?: {
  cwd?: string;
  env?: ProcessEnv;
  onExit?: (code: number) => void;
}): Process {
  let currentDir = options?.cwd || '/';
  const env: ProcessEnv = {
    NODE_ENV: 'development',
    PATH: '/usr/local/bin:/usr/bin:/bin',
    HOME: '/',
    ...options?.env,
  };

  // Create an EventEmitter for process events
  const emitter = new EventEmitter();
  const startTime = Date.now();

  const proc: Process = {
    env,

    cwd() {
      return currentDir;
    },

    chdir(directory: string) {
      if (!directory.startsWith('/')) {
        directory = currentDir + '/' + directory;
      }
      currentDir = directory;
    },

    platform: 'linux', // Pretend to be linux for better compatibility
    version: 'v18.0.0',
    versions: { node: '18.0.0', v8: '10.2.154.26', uv: '1.43.0' },

    argv: ['node', '/index.js'],
    argv0: 'node',
    execPath: '/usr/local/bin/node',
    execArgv: [],

    pid: 1,
    ppid: 0,

    exit(code = 0) {
      emitter.emit('exit', code);
      if (options?.onExit) {
        options.onExit(code);
      }
      throw new Error(`Process exited with code ${code}`);
    },

    nextTick(callback, ...args) {
      queueMicrotask(() => callback(...args));
    },

    stdout: createProcessStream(true, (data: string) => {
      console.log(data);
      return true;
    }) as ProcessWritableStream,

    stderr: createProcessStream(true, (data: string) => {
      console.error(data);
      return true;
    }) as ProcessWritableStream,

    stdin: createProcessStream(false) as ProcessReadableStream,

    hrtime(time?: [number, number]): [number, number] {
      const now = performance.now();
      const seconds = Math.floor(now / 1000);
      const nanoseconds = Math.floor((now % 1000) * 1e6);
      if (time) {
        const diffSeconds = seconds - time[0];
        const diffNanos = nanoseconds - time[1];
        return [diffSeconds, diffNanos];
      }
      return [seconds, nanoseconds];
    },

    memoryUsage() {
      // Return mock values since we can't access real memory in browser
      return {
        rss: 50 * 1024 * 1024,
        heapTotal: 30 * 1024 * 1024,
        heapUsed: 20 * 1024 * 1024,
        external: 1 * 1024 * 1024,
        arrayBuffers: 0,
      };
    },

    uptime() {
      return (Date.now() - startTime) / 1000;
    },

    cpuUsage() {
      return { user: 0, system: 0 };
    },

    // EventEmitter methods - delegate to emitter but return proc for chaining
    on(event: string, listener: EventListener): Process {
      emitter.on(event, listener);
      return proc;
    },

    once(event: string, listener: EventListener): Process {
      emitter.once(event, listener);
      return proc;
    },

    off(event: string, listener: EventListener): Process {
      emitter.off(event, listener);
      return proc;
    },

    emit(event: string, ...args: unknown[]): boolean {
      return emitter.emit(event, ...args);
    },

    addListener(event: string, listener: EventListener): Process {
      emitter.addListener(event, listener);
      return proc;
    },

    removeListener(event: string, listener: EventListener): Process {
      emitter.removeListener(event, listener);
      return proc;
    },

    removeAllListeners(event?: string): Process {
      emitter.removeAllListeners(event);
      return proc;
    },

    listeners(event: string): EventListener[] {
      return emitter.listeners(event);
    },

    listenerCount(event: string): number {
      return emitter.listenerCount(event);
    },

    prependListener(event: string, listener: EventListener): Process {
      emitter.prependListener(event, listener);
      return proc;
    },

    prependOnceListener(event: string, listener: EventListener): Process {
      emitter.prependOnceListener(event, listener);
      return proc;
    },

    eventNames(): string[] {
      return emitter.eventNames();
    },

    setMaxListeners(n: number): Process {
      emitter.setMaxListeners(n);
      return proc;
    },

    getMaxListeners(): number {
      return emitter.getMaxListeners();
    },
  };

  // Add hrtime.bigint
  (proc.hrtime as { bigint: () => bigint }).bigint = () => {
    return BigInt(Math.floor(performance.now() * 1e6));
  };

  return proc;
}

// Default process instance
export const process = createProcess();

export default process;
