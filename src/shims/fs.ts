/**
 * Node.js fs module shim
 * Wraps VirtualFS to provide Node.js compatible API
 */

import { VirtualFS, createNodeError } from '../virtual-fs';
import type { Stats, FSWatcher, WatchListener, WatchEventType } from '../virtual-fs';

export type { Stats, FSWatcher, WatchListener, WatchEventType };

export interface FsShim {
  readFileSync(path: string): Buffer;
  readFileSync(path: string, encoding: 'utf8' | 'utf-8'): string;
  readFileSync(path: string, options: { encoding: 'utf8' | 'utf-8' }): string;
  readFileSync(path: string, options: { encoding?: null }): Buffer;
  writeFileSync(path: string, data: string | Uint8Array): void;
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readdirSync(path: string): string[];
  statSync(path: string): Stats;
  lstatSync(path: string): Stats;
  fstatSync(fd: number): Stats;
  unlinkSync(path: string): void;
  rmdirSync(path: string): void;
  renameSync(oldPath: string, newPath: string): void;
  realpathSync(path: string): string;
  accessSync(path: string, mode?: number): void;
  copyFileSync(src: string, dest: string): void;
  openSync(path: string, flags: string | number, mode?: number): number;
  closeSync(fd: number): void;
  readSync(fd: number, buffer: Buffer | Uint8Array, offset: number, length: number, position: number | null): number;
  writeSync(fd: number, buffer: Buffer | Uint8Array | string, offset?: number, length?: number, position?: number | null): number;
  ftruncateSync(fd: number, len?: number): void;
  fsyncSync(fd: number): void;
  fdatasyncSync(fd: number): void;
  mkdtempSync(prefix: string): string;
  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  watch(filename: string, options?: { persistent?: boolean; recursive?: boolean }, listener?: WatchListener): FSWatcher;
  watch(filename: string, listener?: WatchListener): FSWatcher;
  readFile(path: string, callback: (err: Error | null, data?: Uint8Array) => void): void;
  readFile(path: string, options: { encoding: string }, callback: (err: Error | null, data?: string) => void): void;
  stat(path: string, callback: (err: Error | null, stats?: Stats) => void): void;
  lstat(path: string, callback: (err: Error | null, stats?: Stats) => void): void;
  readdir(path: string, callback: (err: Error | null, files?: string[]) => void): void;
  realpath(path: string, callback: (err: Error | null, resolvedPath?: string) => void): void;
  access(path: string, callback: (err: Error | null) => void): void;
  access(path: string, mode: number, callback: (err: Error | null) => void): void;
  createReadStream(path: string): unknown;
  createWriteStream(path: string): unknown;
  promises: FsPromises;
  constants: FsConstants;
}

export interface FsPromises {
  readFile(path: string): Promise<Buffer>;
  readFile(path: string, encoding: 'utf8' | 'utf-8'): Promise<string>;
  readFile(path: string, options: { encoding: 'utf8' | 'utf-8' }): Promise<string>;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  stat(path: string): Promise<Stats>;
  lstat(path: string): Promise<Stats>;
  readdir(path: string): Promise<string[]>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  unlink(path: string): Promise<void>;
  rmdir(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  access(path: string, mode?: number): Promise<void>;
  realpath(path: string): Promise<string>;
  copyFile(src: string, dest: string): Promise<void>;
}

export interface FsConstants {
  F_OK: number;
  R_OK: number;
  W_OK: number;
  X_OK: number;
}

/**
 * Dirent class - represents a directory entry returned by readdirSync with withFileTypes: true
 */
export class Dirent {
  name: string;
  private _isDirectory: boolean;
  private _isFile: boolean;

  constructor(name: string, isDirectory: boolean, isFile: boolean) {
    this.name = name;
    this._isDirectory = isDirectory;
    this._isFile = isFile;
  }

  isDirectory(): boolean {
    return this._isDirectory;
  }

  isFile(): boolean {
    return this._isFile;
  }

  isBlockDevice(): boolean {
    return false;
  }

  isCharacterDevice(): boolean {
    return false;
  }

  isFIFO(): boolean {
    return false;
  }

  isSocket(): boolean {
    return false;
  }

  isSymbolicLink(): boolean {
    return false;
  }
}

/**
 * Create a Buffer-like object from Uint8Array
 * This is a minimal Buffer implementation for browser compatibility
 */
function createBuffer(data: Uint8Array): Buffer {
  const buffer = data as Buffer;

  // Add Buffer-specific methods
  Object.defineProperty(buffer, 'toString', {
    value: function (encoding?: string) {
      if (encoding === 'utf8' || encoding === 'utf-8' || !encoding) {
        return new TextDecoder().decode(this);
      }
      if (encoding === 'base64') {
        let binary = '';
        for (let i = 0; i < this.length; i++) {
          binary += String.fromCharCode(this[i]);
        }
        return btoa(binary);
      }
      if (encoding === 'hex') {
        return Array.from(this as Uint8Array)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      }
      throw new Error(`Unsupported encoding: ${encoding}`);
    },
    writable: true,
    configurable: true,
  });

  return buffer;
}

/**
 * Convert a path-like value to a string path
 * Handles URL objects (file:// protocol) and Buffer
 */
// Path remapping for CLI tools that use incorrect absolute paths
// This maps /convex/ -> /project/convex/ to fix the Convex CLI path issue
const pathRemaps: Array<{ from: string; to: string }> = [
  { from: '/convex/', to: '/project/convex/' },
];

function remapPath(path: string): string {
  // Strip 'vfs:' namespace prefix from paths (comes from esbuild namespace)
  if (path.includes('vfs:')) {
    const cleanPath = path.replace(/vfs:/g, '');
    if (!remapPath.logged) remapPath.logged = new Set();
    if (!remapPath.logged.has(path)) {
      console.log(`[fs] Stripping vfs: prefix: ${path} -> ${cleanPath}`);
      remapPath.logged.add(path);
    }
    path = cleanPath;
  }

  for (const remap of pathRemaps) {
    if (path === remap.from.slice(0, -1) || path.startsWith(remap.from)) {
      const remapped = remap.to + path.slice(remap.from.length);
      // Only log once per unique path to avoid noise
      if (!remapPath.logged) remapPath.logged = new Set();
      if (!remapPath.logged.has(path)) {
        console.log(`[fs] Remapping path: ${path} -> ${remapped}`);
        remapPath.logged.add(path);
      }
      return remapped;
    }
  }
  return path;
}
remapPath.logged = new Set<string>();

function toPath(pathLike: unknown, getCwd?: () => string): string {
  let path: string;

  if (typeof pathLike === 'string') {
    path = pathLike;
  } else if (pathLike instanceof URL) {
    // Handle file:// URLs
    if (pathLike.protocol === 'file:') {
      // Remove file:// prefix and decode
      path = decodeURIComponent(pathLike.pathname);
    } else {
      throw new Error(`Unsupported URL protocol: ${pathLike.protocol}`);
    }
  } else if (Buffer.isBuffer(pathLike)) {
    path = pathLike.toString('utf8');
  } else if (pathLike && typeof pathLike === 'object' && 'toString' in pathLike) {
    path = String(pathLike);
  } else {
    throw new TypeError(`Path must be a string, URL, or Buffer. Received: ${typeof pathLike}`);
  }

  // Resolve relative paths against cwd
  if (!path.startsWith('/') && getCwd) {
    const cwd = getCwd();
    path = cwd.endsWith('/') ? cwd + path : cwd + '/' + path;
  }

  // Apply path remapping for CLI tools that use incorrect absolute paths
  path = remapPath(path);

  return path;
}

// File descriptor tracking
interface FileDescriptor {
  path: string;
  position: number;
  flags: string;
  content: Uint8Array;
}

const fdMap = new Map<number, FileDescriptor>();
let nextFd = 3; // Start at 3 (0, 1, 2 are stdin, stdout, stderr)

// Call tracking for infinite loop detection
const callTracker = {
  statSync: new Map<string, number>(),
  readdirSync: new Map<string, number>(),
  lastReset: Date.now(),
};

function trackCall(method: 'statSync' | 'readdirSync', path: string): void {
  // Reset counters every 500ms to allow legitimate repeated calls
  const now = Date.now();
  if (now - callTracker.lastReset > 500) {
    callTracker.statSync.clear();
    callTracker.readdirSync.clear();
    callTracker.lastReset = now;
  }

  const map = callTracker[method];
  const count = (map.get(path) || 0) + 1;
  map.set(path, count);

  // Log at different thresholds to understand the pattern
  if (count === 10 && path.includes('_generated')) {
    console.warn(`[fs] ${method} called ${count}x on ${path}`);
    // Print full stack trace at 10 calls to see the call path
    const err = new Error();
    console.log(`[fs] Stack at ${count} calls:`, err.stack?.split('\n').slice(1, 10).join('\n'));
  }
  if (count === 50) {
    console.warn(`[fs] Potential infinite loop: ${method} called ${count}+ times on ${path}`);
  }
}

export function createFsShim(vfs: VirtualFS, getCwd?: () => string): FsShim {
  // Helper to resolve paths with cwd
  const resolvePath = (pathLike: unknown) => toPath(pathLike, getCwd);
  const constants: FsConstants = {
    F_OK: 0,
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
  };

  const promises: FsPromises = {
    readFile(pathLike: unknown, encodingOrOptions?: string | { encoding?: string | null }): Promise<Buffer | string> {
      return new Promise((resolve, reject) => {
        try {
          const path = resolvePath(pathLike);
          let encoding: string | undefined;
          if (typeof encodingOrOptions === 'string') {
            encoding = encodingOrOptions;
          } else if (encodingOrOptions?.encoding) {
            encoding = encodingOrOptions.encoding;
          }

          if (encoding === 'utf8' || encoding === 'utf-8') {
            resolve(vfs.readFileSync(path, 'utf8'));
          } else {
            resolve(createBuffer(vfs.readFileSync(path)));
          }
        } catch (err) {
          reject(err);
        }
      });
    },
    writeFile(pathLike: unknown, data: string | Uint8Array): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          vfs.writeFileSync(resolvePath(pathLike), data);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    },
    stat(pathLike: unknown): Promise<Stats> {
      return new Promise((resolve, reject) => {
        try {
          resolve(vfs.statSync(resolvePath(pathLike)));
        } catch (err) {
          reject(err);
        }
      });
    },
    lstat(pathLike: unknown): Promise<Stats> {
      return this.stat(pathLike);
    },
    readdir(pathLike: unknown): Promise<string[]> {
      return new Promise((resolve, reject) => {
        try {
          resolve(vfs.readdirSync(resolvePath(pathLike)));
        } catch (err) {
          reject(err);
        }
      });
    },
    mkdir(pathLike: unknown, options?: { recursive?: boolean }): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          vfs.mkdirSync(resolvePath(pathLike), options);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    },
    unlink(pathLike: unknown): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          vfs.unlinkSync(resolvePath(pathLike));
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    },
    rmdir(path: string): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          vfs.rmdirSync(path);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    },
    rename(oldPath: string, newPath: string): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          vfs.renameSync(oldPath, newPath);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    },
    access(path: string, mode?: number): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          vfs.accessSync(path, mode);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    },
    realpath(path: string): Promise<string> {
      return new Promise((resolve, reject) => {
        try {
          resolve(vfs.realpathSync(path));
        } catch (err) {
          reject(err);
        }
      });
    },
    copyFile(src: string, dest: string): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          vfs.copyFileSync(src, dest);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    },
  } as FsPromises;

  return {
    readFileSync(
      pathLike: unknown,
      encodingOrOptions?: string | { encoding?: string | null }
    ): Buffer | string {
      const path = resolvePath(pathLike);
      let encoding: string | undefined;

      if (typeof encodingOrOptions === 'string') {
        encoding = encodingOrOptions;
      } else if (encodingOrOptions?.encoding) {
        encoding = encodingOrOptions.encoding;
      }

      if (encoding === 'utf8' || encoding === 'utf-8') {
        return vfs.readFileSync(path, 'utf8');
      }

      const data = vfs.readFileSync(path);
      return createBuffer(data);
    },

    writeFileSync(pathLike: unknown, data: string | Uint8Array): void {
      // Handle file descriptor
      if (typeof pathLike === 'number') {
        const fd = pathLike;
        const entry = fdMap.get(fd);
        if (!entry) {
          const err = new Error(`EBADF: bad file descriptor, write`) as Error & { code: string; errno: number };
          err.code = 'EBADF';
          err.errno = -9;
          throw err;
        }
        // Convert string to Uint8Array if needed
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        // Replace entire content
        entry.content = new Uint8Array(bytes);
        entry.position = bytes.length;
        return;
      }
      const path = resolvePath(pathLike);
      // Debug: Log when writing to convex directories
      if (path.includes('convex') || path.includes('_generated')) {
        console.log('[fs] writeFileSync:', path);
      }
      vfs.writeFileSync(path, data);
    },

    existsSync(pathLike: unknown): boolean {
      return vfs.existsSync(resolvePath(pathLike));
    },

    mkdirSync(pathLike: unknown, options?: { recursive?: boolean }): void {
      const path = resolvePath(pathLike);
      // Debug: Log when creating convex directories
      if (path.includes('convex') || path.includes('_generated')) {
        console.log('[fs] mkdirSync:', path, options);
      }
      vfs.mkdirSync(path, options);
    },

    readdirSync(pathLike: unknown, options?: { withFileTypes?: boolean; encoding?: string } | string): string[] | Dirent[] {
      const path = resolvePath(pathLike);
      trackCall('readdirSync', path);
      const entries = vfs.readdirSync(path);

      // Handle withFileTypes option - returns Dirent objects instead of strings
      const opts = typeof options === 'string' ? { encoding: options } : options;
      if (opts?.withFileTypes) {
        const dirents: Dirent[] = entries.map(name => {
          const entryPath = path.endsWith('/') ? path + name : path + '/' + name;
          let isDir = false;
          let isFile = false;
          try {
            const stat = vfs.statSync(entryPath);
            isDir = stat.isDirectory();
            isFile = stat.isFile();
          } catch {
            isFile = true; // Default to file if stat fails
          }
          return new Dirent(name, isDir, isFile);
        });
        // Debug: Log readdirSync results for _generated
        if (path.includes('_generated')) {
          console.log(`[fs] readdirSync(${path}, withFileTypes) -> [${dirents.map(d => d.name).join(', ')}]`);
        }
        return dirents;
      }

      // Debug: Log readdirSync results for _generated
      if (path.includes('_generated')) {
        console.log(`[fs] readdirSync(${path}) -> [${entries.join(', ')}]`);
      }
      return entries;
    },

    statSync(pathLike: unknown): Stats {
      const origPath = typeof pathLike === 'string' ? pathLike : String(pathLike);
      const path = resolvePath(pathLike);
      trackCall('statSync', path);
      const result = vfs.statSync(path);
      // Debug: Log all statSync calls on _generated paths (show if path was modified)
      if (path.includes('_generated')) {
        const wasRemapped = origPath !== path;
        console.log(`[fs] statSync(${origPath}${wasRemapped ? ' -> ' + path : ''}) -> isDir: ${result.isDirectory()}`);
      }
      return result;
    },

    lstatSync(pathLike: unknown): Stats {
      return vfs.lstatSync(resolvePath(pathLike));
    },

    fstatSync(fd: number): Stats {
      const entry = fdMap.get(fd);
      if (!entry) {
        const err = new Error(`EBADF: bad file descriptor, fstat`) as Error & { code: string; errno: number };
        err.code = 'EBADF';
        err.errno = -9;
        throw err;
      }
      return vfs.statSync(entry.path);
    },

    openSync(pathLike: unknown, flags: string | number, _mode?: number): number {
      const path = resolvePath(pathLike);
      const flagStr = typeof flags === 'number' ? 'r' : flags;

      // Check if file exists for read modes
      const exists = vfs.existsSync(path);
      const isWriteMode = flagStr.includes('w') || flagStr.includes('a');
      const isReadMode = flagStr.includes('r') && !flagStr.includes('+');

      if (!exists && isReadMode) {
        const err = new Error(`ENOENT: no such file or directory, open '${path}'`) as Error & { code: string; errno: number; path: string };
        err.code = 'ENOENT';
        err.errno = -2;
        err.path = path;
        throw err;
      }

      // Get or create content
      let content: Uint8Array;
      if (exists && !flagStr.includes('w')) {
        content = vfs.readFileSync(path);
      } else {
        content = new Uint8Array(0);
        if (isWriteMode) {
          // Ensure parent directory exists
          const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
          if (!vfs.existsSync(parentPath)) {
            vfs.mkdirSync(parentPath, { recursive: true });
          }
        }
      }

      const fd = nextFd++;
      fdMap.set(fd, {
        path,
        position: flagStr.includes('a') ? content.length : 0,
        flags: flagStr,
        content: new Uint8Array(content),
      });
      return fd;
    },

    closeSync(fd: number): void {
      const entry = fdMap.get(fd);
      if (!entry) {
        return; // Silently ignore
      }
      // Write back content if it was opened for writing
      if (entry.flags.includes('w') || entry.flags.includes('a') || entry.flags.includes('+')) {
        vfs.writeFileSync(entry.path, entry.content);
      }
      fdMap.delete(fd);
    },

    readSync(fd: number, buffer: Buffer | Uint8Array, offset: number, length: number, position: number | null): number {
      const entry = fdMap.get(fd);
      if (!entry) {
        const err = new Error(`EBADF: bad file descriptor, read`) as Error & { code: string; errno: number };
        err.code = 'EBADF';
        err.errno = -9;
        throw err;
      }

      const readPos = position !== null ? position : entry.position;
      const bytesToRead = Math.min(length, entry.content.length - readPos);

      if (bytesToRead <= 0) {
        return 0;
      }

      for (let i = 0; i < bytesToRead; i++) {
        buffer[offset + i] = entry.content[readPos + i];
      }

      if (position === null) {
        entry.position += bytesToRead;
      }

      return bytesToRead;
    },

    writeSync(fd: number, buffer: Buffer | Uint8Array | string, offset?: number, length?: number, position?: number | null): number {
      const entry = fdMap.get(fd);
      if (!entry) {
        const err = new Error(`EBADF: bad file descriptor, write`) as Error & { code: string; errno: number };
        err.code = 'EBADF';
        err.errno = -9;
        throw err;
      }

      // Handle string input
      let data: Uint8Array;
      if (typeof buffer === 'string') {
        data = new TextEncoder().encode(buffer);
        offset = 0;
        length = data.length;
      } else {
        data = buffer;
        offset = offset ?? 0;
        length = length ?? (data.length - offset);
      }

      const writePos = position !== null && position !== undefined ? position : entry.position;
      const endPos = writePos + length;

      // Expand content if needed
      if (endPos > entry.content.length) {
        const newContent = new Uint8Array(endPos);
        newContent.set(entry.content);
        entry.content = newContent;
      }

      // Write data
      for (let i = 0; i < length; i++) {
        entry.content[writePos + i] = data[offset + i];
      }

      if (position === null || position === undefined) {
        entry.position = endPos;
      }

      return length;
    },

    ftruncateSync(fd: number, len: number = 0): void {
      const entry = fdMap.get(fd);
      if (!entry) {
        const err = new Error(`EBADF: bad file descriptor, ftruncate`) as Error & { code: string; errno: number };
        err.code = 'EBADF';
        err.errno = -9;
        throw err;
      }

      if (len < entry.content.length) {
        entry.content = entry.content.slice(0, len);
      } else if (len > entry.content.length) {
        const newContent = new Uint8Array(len);
        newContent.set(entry.content);
        entry.content = newContent;
      }
    },

    fsyncSync(_fd: number): void {
      // No-op - our virtual FS doesn't have disk buffering
    },

    fdatasyncSync(_fd: number): void {
      // No-op - our virtual FS doesn't have disk buffering
    },

    mkdtempSync(prefix: string): string {
      // Generate a unique suffix
      const suffix = Math.random().toString(36).slice(2, 8);
      const tempDir = `${prefix}${suffix}`;
      const resolvedPath = resolvePath(tempDir);
      vfs.mkdirSync(resolvedPath, { recursive: true });
      return resolvedPath;
    },

    rmSync(pathLike: unknown, options?: { recursive?: boolean; force?: boolean }): void {
      const path = resolvePath(pathLike);
      if (!vfs.existsSync(path)) {
        if (options?.force) return;
        throw createNodeError('ENOENT', 'rm', path);
      }
      const stats = vfs.statSync(path);
      if (stats.isDirectory()) {
        if (options?.recursive) {
          // Recursively delete directory contents
          const entries = vfs.readdirSync(path);
          for (const entry of entries) {
            const entryPath = path.endsWith('/') ? path + entry : path + '/' + entry;
            this.rmSync(entryPath, options);
          }
          vfs.rmdirSync(path);
        } else {
          throw createNodeError('EISDIR', 'rm', path);
        }
      } else {
        vfs.unlinkSync(path);
      }
    },

    unlinkSync(pathLike: unknown): void {
      const path = resolvePath(pathLike);
      // Debug: Log unlink calls on _generated
      if (path.includes('_generated')) {
        console.log(`[fs] unlinkSync(${path})`);
      }
      vfs.unlinkSync(path);
    },

    rmdirSync(pathLike: unknown): void {
      vfs.rmdirSync(resolvePath(pathLike));
    },

    renameSync(oldPathLike: unknown, newPathLike: unknown): void {
      vfs.renameSync(resolvePath(oldPathLike), resolvePath(newPathLike));
    },

    realpathSync(pathLike: unknown): string {
      return vfs.realpathSync(resolvePath(pathLike));
    },

    accessSync(pathLike: unknown, _mode?: number): void {
      vfs.accessSync(resolvePath(pathLike));
    },

    copyFileSync(srcLike: unknown, destLike: unknown): void {
      const src = resolvePath(srcLike);
      const dest = resolvePath(destLike);
      const data = vfs.readFileSync(src);
      vfs.writeFileSync(dest, data);
    },

    watch(
      pathLike: unknown,
      optionsOrListener?: { persistent?: boolean; recursive?: boolean } | WatchListener,
      listener?: WatchListener
    ): FSWatcher {
      return vfs.watch(resolvePath(pathLike), optionsOrListener as { persistent?: boolean; recursive?: boolean }, listener);
    },

    readFile(
      pathLike: unknown,
      optionsOrCallback?: { encoding?: string } | ((err: Error | null, data?: string | Uint8Array) => void),
      callback?: (err: Error | null, data?: string | Uint8Array) => void
    ): void {
      const path = resolvePath(pathLike);
      vfs.readFile(path, optionsOrCallback as { encoding?: string }, callback);
    },

    stat(pathLike: unknown, callback: (err: Error | null, stats?: Stats) => void): void {
      vfs.stat(resolvePath(pathLike), callback);
    },

    lstat(pathLike: unknown, callback: (err: Error | null, stats?: Stats) => void): void {
      vfs.lstat(resolvePath(pathLike), callback);
    },

    readdir(
      pathLike: unknown,
      optionsOrCallback?: { withFileTypes?: boolean } | ((err: Error | null, files?: string[]) => void),
      callback?: (err: Error | null, files?: string[]) => void
    ): void {
      vfs.readdir(resolvePath(pathLike), optionsOrCallback as { withFileTypes?: boolean }, callback);
    },

    realpath(pathLike: unknown, callback: (err: Error | null, resolvedPath?: string) => void): void {
      vfs.realpath(resolvePath(pathLike), callback);
    },

    access(
      pathLike: unknown,
      modeOrCallback?: number | ((err: Error | null) => void),
      callback?: (err: Error | null) => void
    ): void {
      vfs.access(resolvePath(pathLike), modeOrCallback, callback);
    },

    createReadStream(pathLike: unknown): unknown {
      return vfs.createReadStream(resolvePath(pathLike));
    },

    createWriteStream(pathLike: unknown): unknown {
      return vfs.createWriteStream(resolvePath(pathLike));
    },

    promises,
    constants,
  };
}

export default createFsShim;
