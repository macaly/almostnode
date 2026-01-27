/**
 * VFS Adapter stub for browser builds
 * The real vfs-adapter imports types from just-bash, but we don't need it for Convex CLI
 */

import type { VirtualFS } from '@runtime/virtual-fs';

// Re-export the interface types that just-bash would provide
export interface IFileSystem {
  readFile(path: string, options?: any): Promise<string>;
  readFileBuffer(path: string): Promise<Uint8Array>;
  writeFile(path: string, content: any, options?: any): Promise<void>;
  appendFile(path: string, content: any, options?: any): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<any>;
  mkdir(path: string, options?: any): Promise<void>;
  readdir(path: string): Promise<string[]>;
  readdirWithFileTypes(path: string): Promise<any[]>;
  rm(path: string, options?: any): Promise<void>;
  cp(src: string, dest: string, options?: any): Promise<void>;
  mv(src: string, dest: string): Promise<void>;
  resolvePath(base: string, path: string): string;
  getAllPaths(): string[];
  chmod(path: string, mode: number): Promise<void>;
  symlink(target: string, linkPath: string): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  readlink(path: string): Promise<string>;
  lstat(path: string): Promise<any>;
  realpath(path: string): Promise<string>;
  utimes(path: string, atime: Date, mtime: Date): Promise<void>;
}

/**
 * VirtualFS Adapter - wraps VirtualFS to implement IFileSystem interface
 */
export class VirtualFSAdapter implements IFileSystem {
  constructor(private vfs: VirtualFS) {}

  async readFile(path: string, options?: any): Promise<string> {
    return this.vfs.readFileSync(path, options?.encoding || 'utf8');
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    return this.vfs.readFileSync(path);
  }

  async writeFile(path: string, content: any, _options?: any): Promise<void> {
    this.vfs.writeFileSync(path, content);
  }

  async appendFile(path: string, content: any, _options?: any): Promise<void> {
    let existing = '';
    try {
      existing = this.vfs.readFileSync(path, 'utf8');
    } catch {
      // File doesn't exist
    }
    this.vfs.writeFileSync(path, existing + content);
  }

  async exists(path: string): Promise<boolean> {
    return this.vfs.existsSync(path);
  }

  async stat(path: string): Promise<any> {
    const stats = this.vfs.statSync(path);
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymbolicLink: false,
      mode: stats.isDirectory() ? 0o755 : 0o644,
      size: 0,
      mtime: new Date(),
    };
  }

  async mkdir(path: string, options?: any): Promise<void> {
    this.vfs.mkdirSync(path, options);
  }

  async readdir(path: string): Promise<string[]> {
    return this.vfs.readdirSync(path);
  }

  async readdirWithFileTypes(path: string): Promise<any[]> {
    const entries = this.vfs.readdirSync(path);
    return entries.map(name => {
      const fullPath = path === '/' ? `/${name}` : `${path}/${name}`;
      try {
        const stats = this.vfs.statSync(fullPath);
        return {
          name,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          isSymbolicLink: false,
        };
      } catch {
        return { name, isFile: true, isDirectory: false, isSymbolicLink: false };
      }
    });
  }

  async rm(path: string, options?: any): Promise<void> {
    if (!this.vfs.existsSync(path)) {
      if (options?.force) return;
      throw new Error(`ENOENT: no such file or directory, rm '${path}'`);
    }
    const stats = this.vfs.statSync(path);
    if (stats.isFile()) {
      this.vfs.unlinkSync(path);
    } else {
      this.vfs.rmdirSync(path);
    }
  }

  async cp(src: string, dest: string, _options?: any): Promise<void> {
    const content = this.vfs.readFileSync(src);
    this.vfs.writeFileSync(dest, content);
  }

  async mv(src: string, dest: string): Promise<void> {
    this.vfs.renameSync(src, dest);
  }

  resolvePath(base: string, path: string): string {
    if (path.startsWith('/')) return path;
    return base.endsWith('/') ? `${base}${path}` : `${base}/${path}`;
  }

  getAllPaths(): string[] {
    const paths: string[] = [];
    const collectPaths = (dir: string) => {
      try {
        const entries = this.vfs.readdirSync(dir);
        for (const entry of entries) {
          const fullPath = dir === '/' ? `/${entry}` : `${dir}/${entry}`;
          paths.push(fullPath);
          try {
            const stats = this.vfs.statSync(fullPath);
            if (stats.isDirectory()) collectPaths(fullPath);
          } catch {}
        }
      } catch {}
    };
    collectPaths('/');
    return paths;
  }

  async chmod(_path: string, _mode: number): Promise<void> {}
  async symlink(_target: string, _linkPath: string): Promise<void> {
    throw new Error('Symbolic links not supported');
  }
  async link(_existingPath: string, _newPath: string): Promise<void> {
    throw new Error('Hard links not supported');
  }
  async readlink(_path: string): Promise<string> {
    throw new Error('Symbolic links not supported');
  }
  async lstat(path: string): Promise<any> {
    return this.stat(path);
  }
  async realpath(path: string): Promise<string> {
    return path;
  }
  async utimes(_path: string, _atime: Date, _mtime: Date): Promise<void> {}
}
