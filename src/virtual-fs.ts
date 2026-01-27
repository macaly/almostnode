/**
 * Virtual File System - In-memory file tree with POSIX-like operations
 */

export interface FSNode {
  type: 'file' | 'directory';
  content?: Uint8Array;
  children?: Map<string, FSNode>;
}

export interface Stats {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
  isFIFO(): boolean;
  isSocket(): boolean;
  size: number;
  mode: number;
  mtime: Date;
  atime: Date;
  ctime: Date;
  birthtime: Date;
  mtimeMs: number;
  atimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
  nlink: number;
  uid: number;
  gid: number;
  dev: number;
  ino: number;
  rdev: number;
  blksize: number;
  blocks: number;
}

export type WatchEventType = 'change' | 'rename';
export type WatchListener = (eventType: WatchEventType, filename: string | null) => void;

export interface FSWatcher {
  close(): void;
  ref(): this;
  unref(): this;
}

interface WatcherEntry {
  listener: WatchListener;
  recursive: boolean;
  closed: boolean;
}

/**
 * Create a Node.js-style error with code property
 */
export interface NodeError extends Error {
  code: string;
  errno: number;
  syscall: string;
  path?: string;
}

export function createNodeError(
  code: 'ENOENT' | 'ENOTDIR' | 'EISDIR' | 'EEXIST' | 'ENOTEMPTY',
  syscall: string,
  path: string,
  message?: string
): NodeError {
  const errno: Record<string, number> = {
    ENOENT: -2,
    ENOTDIR: -20,
    EISDIR: -21,
    EEXIST: -17,
    ENOTEMPTY: -39,
  };

  const messages: Record<string, string> = {
    ENOENT: 'no such file or directory',
    ENOTDIR: 'not a directory',
    EISDIR: 'is a directory',
    EEXIST: 'file already exists',
    ENOTEMPTY: 'directory not empty',
  };

  const err = new Error(
    message || `${code}: ${messages[code]}, ${syscall} '${path}'`
  ) as NodeError;
  err.code = code;
  err.errno = errno[code];
  err.syscall = syscall;
  err.path = path;
  return err;
}

export class VirtualFS {
  private root: FSNode;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private watchers = new Map<string, Set<WatcherEntry>>();

  constructor() {
    this.root = {
      type: 'directory',
      children: new Map(),
    };
  }

  /**
   * Normalize path - resolve . and .. segments, ensure leading /
   */
  private normalizePath(path: string): string {
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    const parts = path.split('/').filter(Boolean);
    const resolved: string[] = [];

    for (const part of parts) {
      if (part === '..') {
        resolved.pop();
      } else if (part !== '.') {
        resolved.push(part);
      }
    }

    return '/' + resolved.join('/');
  }

  /**
   * Get path segments from normalized path
   */
  private getPathSegments(path: string): string[] {
    return this.normalizePath(path).split('/').filter(Boolean);
  }

  /**
   * Get parent directory path
   */
  private getParentPath(path: string): string {
    const normalized = this.normalizePath(path);
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash <= 0 ? '/' : normalized.slice(0, lastSlash);
  }

  /**
   * Get basename from path
   */
  private getBasename(path: string): string {
    const normalized = this.normalizePath(path);
    const lastSlash = normalized.lastIndexOf('/');
    return normalized.slice(lastSlash + 1);
  }

  /**
   * Get node at path, returns undefined if not found
   */
  private getNode(path: string): FSNode | undefined {
    const segments = this.getPathSegments(path);
    let current = this.root;

    for (const segment of segments) {
      if (current.type !== 'directory' || !current.children) {
        return undefined;
      }
      const child = current.children.get(segment);
      if (!child) {
        return undefined;
      }
      current = child;
    }

    return current;
  }

  /**
   * Get or create directory at path (for mkdir -p behavior)
   */
  private ensureDirectory(path: string): FSNode {
    const segments = this.getPathSegments(path);
    let current = this.root;

    for (const segment of segments) {
      if (!current.children) {
        current.children = new Map();
      }

      let child = current.children.get(segment);
      if (!child) {
        child = { type: 'directory', children: new Map() };
        current.children.set(segment, child);
      } else if (child.type !== 'directory') {
        throw new Error(`ENOTDIR: not a directory, '${path}'`);
      }

      current = child;
    }

    return current;
  }

  /**
   * Check if path exists
   */
  existsSync(path: string): boolean {
    return this.getNode(path) !== undefined;
  }

  /**
   * Get stats for path
   */
  statSync(path: string): Stats {
    const node = this.getNode(path);
    if (!node) {
      throw createNodeError('ENOENT', 'stat', path);
    }

    const now = Date.now();
    const size = node.type === 'file' ? (node.content?.length || 0) : 0;

    return {
      isFile: () => node.type === 'file',
      isDirectory: () => node.type === 'directory',
      isSymbolicLink: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false,
      size,
      mode: node.type === 'directory' ? 0o755 : 0o644,
      mtime: new Date(now),
      atime: new Date(now),
      ctime: new Date(now),
      birthtime: new Date(now),
      mtimeMs: now,
      atimeMs: now,
      ctimeMs: now,
      birthtimeMs: now,
      nlink: 1,
      uid: 1000,
      gid: 1000,
      dev: 0,
      ino: 0,
      rdev: 0,
      blksize: 4096,
      blocks: Math.ceil(size / 512),
    };
  }

  /**
   * lstatSync - same as statSync for our virtual FS (no symlinks)
   */
  lstatSync(path: string): Stats {
    return this.statSync(path);
  }

  /**
   * Read file contents as Uint8Array
   */
  readFileSync(path: string): Uint8Array;
  readFileSync(path: string, encoding: 'utf8' | 'utf-8'): string;
  readFileSync(path: string, encoding?: 'utf8' | 'utf-8'): Uint8Array | string {
    const node = this.getNode(path);

    if (!node) {
      throw createNodeError('ENOENT', 'open', path);
    }

    if (node.type !== 'file') {
      throw createNodeError('EISDIR', 'read', path);
    }

    const content = node.content || new Uint8Array(0);

    if (encoding === 'utf8' || encoding === 'utf-8') {
      return this.decoder.decode(content);
    }

    return content;
  }

  /**
   * Write data to file, creating parent directories as needed
   */
  writeFileSync(path: string, data: string | Uint8Array): void {
    const normalized = this.normalizePath(path);
    const parentPath = this.getParentPath(normalized);
    const basename = this.getBasename(normalized);

    if (!basename) {
      throw new Error(`EISDIR: illegal operation on a directory, '${path}'`);
    }

    const parent = this.ensureDirectory(parentPath);
    const existed = parent.children!.has(basename);

    const content = typeof data === 'string' ? this.encoder.encode(data) : data;

    parent.children!.set(basename, {
      type: 'file',
      content,
    });

    // Notify watchers
    this.notifyWatchers(normalized, existed ? 'change' : 'rename');
  }

  /**
   * Create directory, optionally with recursive parent creation
   */
  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    const normalized = this.normalizePath(path);

    if (options?.recursive) {
      this.ensureDirectory(normalized);
      return;
    }

    const parentPath = this.getParentPath(normalized);
    const basename = this.getBasename(normalized);

    if (!basename) {
      return; // Root directory already exists
    }

    const parent = this.getNode(parentPath);

    if (!parent) {
      throw createNodeError('ENOENT', 'mkdir', parentPath);
    }

    if (parent.type !== 'directory') {
      throw createNodeError('ENOTDIR', 'mkdir', parentPath);
    }

    if (parent.children!.has(basename)) {
      throw createNodeError('EEXIST', 'mkdir', path);
    }

    parent.children!.set(basename, {
      type: 'directory',
      children: new Map(),
    });
  }

  /**
   * Read directory contents
   */
  readdirSync(path: string): string[] {
    const node = this.getNode(path);

    if (!node) {
      throw createNodeError('ENOENT', 'scandir', path);
    }

    if (node.type !== 'directory') {
      throw createNodeError('ENOTDIR', 'scandir', path);
    }

    return Array.from(node.children!.keys());
  }

  /**
   * Remove file
   */
  unlinkSync(path: string): void {
    const normalized = this.normalizePath(path);
    const parentPath = this.getParentPath(normalized);
    const basename = this.getBasename(normalized);

    const parent = this.getNode(parentPath);

    if (!parent || parent.type !== 'directory') {
      throw createNodeError('ENOENT', 'unlink', path);
    }

    const node = parent.children!.get(basename);

    if (!node) {
      throw createNodeError('ENOENT', 'unlink', path);
    }

    if (node.type !== 'file') {
      throw createNodeError('EISDIR', 'unlink', path);
    }

    parent.children!.delete(basename);

    // Notify watchers
    this.notifyWatchers(normalized, 'rename');
  }

  /**
   * Remove directory (must be empty)
   */
  rmdirSync(path: string): void {
    const normalized = this.normalizePath(path);
    const parentPath = this.getParentPath(normalized);
    const basename = this.getBasename(normalized);

    if (!basename) {
      throw new Error(`EPERM: operation not permitted, '${path}'`);
    }

    const parent = this.getNode(parentPath);

    if (!parent || parent.type !== 'directory') {
      throw createNodeError('ENOENT', 'rmdir', path);
    }

    const node = parent.children!.get(basename);

    if (!node) {
      throw createNodeError('ENOENT', 'rmdir', path);
    }

    if (node.type !== 'directory') {
      throw createNodeError('ENOTDIR', 'rmdir', path);
    }

    if (node.children!.size > 0) {
      throw createNodeError('ENOTEMPTY', 'rmdir', path);
    }

    parent.children!.delete(basename);
  }

  /**
   * Rename/move file or directory
   */
  renameSync(oldPath: string, newPath: string): void {
    const normalizedOld = this.normalizePath(oldPath);
    const normalizedNew = this.normalizePath(newPath);

    const oldParentPath = this.getParentPath(normalizedOld);
    const oldBasename = this.getBasename(normalizedOld);
    const newParentPath = this.getParentPath(normalizedNew);
    const newBasename = this.getBasename(normalizedNew);

    const oldParent = this.getNode(oldParentPath);

    if (!oldParent || oldParent.type !== 'directory') {
      throw createNodeError('ENOENT', 'rename', oldPath);
    }

    const node = oldParent.children!.get(oldBasename);

    if (!node) {
      throw createNodeError('ENOENT', 'rename', oldPath);
    }

    const newParent = this.ensureDirectory(newParentPath);

    oldParent.children!.delete(oldBasename);
    newParent.children!.set(newBasename, node);

    // Notify watchers
    this.notifyWatchers(normalizedOld, 'rename');
    this.notifyWatchers(normalizedNew, 'rename');
  }

  /**
   * Read file with optional options parameter
   */
  readFile(
    path: string,
    optionsOrCallback?: { encoding?: string } | ((err: Error | null, data?: Uint8Array | string) => void),
    callback?: (err: Error | null, data?: Uint8Array | string) => void
  ): void {
    const actualCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
    const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : undefined;

    try {
      const data = options?.encoding
        ? this.readFileSync(path, options.encoding as 'utf8')
        : this.readFileSync(path);
      if (actualCallback) {
        setTimeout(() => actualCallback(null, data), 0);
      }
    } catch (err) {
      if (actualCallback) {
        setTimeout(() => actualCallback(err as Error), 0);
      }
    }
  }

  /**
   * Async stat
   */
  stat(path: string, callback: (err: Error | null, stats?: Stats) => void): void {
    try {
      const stats = this.statSync(path);
      setTimeout(() => callback(null, stats), 0);
    } catch (err) {
      setTimeout(() => callback(err as Error), 0);
    }
  }

  /**
   * Async lstat
   */
  lstat(path: string, callback: (err: Error | null, stats?: Stats) => void): void {
    this.stat(path, callback);
  }

  /**
   * Async readdir
   */
  readdir(
    path: string,
    optionsOrCallback?: { withFileTypes?: boolean } | ((err: Error | null, files?: string[]) => void),
    callback?: (err: Error | null, files?: string[]) => void
  ): void {
    const actualCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;

    try {
      const files = this.readdirSync(path);
      if (actualCallback) {
        setTimeout(() => actualCallback(null, files), 0);
      }
    } catch (err) {
      if (actualCallback) {
        setTimeout(() => actualCallback(err as Error), 0);
      }
    }
  }

  /**
   * Async realpath
   */
  realpath(path: string, callback: (err: Error | null, resolvedPath?: string) => void): void {
    try {
      const resolved = this.realpathSync(path);
      setTimeout(() => callback(null, resolved), 0);
    } catch (err) {
      setTimeout(() => callback(err as Error), 0);
    }
  }

  /**
   * Sync realpath - in our VFS, just normalize the path
   */
  realpathSync(path: string): string {
    const normalized = this.normalizePath(path);
    if (!this.existsSync(normalized)) {
      throw createNodeError('ENOENT', 'realpath', path);
    }
    return normalized;
  }

  /**
   * Watch for file changes
   */
  watch(
    filename: string,
    optionsOrListener?: { persistent?: boolean; recursive?: boolean; encoding?: string } | WatchListener,
    listener?: WatchListener
  ): FSWatcher {
    const normalized = this.normalizePath(filename);

    // Parse arguments
    let options: { persistent?: boolean; recursive?: boolean } = {};
    let actualListener: WatchListener | undefined;

    if (typeof optionsOrListener === 'function') {
      actualListener = optionsOrListener;
    } else if (optionsOrListener) {
      options = optionsOrListener;
      actualListener = listener;
    } else {
      actualListener = listener;
    }

    // Create watcher entry
    const entry: WatcherEntry = {
      listener: actualListener || (() => {}),
      recursive: options.recursive || false,
      closed: false,
    };

    // Add to watchers map
    if (!this.watchers.has(normalized)) {
      this.watchers.set(normalized, new Set());
    }
    this.watchers.get(normalized)!.add(entry);

    // Return FSWatcher interface
    const watcher: FSWatcher = {
      close: () => {
        entry.closed = true;
        const watcherSet = this.watchers.get(normalized);
        if (watcherSet) {
          watcherSet.delete(entry);
          if (watcherSet.size === 0) {
            this.watchers.delete(normalized);
          }
        }
      },
      ref: () => watcher,
      unref: () => watcher,
    };

    return watcher;
  }

  /**
   * Notify watchers of file changes
   */
  private notifyWatchers(path: string, eventType: WatchEventType): void {
    const normalized = this.normalizePath(path);
    const basename = this.getBasename(normalized);

    // Check direct watchers on this file
    const directWatchers = this.watchers.get(normalized);
    if (directWatchers) {
      for (const entry of directWatchers) {
        if (!entry.closed) {
          try {
            entry.listener(eventType, basename);
          } catch (err) {
            console.error('Error in file watcher:', err);
          }
        }
      }
    }

    // Check parent directory watchers (recursive and non-recursive)
    let currentPath = this.getParentPath(normalized);
    let relativePath = basename;

    while (currentPath) {
      const parentWatchers = this.watchers.get(currentPath);
      if (parentWatchers) {
        for (const entry of parentWatchers) {
          if (!entry.closed) {
            // Non-recursive watchers only get notified for direct children
            const isDirectChild = this.getParentPath(normalized) === currentPath;
            if (entry.recursive || isDirectChild) {
              try {
                entry.listener(eventType, relativePath);
              } catch (err) {
                console.error('Error in file watcher:', err);
              }
            }
          }
        }
      }

      if (currentPath === '/') break;
      relativePath = this.getBasename(currentPath) + '/' + relativePath;
      currentPath = this.getParentPath(currentPath);
    }
  }

  /**
   * Access check - in our VFS, always succeeds if file exists
   */
  accessSync(path: string, mode?: number): void {
    if (!this.existsSync(path)) {
      throw createNodeError('ENOENT', 'access', path);
    }
  }

  /**
   * Async access
   */
  access(path: string, modeOrCallback?: number | ((err: Error | null) => void), callback?: (err: Error | null) => void): void {
    const actualCallback = typeof modeOrCallback === 'function' ? modeOrCallback : callback;
    try {
      this.accessSync(path);
      if (actualCallback) setTimeout(() => actualCallback(null), 0);
    } catch (err) {
      if (actualCallback) setTimeout(() => actualCallback(err as Error), 0);
    }
  }

  /**
   * Copy file
   */
  copyFileSync(src: string, dest: string): void {
    const content = this.readFileSync(src);
    this.writeFileSync(dest, content);
  }

  /**
   * Create read stream - simplified implementation
   */
  createReadStream(path: string): {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    pipe: (dest: unknown) => unknown;
  } {
    const self = this;
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

    const stream = {
      on(event: string, cb: (...args: unknown[]) => void) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
        return stream;
      },
      pipe(dest: unknown) {
        return dest;
      },
    };

    // Emit data asynchronously
    setTimeout(() => {
      try {
        const data = self.readFileSync(path);
        listeners['data']?.forEach((cb) => cb(data));
        listeners['end']?.forEach((cb) => cb());
      } catch (err) {
        listeners['error']?.forEach((cb) => cb(err));
      }
    }, 0);

    return stream;
  }

  /**
   * Create write stream - simplified implementation
   */
  createWriteStream(path: string): {
    write: (data: string | Uint8Array) => boolean;
    end: (data?: string | Uint8Array) => void;
    on: (event: string, cb: (...args: unknown[]) => void) => void;
  } {
    const self = this;
    const chunks: Uint8Array[] = [];
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const encoder = new TextEncoder();

    return {
      write(data: string | Uint8Array): boolean {
        const chunk = typeof data === 'string' ? encoder.encode(data) : data;
        chunks.push(chunk);
        return true;
      },
      end(data?: string | Uint8Array): void {
        if (data) {
          const chunk = typeof data === 'string' ? encoder.encode(data) : data;
          chunks.push(chunk);
        }
        // Combine chunks
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        self.writeFileSync(path, combined);
        listeners['finish']?.forEach((cb) => cb());
        listeners['close']?.forEach((cb) => cb());
      },
      on(event: string, cb: (...args: unknown[]) => void) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
        return this;
      },
    };
  }
}
