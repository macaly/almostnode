/**
 * readdirp shim - Recursive directory reader
 * Used by some build tools for file discovery
 */

import type { VirtualFS, Stats } from '../virtual-fs';

// Global reference to VFS - set by runtime
let globalVFS: VirtualFS | null = null;

export function setVFS(vfs: VirtualFS): void {
  globalVFS = vfs;
}

export interface ReaddirpOptions {
  root?: string;
  fileFilter?: string | string[] | ((entry: EntryInfo) => boolean);
  directoryFilter?: string | string[] | ((entry: EntryInfo) => boolean);
  depth?: number;
  type?: 'files' | 'directories' | 'files_directories' | 'all';
  lstat?: boolean;
  alwaysStat?: boolean;
}

export interface EntryInfo {
  path: string;
  fullPath: string;
  basename: string;
  stats?: Stats;
  dirent?: { isFile(): boolean; isDirectory(): boolean; name: string };
}

class ReaddirpStream {
  private options: ReaddirpOptions;
  private root: string;
  private entries: EntryInfo[] = [];
  private index = 0;
  private collected = false;

  constructor(root: string, options: ReaddirpOptions = {}) {
    this.root = root;
    this.options = options;
  }

  private matchFilter(
    entry: EntryInfo,
    filter?: string | string[] | ((entry: EntryInfo) => boolean)
  ): boolean {
    if (!filter) return true;

    if (typeof filter === 'function') {
      return filter(entry);
    }

    const patterns = Array.isArray(filter) ? filter : [filter];
    for (const pattern of patterns) {
      if (pattern.startsWith('!')) {
        // Negation pattern
        const posPattern = pattern.slice(1);
        if (this.matchGlob(entry.basename, posPattern)) {
          return false;
        }
      } else if (this.matchGlob(entry.basename, pattern)) {
        return true;
      }
    }

    return patterns.length === 0 || patterns.every((p) => p.startsWith('!'));
  }

  private matchGlob(name: string, pattern: string): boolean {
    // Simple glob matching
    if (pattern === '*') return true;
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1);
      return name.endsWith(ext);
    }
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return name.startsWith(prefix);
    }
    return name === pattern;
  }

  private collect(dir: string, depth: number, relativePath: string = ''): void {
    if (!globalVFS) return;
    if (this.options.depth !== undefined && depth > this.options.depth) return;

    try {
      const entries = globalVFS.readdirSync(dir);

      for (const name of entries) {
        const fullPath = dir === '/' ? '/' + name : dir + '/' + name;
        const relPath = relativePath ? relativePath + '/' + name : name;

        try {
          const stats = globalVFS.statSync(fullPath);
          const isDir = stats.isDirectory();

          const entry: EntryInfo = {
            path: relPath,
            fullPath,
            basename: name,
            stats: this.options.alwaysStat ? stats : undefined,
            dirent: {
              isFile: () => !isDir,
              isDirectory: () => isDir,
              name,
            },
          };

          const type = this.options.type || 'files';

          if (isDir) {
            // Check directory filter
            if (!this.matchFilter(entry, this.options.directoryFilter)) {
              continue; // Skip this directory entirely
            }

            if (type === 'directories' || type === 'files_directories' || type === 'all') {
              this.entries.push(entry);
            }

            // Recurse into directory
            this.collect(fullPath, depth + 1, relPath);
          } else {
            if (type === 'files' || type === 'files_directories' || type === 'all') {
              // Check file filter
              if (this.matchFilter(entry, this.options.fileFilter)) {
                this.entries.push(entry);
              }
            }
          }
        } catch {
          // Skip entries that can't be stat'd
        }
      }
    } catch {
      // Skip directories that can't be read
    }
  }

  // Async iterator
  async *[Symbol.asyncIterator](): AsyncIterableIterator<EntryInfo> {
    if (!this.collected) {
      this.collect(this.root, 0);
      this.collected = true;
    }

    for (const entry of this.entries) {
      yield entry;
    }
  }

  // Promise-based API
  async toArray(): Promise<EntryInfo[]> {
    if (!this.collected) {
      this.collect(this.root, 0);
      this.collected = true;
    }
    return [...this.entries];
  }

  // Stream-like API for compatibility
  on(event: string, callback: (...args: unknown[]) => void): this {
    if (event === 'data') {
      // Emit entries asynchronously
      setTimeout(async () => {
        if (!this.collected) {
          this.collect(this.root, 0);
          this.collected = true;
        }
        for (const entry of this.entries) {
          callback(entry);
        }
        // Emit 'end' after all data
        this.emit('end');
      }, 0);
    }
    return this;
  }

  private listeners: Map<string, ((...args: unknown[]) => void)[]> = new Map();

  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(...args);
      }
    }
  }

  once(event: string, callback: (...args: unknown[]) => void): this {
    const wrapper = (...args: unknown[]) => {
      callback(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  off(event: string, callback: (...args: unknown[]) => void): this {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(callback);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
    return this;
  }
}

/**
 * Read directory recursively
 */
export function readdirp(root: string, options?: ReaddirpOptions): ReaddirpStream {
  return new ReaddirpStream(root, options);
}

// Promise-based helper
export async function readdirpPromise(root: string, options?: ReaddirpOptions): Promise<EntryInfo[]> {
  const stream = new ReaddirpStream(root, options);
  return stream.toArray();
}

export default readdirp;
export { ReaddirpStream };
