import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';

describe('VirtualFS', () => {
  let vfs: VirtualFS;

  beforeEach(() => {
    vfs = new VirtualFS();
  });

  describe('writeFileSync / readFileSync', () => {
    it('should write and read a text file', () => {
      vfs.writeFileSync('/test.txt', 'hello world');
      const content = vfs.readFileSync('/test.txt', 'utf8');
      expect(content).toBe('hello world');
    });

    it('should write and read binary data', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      vfs.writeFileSync('/binary.bin', data);
      const content = vfs.readFileSync('/binary.bin');
      expect(content).toEqual(data);
    });

    it('should create parent directories automatically', () => {
      vfs.writeFileSync('/deep/nested/path/file.txt', 'content');
      expect(vfs.existsSync('/deep')).toBe(true);
      expect(vfs.existsSync('/deep/nested')).toBe(true);
      expect(vfs.existsSync('/deep/nested/path')).toBe(true);
      expect(vfs.readFileSync('/deep/nested/path/file.txt', 'utf8')).toBe('content');
    });

    it('should overwrite existing file', () => {
      vfs.writeFileSync('/test.txt', 'original');
      vfs.writeFileSync('/test.txt', 'updated');
      expect(vfs.readFileSync('/test.txt', 'utf8')).toBe('updated');
    });

    it('should throw when reading non-existent file', () => {
      expect(() => vfs.readFileSync('/nonexistent.txt')).toThrow('ENOENT');
    });

    it('should throw when reading a directory as file', () => {
      vfs.mkdirSync('/mydir');
      expect(() => vfs.readFileSync('/mydir')).toThrow('EISDIR');
    });
  });

  describe('existsSync', () => {
    it('should return true for existing file', () => {
      vfs.writeFileSync('/exists.txt', 'content');
      expect(vfs.existsSync('/exists.txt')).toBe(true);
    });

    it('should return true for existing directory', () => {
      vfs.mkdirSync('/mydir');
      expect(vfs.existsSync('/mydir')).toBe(true);
    });

    it('should return false for non-existent path', () => {
      expect(vfs.existsSync('/nonexistent')).toBe(false);
    });

    it('should return true for root directory', () => {
      expect(vfs.existsSync('/')).toBe(true);
    });
  });

  describe('statSync', () => {
    it('should return correct stats for file', () => {
      vfs.writeFileSync('/file.txt', 'content');
      const stats = vfs.statSync('/file.txt');
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
    });

    it('should return correct stats for directory', () => {
      vfs.mkdirSync('/mydir');
      const stats = vfs.statSync('/mydir');
      expect(stats.isFile()).toBe(false);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should throw for non-existent path', () => {
      expect(() => vfs.statSync('/nonexistent')).toThrow('ENOENT');
    });
  });

  describe('mkdirSync', () => {
    it('should create a directory', () => {
      vfs.mkdirSync('/newdir');
      expect(vfs.existsSync('/newdir')).toBe(true);
      expect(vfs.statSync('/newdir').isDirectory()).toBe(true);
    });

    it('should throw when parent does not exist (non-recursive)', () => {
      expect(() => vfs.mkdirSync('/a/b/c')).toThrow('ENOENT');
    });

    it('should create parent directories with recursive option', () => {
      vfs.mkdirSync('/a/b/c', { recursive: true });
      expect(vfs.existsSync('/a')).toBe(true);
      expect(vfs.existsSync('/a/b')).toBe(true);
      expect(vfs.existsSync('/a/b/c')).toBe(true);
    });

    it('should throw when directory already exists (non-recursive)', () => {
      vfs.mkdirSync('/existing');
      expect(() => vfs.mkdirSync('/existing')).toThrow('EEXIST');
    });

    it('should not throw when directory exists with recursive option', () => {
      vfs.mkdirSync('/existing');
      expect(() => vfs.mkdirSync('/existing', { recursive: true })).not.toThrow();
    });
  });

  describe('readdirSync', () => {
    it('should list directory contents', () => {
      vfs.writeFileSync('/dir/file1.txt', 'a');
      vfs.writeFileSync('/dir/file2.txt', 'b');
      vfs.mkdirSync('/dir/subdir');

      const contents = vfs.readdirSync('/dir');
      expect(contents).toContain('file1.txt');
      expect(contents).toContain('file2.txt');
      expect(contents).toContain('subdir');
      expect(contents.length).toBe(3);
    });

    it('should return empty array for empty directory', () => {
      vfs.mkdirSync('/empty');
      expect(vfs.readdirSync('/empty')).toEqual([]);
    });

    it('should throw for non-existent directory', () => {
      expect(() => vfs.readdirSync('/nonexistent')).toThrow('ENOENT');
    });

    it('should throw when trying to read file as directory', () => {
      vfs.writeFileSync('/file.txt', 'content');
      expect(() => vfs.readdirSync('/file.txt')).toThrow('ENOTDIR');
    });
  });

  describe('unlinkSync', () => {
    it('should remove a file', () => {
      vfs.writeFileSync('/toremove.txt', 'content');
      expect(vfs.existsSync('/toremove.txt')).toBe(true);
      vfs.unlinkSync('/toremove.txt');
      expect(vfs.existsSync('/toremove.txt')).toBe(false);
    });

    it('should throw when file does not exist', () => {
      expect(() => vfs.unlinkSync('/nonexistent.txt')).toThrow('ENOENT');
    });

    it('should throw when trying to unlink a directory', () => {
      vfs.mkdirSync('/mydir');
      expect(() => vfs.unlinkSync('/mydir')).toThrow('EISDIR');
    });
  });

  describe('rmdirSync', () => {
    it('should remove an empty directory', () => {
      vfs.mkdirSync('/emptydir');
      vfs.rmdirSync('/emptydir');
      expect(vfs.existsSync('/emptydir')).toBe(false);
    });

    it('should throw when directory is not empty', () => {
      vfs.writeFileSync('/dir/file.txt', 'content');
      expect(() => vfs.rmdirSync('/dir')).toThrow('ENOTEMPTY');
    });

    it('should throw when path does not exist', () => {
      expect(() => vfs.rmdirSync('/nonexistent')).toThrow('ENOENT');
    });

    it('should throw when trying to remove root', () => {
      expect(() => vfs.rmdirSync('/')).toThrow('EPERM');
    });
  });

  describe('renameSync', () => {
    it('should rename a file', () => {
      vfs.writeFileSync('/old.txt', 'content');
      vfs.renameSync('/old.txt', '/new.txt');
      expect(vfs.existsSync('/old.txt')).toBe(false);
      expect(vfs.existsSync('/new.txt')).toBe(true);
      expect(vfs.readFileSync('/new.txt', 'utf8')).toBe('content');
    });

    it('should move a file to different directory', () => {
      vfs.writeFileSync('/source/file.txt', 'content');
      vfs.mkdirSync('/dest');
      vfs.renameSync('/source/file.txt', '/dest/file.txt');
      expect(vfs.existsSync('/source/file.txt')).toBe(false);
      expect(vfs.existsSync('/dest/file.txt')).toBe(true);
    });

    it('should create destination directory if needed', () => {
      vfs.writeFileSync('/file.txt', 'content');
      vfs.renameSync('/file.txt', '/new/path/file.txt');
      expect(vfs.existsSync('/new/path/file.txt')).toBe(true);
    });

    it('should throw when source does not exist', () => {
      expect(() => vfs.renameSync('/nonexistent', '/dest')).toThrow('ENOENT');
    });
  });

  describe('path normalization', () => {
    it('should handle paths without leading slash', () => {
      vfs.writeFileSync('test.txt', 'content');
      expect(vfs.readFileSync('/test.txt', 'utf8')).toBe('content');
    });

    it('should resolve . in paths', () => {
      vfs.writeFileSync('/dir/./file.txt', 'content');
      expect(vfs.readFileSync('/dir/file.txt', 'utf8')).toBe('content');
    });

    it('should resolve .. in paths', () => {
      vfs.writeFileSync('/a/b/../file.txt', 'content');
      expect(vfs.readFileSync('/a/file.txt', 'utf8')).toBe('content');
    });
  });
});
