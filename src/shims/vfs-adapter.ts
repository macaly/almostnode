/**
 * VirtualFS Adapter for just-bash
 * Implements IFileSystem interface to bridge VirtualFS with just-bash
 */

import type {
  IFileSystem,
  FsStat,
  DirentEntry,
  ReadFileOptions,
  WriteFileOptions,
  MkdirOptions,
  RmOptions,
  CpOptions,
  BufferEncoding,
  FileContent,
} from 'just-bash';
import type { VirtualFS } from '../virtual-fs';

export class VirtualFSAdapter implements IFileSystem {
  constructor(private vfs: VirtualFS) {}

  /**
   * Read the contents of a file as a string
   */
  async readFile(
    path: string,
    options?: ReadFileOptions | BufferEncoding
  ): Promise<string> {
    const encoding = typeof options === 'string' ? options : options?.encoding;

    // VirtualFS only natively supports utf8/utf-8
    // For other encodings, we need to handle the conversion ourselves
    if (!encoding || encoding === 'utf8' || encoding === 'utf-8') {
      return this.vfs.readFileSync(path, 'utf8');
    }

    // For binary/latin1 encoding, convert each byte to a character
    if (encoding === 'binary' || encoding === 'latin1') {
      const buffer = this.vfs.readFileSync(path);
      return String.fromCharCode(...buffer);
    }

    // For other encodings, fall back to utf8
    return this.vfs.readFileSync(path, 'utf8');
  }

  /**
   * Read the contents of a file as a Uint8Array (binary)
   */
  async readFileBuffer(path: string): Promise<Uint8Array> {
    return this.vfs.readFileSync(path);
  }

  /**
   * Write content to a file, creating it if it doesn't exist
   */
  async writeFile(
    path: string,
    content: FileContent,
    _options?: WriteFileOptions | BufferEncoding
  ): Promise<void> {
    this.vfs.writeFileSync(path, content);
  }

  /**
   * Append content to a file, creating it if it doesn't exist
   */
  async appendFile(
    path: string,
    content: FileContent,
    _options?: WriteFileOptions | BufferEncoding
  ): Promise<void> {
    let existing = '';
    try {
      existing = this.vfs.readFileSync(path, 'utf8');
    } catch {
      // File doesn't exist, start with empty content
    }
    const newContent =
      typeof content === 'string' ? content : new TextDecoder().decode(content);
    this.vfs.writeFileSync(path, existing + newContent);
  }

  /**
   * Check if a path exists
   */
  async exists(path: string): Promise<boolean> {
    return this.vfs.existsSync(path);
  }

  /**
   * Get file/directory information
   */
  async stat(path: string): Promise<FsStat> {
    const stats = this.vfs.statSync(path);
    const isFile = stats.isFile();
    const isDirectory = stats.isDirectory();

    let size = 0;
    if (isFile) {
      try {
        const content = this.vfs.readFileSync(path);
        size = content.length;
      } catch {
        // Shouldn't happen, but default to 0
      }
    }

    return {
      isFile,
      isDirectory,
      isSymbolicLink: false,
      mode: isDirectory ? 0o755 : 0o644,
      size,
      mtime: new Date(),
    };
  }

  /**
   * Create a directory
   */
  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    this.vfs.mkdirSync(path, options);
  }

  /**
   * Read directory contents
   */
  async readdir(path: string): Promise<string[]> {
    return this.vfs.readdirSync(path);
  }

  /**
   * Read directory contents with file type information
   */
  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    const entries = this.vfs.readdirSync(path);
    const result: DirentEntry[] = [];

    for (const name of entries) {
      const fullPath = path === '/' ? `/${name}` : `${path}/${name}`;
      try {
        const stats = this.vfs.statSync(fullPath);
        result.push({
          name,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          isSymbolicLink: false,
        });
      } catch {
        // Entry disappeared between readdir and stat, skip it
      }
    }

    return result;
  }

  /**
   * Remove a file or directory
   */
  async rm(path: string, options?: RmOptions): Promise<void> {
    const exists = this.vfs.existsSync(path);

    if (!exists) {
      if (options?.force) {
        return; // Force mode ignores missing files
      }
      throw new Error(`ENOENT: no such file or directory, '${path}'`);
    }

    const stats = this.vfs.statSync(path);

    if (stats.isFile()) {
      this.vfs.unlinkSync(path);
    } else if (stats.isDirectory()) {
      if (options?.recursive) {
        await this.rmRecursive(path);
      } else {
        this.vfs.rmdirSync(path);
      }
    }
  }

  /**
   * Recursively remove a directory and its contents
   */
  private async rmRecursive(path: string): Promise<void> {
    const entries = this.vfs.readdirSync(path);

    for (const entry of entries) {
      const fullPath = path === '/' ? `/${entry}` : `${path}/${entry}`;
      const stats = this.vfs.statSync(fullPath);

      if (stats.isDirectory()) {
        await this.rmRecursive(fullPath);
      } else {
        this.vfs.unlinkSync(fullPath);
      }
    }

    this.vfs.rmdirSync(path);
  }

  /**
   * Copy a file or directory
   */
  async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    const stats = this.vfs.statSync(src);

    if (stats.isFile()) {
      const content = this.vfs.readFileSync(src);
      this.vfs.writeFileSync(dest, content);
    } else if (stats.isDirectory()) {
      if (!options?.recursive) {
        throw new Error(
          `EISDIR: illegal operation on a directory, cannot copy '${src}'`
        );
      }
      await this.cpRecursive(src, dest);
    }
  }

  /**
   * Recursively copy a directory
   */
  private async cpRecursive(src: string, dest: string): Promise<void> {
    // Create destination directory
    this.vfs.mkdirSync(dest, { recursive: true });

    const entries = this.vfs.readdirSync(src);

    for (const entry of entries) {
      const srcPath = src === '/' ? `/${entry}` : `${src}/${entry}`;
      const destPath = dest === '/' ? `/${entry}` : `${dest}/${entry}`;
      const stats = this.vfs.statSync(srcPath);

      if (stats.isDirectory()) {
        await this.cpRecursive(srcPath, destPath);
      } else {
        const content = this.vfs.readFileSync(srcPath);
        this.vfs.writeFileSync(destPath, content);
      }
    }
  }

  /**
   * Move/rename a file or directory
   */
  async mv(src: string, dest: string): Promise<void> {
    this.vfs.renameSync(src, dest);
  }

  /**
   * Resolve a relative path against a base path
   */
  resolvePath(base: string, path: string): string {
    // If path is absolute, return it as-is (normalized)
    if (path.startsWith('/')) {
      return this.normalizePath(path);
    }

    // Combine base and relative path
    const combined = base.endsWith('/')
      ? `${base}${path}`
      : `${base}/${path}`;

    return this.normalizePath(combined);
  }

  /**
   * Normalize a path (resolve . and .. segments)
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
   * Get all paths in the filesystem
   */
  getAllPaths(): string[] {
    const paths: string[] = [];
    this.collectPaths('/', paths);
    return paths;
  }

  /**
   * Recursively collect all paths
   */
  private collectPaths(dir: string, paths: string[]): void {
    try {
      const entries = this.vfs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = dir === '/' ? `/${entry}` : `${dir}/${entry}`;
        paths.push(fullPath);
        try {
          const stats = this.vfs.statSync(fullPath);
          if (stats.isDirectory()) {
            this.collectPaths(fullPath, paths);
          }
        } catch {
          // Skip if stat fails
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  }

  /**
   * Change file/directory permissions (no-op - VFS doesn't track permissions)
   */
  async chmod(_path: string, _mode: number): Promise<void> {
    // VFS doesn't track permissions, but we verify the path exists
    if (!this.vfs.existsSync(_path)) {
      throw new Error(`ENOENT: no such file or directory, '${_path}'`);
    }
    // No-op
  }

  /**
   * Create a symbolic link (not supported)
   */
  async symlink(_target: string, _linkPath: string): Promise<void> {
    throw new Error('Symbolic links are not supported in VirtualFS');
  }

  /**
   * Create a hard link (not supported)
   */
  async link(_existingPath: string, _newPath: string): Promise<void> {
    throw new Error('Hard links are not supported in VirtualFS');
  }

  /**
   * Read the target of a symbolic link (not supported)
   */
  async readlink(_path: string): Promise<string> {
    throw new Error('Symbolic links are not supported in VirtualFS');
  }

  /**
   * Get file/directory information without following symlinks
   * Since VFS doesn't support symlinks, this is the same as stat
   */
  async lstat(path: string): Promise<FsStat> {
    return this.stat(path);
  }

  /**
   * Resolve all symlinks in a path
   * Since VFS doesn't support symlinks, just normalize and return
   */
  async realpath(path: string): Promise<string> {
    // Verify path exists
    if (!this.vfs.existsSync(path)) {
      throw new Error(`ENOENT: no such file or directory, '${path}'`);
    }
    return this.normalizePath(path);
  }

  /**
   * Set access and modification times (no-op - VFS doesn't track times)
   */
  async utimes(path: string, _atime: Date, _mtime: Date): Promise<void> {
    // VFS doesn't track times, but we verify the path exists
    if (!this.vfs.existsSync(path)) {
      throw new Error(`ENOENT: no such file or directory, '${path}'`);
    }
    // No-op
  }
}
