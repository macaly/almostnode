/**
 * Stub for just-bash - browser version doesn't need shell execution
 */

// Type stubs to satisfy imports
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

export interface FsStat {
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  mode: number;
  size: number;
  mtime: Date;
}

export interface DirentEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
}

export type ReadFileOptions = { encoding?: string };
export type WriteFileOptions = { encoding?: string; mode?: number };
export type MkdirOptions = { recursive?: boolean };
export type RmOptions = { recursive?: boolean; force?: boolean };
export type CpOptions = { recursive?: boolean };
export type BufferEncoding = string;
export type FileContent = string | Uint8Array;

/**
 * Stub Bash class - throws errors when used
 */
export class Bash {
  constructor(_options?: any) {}

  exec(_command: string, _options?: any): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return Promise.resolve({ stdout: '', stderr: 'Shell execution not available in browser', exitCode: 1 });
  }
}

export default { Bash };
