/**
 * Node.js fs module shim
 * Wraps VirtualFS to provide Node.js compatible API
 */

import { VirtualFS } from '../virtual-fs';
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
  unlinkSync(path: string): void;
  rmdirSync(path: string): void;
  renameSync(oldPath: string, newPath: string): void;
  realpathSync(path: string): string;
  accessSync(path: string, mode?: number): void;
  copyFileSync(src: string, dest: string): void;
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
function toPath(pathLike: unknown): string {
  if (typeof pathLike === 'string') {
    return pathLike;
  }
  if (pathLike instanceof URL) {
    // Handle file:// URLs
    if (pathLike.protocol === 'file:') {
      // Remove file:// prefix and decode
      return decodeURIComponent(pathLike.pathname);
    }
    throw new Error(`Unsupported URL protocol: ${pathLike.protocol}`);
  }
  if (Buffer.isBuffer(pathLike)) {
    return pathLike.toString('utf8');
  }
  if (pathLike && typeof pathLike === 'object' && 'toString' in pathLike) {
    return String(pathLike);
  }
  throw new TypeError(`Path must be a string, URL, or Buffer. Received: ${typeof pathLike}`);
}

export function createFsShim(vfs: VirtualFS): FsShim {
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
          const path = toPath(pathLike);
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
          vfs.writeFileSync(toPath(pathLike), data);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    },
    stat(pathLike: unknown): Promise<Stats> {
      return new Promise((resolve, reject) => {
        try {
          resolve(vfs.statSync(toPath(pathLike)));
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
          resolve(vfs.readdirSync(toPath(pathLike)));
        } catch (err) {
          reject(err);
        }
      });
    },
    mkdir(pathLike: unknown, options?: { recursive?: boolean }): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          vfs.mkdirSync(toPath(pathLike), options);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    },
    unlink(pathLike: unknown): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          vfs.unlinkSync(toPath(pathLike));
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
      const path = toPath(pathLike);
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
      vfs.writeFileSync(toPath(pathLike), data);
    },

    existsSync(pathLike: unknown): boolean {
      return vfs.existsSync(toPath(pathLike));
    },

    mkdirSync(pathLike: unknown, options?: { recursive?: boolean }): void {
      vfs.mkdirSync(toPath(pathLike), options);
    },

    readdirSync(pathLike: unknown): string[] {
      return vfs.readdirSync(toPath(pathLike));
    },

    statSync(pathLike: unknown): Stats {
      return vfs.statSync(toPath(pathLike));
    },

    lstatSync(pathLike: unknown): Stats {
      return vfs.lstatSync(toPath(pathLike));
    },

    unlinkSync(pathLike: unknown): void {
      vfs.unlinkSync(toPath(pathLike));
    },

    rmdirSync(pathLike: unknown): void {
      vfs.rmdirSync(toPath(pathLike));
    },

    renameSync(oldPathLike: unknown, newPathLike: unknown): void {
      vfs.renameSync(toPath(oldPathLike), toPath(newPathLike));
    },

    realpathSync(pathLike: unknown): string {
      return vfs.realpathSync(toPath(pathLike));
    },

    accessSync(pathLike: unknown, _mode?: number): void {
      vfs.accessSync(toPath(pathLike));
    },

    copyFileSync(srcLike: unknown, destLike: unknown): void {
      const src = toPath(srcLike);
      const dest = toPath(destLike);
      const data = vfs.readFileSync(src);
      vfs.writeFileSync(dest, data);
    },

    watch(
      pathLike: unknown,
      optionsOrListener?: { persistent?: boolean; recursive?: boolean } | WatchListener,
      listener?: WatchListener
    ): FSWatcher {
      return vfs.watch(toPath(pathLike), optionsOrListener as { persistent?: boolean; recursive?: boolean }, listener);
    },

    readFile(
      pathLike: unknown,
      optionsOrCallback?: { encoding?: string } | ((err: Error | null, data?: string | Uint8Array) => void),
      callback?: (err: Error | null, data?: string | Uint8Array) => void
    ): void {
      const path = toPath(pathLike);
      vfs.readFile(path, optionsOrCallback as { encoding?: string }, callback);
    },

    stat(pathLike: unknown, callback: (err: Error | null, stats?: Stats) => void): void {
      vfs.stat(toPath(pathLike), callback);
    },

    lstat(pathLike: unknown, callback: (err: Error | null, stats?: Stats) => void): void {
      vfs.lstat(toPath(pathLike), callback);
    },

    readdir(
      pathLike: unknown,
      optionsOrCallback?: { withFileTypes?: boolean } | ((err: Error | null, files?: string[]) => void),
      callback?: (err: Error | null, files?: string[]) => void
    ): void {
      vfs.readdir(toPath(pathLike), optionsOrCallback as { withFileTypes?: boolean }, callback);
    },

    realpath(pathLike: unknown, callback: (err: Error | null, resolvedPath?: string) => void): void {
      vfs.realpath(toPath(pathLike), callback);
    },

    access(
      pathLike: unknown,
      modeOrCallback?: number | ((err: Error | null) => void),
      callback?: (err: Error | null) => void
    ): void {
      vfs.access(toPath(pathLike), modeOrCallback, callback);
    },

    createReadStream(pathLike: unknown): unknown {
      return vfs.createReadStream(toPath(pathLike));
    },

    createWriteStream(pathLike: unknown): unknown {
      return vfs.createWriteStream(toPath(pathLike));
    },

    promises,
    constants,
  };
}

export default createFsShim;
