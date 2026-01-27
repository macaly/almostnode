/**
 * chokidar shim - File watcher library used by Vite
 * Wraps our VirtualFS watch implementation
 */

import { EventEmitter } from './events';
import type { VirtualFS, FSWatcher as VFSWatcher, Stats } from '../virtual-fs';

// Global reference to VFS - set by runtime
let globalVFS: VirtualFS | null = null;

export function setVFS(vfs: VirtualFS): void {
  globalVFS = vfs;
}

export interface ChokidarOptions {
  persistent?: boolean;
  ignored?: string | RegExp | ((path: string) => boolean) | Array<string | RegExp | ((path: string) => boolean)>;
  ignoreInitial?: boolean;
  followSymlinks?: boolean;
  cwd?: string;
  disableGlobbing?: boolean;
  usePolling?: boolean;
  interval?: number;
  binaryInterval?: number;
  alwaysStat?: boolean;
  depth?: number;
  awaitWriteFinish?: boolean | { stabilityThreshold?: number; pollInterval?: number };
  ignorePermissionErrors?: boolean;
  atomic?: boolean | number;
}

export class FSWatcher extends EventEmitter {
  private vfs: VirtualFS;
  private watched = new Map<string, VFSWatcher>();
  private options: ChokidarOptions;
  private closed = false;
  private ready = false;
  private _eventCounts?: Map<string, number>;

  constructor(options: ChokidarOptions = {}) {
    super();
    if (!globalVFS) {
      throw new Error('chokidar: VirtualFS not initialized. Call setVFS first.');
    }
    this.vfs = globalVFS;
    this.options = options;
  }

  private shouldIgnore(path: string): boolean {
    const { ignored } = this.options;
    if (!ignored) return false;

    const ignoreList = Array.isArray(ignored) ? ignored : [ignored];

    for (const pattern of ignoreList) {
      if (typeof pattern === 'string') {
        if (path === pattern || path.startsWith(pattern + '/')) return true;
      } else if (pattern instanceof RegExp) {
        if (pattern.test(path)) return true;
      } else if (typeof pattern === 'function') {
        if (pattern(path)) return true;
      }
    }

    return false;
  }

  private normalizePath(path: string): string {
    // Apply cwd if set
    if (this.options.cwd && !path.startsWith('/')) {
      path = this.options.cwd + '/' + path;
    }
    // Normalize path
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    return path;
  }

  add(paths: string | readonly string[]): this {
    if (this.closed) return this;

    const pathArray = Array.isArray(paths) ? paths : [paths];
    const pendingEmits: Array<() => void> = [];
    console.log('[chokidar] add:', pathArray);

    for (const p of pathArray) {
      const normalized = this.normalizePath(p);

      if (this.shouldIgnore(normalized)) continue;
      if (this.watched.has(normalized)) continue;

      try {
        // Check if path exists
        if (!this.vfs.existsSync(normalized)) {
          // Path doesn't exist yet - that's ok, we'll watch the parent
          const parentPath = normalized.substring(0, normalized.lastIndexOf('/')) || '/';
          if (this.vfs.existsSync(parentPath)) {
            this.watchPath(parentPath, normalized);
          }
          continue;
        }

        const stats = this.vfs.statSync(normalized);

        // Emit initial 'add' events unless ignoreInitial is set
        if (!this.options.ignoreInitial) {
          if (stats.isDirectory()) {
            this.collectDirContents(normalized, pendingEmits);
          } else {
            pendingEmits.push(() => this.emit('add', normalized, stats));
          }
        }

        // Set up watching
        this.watchPath(normalized);

        // If directory, also watch contents recursively
        if (stats.isDirectory()) {
          this.watchDirRecursive(normalized);
        }
      } catch (err) {
        this.emit('error', err);
      }
    }

    // Emit ready event and initial add events asynchronously
    // so listeners can be attached after watch() is called
    if (!this.ready) {
      this.ready = true;
      setTimeout(() => {
        for (const emitFn of pendingEmits) {
          emitFn();
        }
        this.emit('ready');
      }, 0);
    }

    return this;
  }

  private collectDirContents(dirPath: string, pendingEmits: Array<() => void>): void {
    try {
      const entries = this.vfs.readdirSync(dirPath);
      for (const entry of entries) {
        const fullPath = dirPath === '/' ? '/' + entry : dirPath + '/' + entry;
        if (this.shouldIgnore(fullPath)) continue;

        const stats = this.vfs.statSync(fullPath);
        if (stats.isDirectory()) {
          pendingEmits.push(() => this.emit('addDir', fullPath, stats));
          this.collectDirContents(fullPath, pendingEmits);
        } else {
          pendingEmits.push(() => this.emit('add', fullPath, stats));
        }
      }
    } catch {
      // Ignore errors during initial scan
    }
  }

  private watchPath(path: string, watchFor?: string): void {
    if (this.watched.has(path)) return;

    const watcher = this.vfs.watch(path, { recursive: true }, (eventType, filename) => {
      if (this.closed) return;

      let fullPath: string;
      if (filename) {
        fullPath = path === '/' ? '/' + filename : path + '/' + filename;
      } else {
        fullPath = path;
      }

      // Debug: Track watch events per path to detect infinite loops
      const eventKey = `${eventType}:${fullPath}`;
      if (!this._eventCounts) this._eventCounts = new Map<string, number>();
      const count = (this._eventCounts.get(eventKey) || 0) + 1;
      this._eventCounts.set(eventKey, count);
      if (count === 5) {
        console.warn(`[chokidar] Repeated event: ${eventType} on ${fullPath} (${count}+ times)`);
      }

      console.log('[chokidar] event:', eventType, fullPath);

      // If we're watching for a specific path, only emit for that
      if (watchFor && fullPath !== watchFor && !fullPath.startsWith(watchFor + '/')) {
        return;
      }

      if (this.shouldIgnore(fullPath)) {
        console.log('[chokidar] ignored:', fullPath);
        return;
      }

      if (eventType === 'rename') {
        // File was added or removed
        if (this.vfs.existsSync(fullPath)) {
          try {
            const stats = this.vfs.statSync(fullPath);
            if (stats.isDirectory()) {
              console.log('[chokidar] emit addDir:', fullPath);
              this.emit('addDir', fullPath, stats);
            } else {
              console.log('[chokidar] emit add:', fullPath);
              this.emit('add', fullPath, stats);
            }
          } catch {
            // Race condition - file may have been deleted
          }
        } else {
          console.log('[chokidar] emit unlink:', fullPath);
          this.emit('unlink', fullPath);
        }
      } else if (eventType === 'change') {
        // File was modified
        try {
          const stats = this.vfs.statSync(fullPath);
          console.log('[chokidar] emit change:', fullPath);
          this.emit('change', fullPath, stats);
        } catch {
          // File may have been deleted
          this.emit('unlink', fullPath);
        }
      }
    });

    this.watched.set(path, watcher);
  }

  private watchDirRecursive(dirPath: string, depth = 0): void {
    if (this.options.depth !== undefined && depth > this.options.depth) return;

    try {
      const entries = this.vfs.readdirSync(dirPath);
      for (const entry of entries) {
        const fullPath = dirPath === '/' ? '/' + entry : dirPath + '/' + entry;
        if (this.shouldIgnore(fullPath)) continue;

        try {
          const stats = this.vfs.statSync(fullPath);
          if (stats.isDirectory()) {
            this.watchPath(fullPath);
            this.watchDirRecursive(fullPath, depth + 1);
          }
        } catch {
          // Ignore errors
        }
      }
    } catch {
      // Ignore errors
    }
  }

  unwatch(paths: string | readonly string[]): this {
    const pathArray = Array.isArray(paths) ? paths : [paths];

    for (const p of pathArray) {
      const normalized = this.normalizePath(p);
      const watcher = this.watched.get(normalized);
      if (watcher) {
        watcher.close();
        this.watched.delete(normalized);
      }
    }

    return this;
  }

  close(): Promise<void> {
    this.closed = true;

    for (const watcher of this.watched.values()) {
      watcher.close();
    }
    this.watched.clear();

    this.emit('close');
    return Promise.resolve();
  }

  getWatched(): Record<string, string[]> {
    const result: Record<string, string[]> = {};

    for (const path of this.watched.keys()) {
      const dir = path.substring(0, path.lastIndexOf('/')) || '/';
      const basename = path.substring(path.lastIndexOf('/') + 1);

      if (!result[dir]) {
        result[dir] = [];
      }
      result[dir].push(basename);
    }

    return result;
  }

}

/**
 * Watch files/directories for changes
 */
export function watch(
  paths: string | readonly string[],
  options?: ChokidarOptions
): FSWatcher {
  const watcher = new FSWatcher(options);
  watcher.add(paths);
  return watcher;
}

export default { watch, FSWatcher, setVFS };
