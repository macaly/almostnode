import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import { createFsShim } from '../src/shims/fs';

describe('fs shim URL handling', () => {
  let vfs: VirtualFS;
  let fs: ReturnType<typeof createFsShim>;

  beforeEach(() => {
    vfs = new VirtualFS();
    fs = createFsShim(vfs);

    // Create test files
    vfs.mkdirSync('/test', { recursive: true });
    vfs.writeFileSync('/test/file.txt', 'hello world');
    vfs.writeFileSync('/test/data.json', '{"key": "value"}');
  });

  describe('readFileSync with URL', () => {
    it('should read file using file:// URL', () => {
      const url = new URL('file:///test/file.txt');
      const content = fs.readFileSync(url, 'utf8');
      expect(content).toBe('hello world');
    });

    it('should read file using file:// URL as Buffer', () => {
      const url = new URL('file:///test/file.txt');
      const content = fs.readFileSync(url);
      // Our Buffer shim may not pass Buffer.isBuffer, but should have Buffer-like properties
      expect(content).toHaveProperty('toString');
      expect(content.toString()).toBe('hello world');
    });

    it('should handle URL with encoded characters', () => {
      vfs.writeFileSync('/test/file with spaces.txt', 'spaced content');
      const url = new URL('file:///test/file%20with%20spaces.txt');
      const content = fs.readFileSync(url, 'utf8');
      expect(content).toBe('spaced content');
    });
  });

  describe('writeFileSync with URL', () => {
    it('should write file using file:// URL', () => {
      const url = new URL('file:///test/new-file.txt');
      fs.writeFileSync(url, 'new content');
      expect(vfs.readFileSync('/test/new-file.txt', 'utf8')).toBe('new content');
    });
  });

  describe('existsSync with URL', () => {
    it('should check existence using file:// URL', () => {
      const existingUrl = new URL('file:///test/file.txt');
      const nonExistingUrl = new URL('file:///test/nonexistent.txt');

      expect(fs.existsSync(existingUrl)).toBe(true);
      expect(fs.existsSync(nonExistingUrl)).toBe(false);
    });
  });

  describe('statSync with URL', () => {
    it('should get stats using file:// URL', () => {
      const url = new URL('file:///test/file.txt');
      const stats = fs.statSync(url);

      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
    });

    it('should get directory stats using file:// URL', () => {
      const url = new URL('file:///test');
      const stats = fs.statSync(url);

      expect(stats.isFile()).toBe(false);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('readdirSync with URL', () => {
    it('should read directory using file:// URL', () => {
      const url = new URL('file:///test');
      const files = fs.readdirSync(url);

      expect(files).toContain('file.txt');
      expect(files).toContain('data.json');
    });
  });

  describe('unlinkSync with URL', () => {
    it('should delete file using file:// URL', () => {
      const url = new URL('file:///test/file.txt');
      expect(fs.existsSync(url)).toBe(true);

      fs.unlinkSync(url);
      expect(fs.existsSync(url)).toBe(false);
    });
  });

  describe('mkdirSync with URL', () => {
    it('should create directory using file:// URL', () => {
      const url = new URL('file:///test/newdir');
      fs.mkdirSync(url);

      expect(vfs.existsSync('/test/newdir')).toBe(true);
      expect(vfs.statSync('/test/newdir').isDirectory()).toBe(true);
    });
  });

  describe('copyFileSync with URL', () => {
    it('should copy file using file:// URLs', () => {
      const srcUrl = new URL('file:///test/file.txt');
      const destUrl = new URL('file:///test/file-copy.txt');

      fs.copyFileSync(srcUrl, destUrl);

      expect(vfs.readFileSync('/test/file-copy.txt', 'utf8')).toBe('hello world');
    });
  });

  describe('renameSync with URL', () => {
    it('should rename file using file:// URLs', () => {
      const oldUrl = new URL('file:///test/file.txt');
      const newUrl = new URL('file:///test/renamed.txt');

      fs.renameSync(oldUrl, newUrl);

      expect(vfs.existsSync('/test/file.txt')).toBe(false);
      expect(vfs.existsSync('/test/renamed.txt')).toBe(true);
      expect(vfs.readFileSync('/test/renamed.txt', 'utf8')).toBe('hello world');
    });
  });

  describe('promises API with URL', () => {
    it('should read file using file:// URL via promises', async () => {
      const url = new URL('file:///test/file.txt');
      const content = await fs.promises.readFile(url, 'utf8');
      expect(content).toBe('hello world');
    });

    it('should write file using file:// URL via promises', async () => {
      const url = new URL('file:///test/promise-file.txt');
      await fs.promises.writeFile(url, 'promise content');
      expect(vfs.readFileSync('/test/promise-file.txt', 'utf8')).toBe('promise content');
    });

    it('should stat file using file:// URL via promises', async () => {
      const url = new URL('file:///test/file.txt');
      const stats = await fs.promises.stat(url);
      expect(stats.isFile()).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw on non-file:// protocol', () => {
      const url = new URL('https://example.com/file.txt');
      expect(() => fs.readFileSync(url, 'utf8')).toThrow('Unsupported URL protocol');
    });

    it('should handle string paths normally', () => {
      const content = fs.readFileSync('/test/file.txt', 'utf8');
      expect(content).toBe('hello world');
    });
  });
});
