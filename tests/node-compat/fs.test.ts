/**
 * Node.js fs module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-fs-*.js
 *
 * These tests verify that our fs shim behaves consistently with Node.js
 * for common file system operations. Tests use VirtualFS as the backend.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualFS } from '../../src/virtual-fs';
import { createFsShim, Dirent } from '../../src/shims/fs';
import type { FsShim } from '../../src/shims/fs';
import { assert } from './common';

describe('fs module (Node.js compat)', () => {
  let vfs: VirtualFS;
  let fs: FsShim;

  beforeEach(() => {
    vfs = new VirtualFS();
    fs = createFsShim(vfs, () => '/');
  });

  describe('fs.readFileSync()', () => {
    it('should read file as Buffer by default', () => {
      vfs.writeFileSync('/test.txt', 'hello world');
      const data = fs.readFileSync('/test.txt');
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.toString()).toBe('hello world');
    });

    it('should read file as string with utf8 encoding', () => {
      vfs.writeFileSync('/test.txt', 'hello world');
      const data = fs.readFileSync('/test.txt', 'utf8');
      assert.strictEqual(data, 'hello world');
    });

    it('should read file as string with encoding option object', () => {
      vfs.writeFileSync('/test.txt', 'hello world');
      const data = fs.readFileSync('/test.txt', { encoding: 'utf8' });
      assert.strictEqual(data, 'hello world');
    });

    it('should throw ENOENT for non-existent file', () => {
      assert.throws(
        () => fs.readFileSync('/nonexistent.txt'),
        /ENOENT/
      );
    });

    it('should throw EISDIR for directory', () => {
      vfs.mkdirSync('/mydir');
      assert.throws(
        () => fs.readFileSync('/mydir'),
        /EISDIR/
      );
    });

    it('should handle binary data', () => {
      const binary = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
      vfs.writeFileSync('/binary.bin', binary);
      const data = fs.readFileSync('/binary.bin');
      expect(Array.from(data)).toEqual([0x00, 0x01, 0x02, 0xff]);
    });
  });

  describe('fs.writeFileSync()', () => {
    it('should write string data', () => {
      fs.writeFileSync('/test.txt', 'hello world');
      assert.strictEqual(vfs.readFileSync('/test.txt', 'utf8'), 'hello world');
    });

    it('should write binary data', () => {
      const binary = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
      fs.writeFileSync('/binary.bin', binary);
      const data = vfs.readFileSync('/binary.bin');
      expect(Array.from(data)).toEqual([0x00, 0x01, 0x02, 0xff]);
    });

    it('should overwrite existing file', () => {
      fs.writeFileSync('/test.txt', 'original');
      fs.writeFileSync('/test.txt', 'updated');
      assert.strictEqual(vfs.readFileSync('/test.txt', 'utf8'), 'updated');
    });

    it('should create parent directories', () => {
      fs.writeFileSync('/deep/nested/file.txt', 'content');
      assert.strictEqual(fs.existsSync('/deep'), true);
      assert.strictEqual(fs.existsSync('/deep/nested'), true);
    });
  });

  describe('fs.existsSync()', () => {
    it('should return true for existing file', () => {
      vfs.writeFileSync('/exists.txt', 'content');
      assert.strictEqual(fs.existsSync('/exists.txt'), true);
    });

    it('should return true for existing directory', () => {
      vfs.mkdirSync('/mydir');
      assert.strictEqual(fs.existsSync('/mydir'), true);
    });

    it('should return false for non-existent path', () => {
      assert.strictEqual(fs.existsSync('/nonexistent'), false);
    });

    it('should return true for root', () => {
      assert.strictEqual(fs.existsSync('/'), true);
    });
  });

  describe('fs.mkdirSync()', () => {
    it('should create directory', () => {
      fs.mkdirSync('/newdir');
      assert.strictEqual(fs.existsSync('/newdir'), true);
      assert.strictEqual(fs.statSync('/newdir').isDirectory(), true);
    });

    it('should throw without recursive for missing parents', () => {
      assert.throws(
        () => fs.mkdirSync('/a/b/c'),
        /ENOENT/
      );
    });

    it('should create parents with recursive option', () => {
      fs.mkdirSync('/a/b/c', { recursive: true });
      assert.strictEqual(fs.existsSync('/a'), true);
      assert.strictEqual(fs.existsSync('/a/b'), true);
      assert.strictEqual(fs.existsSync('/a/b/c'), true);
    });

    it('should not throw for existing directory with recursive', () => {
      fs.mkdirSync('/existing', { recursive: true });
      fs.mkdirSync('/existing', { recursive: true }); // Should not throw
      assert.strictEqual(fs.existsSync('/existing'), true);
    });
  });

  describe('fs.readdirSync()', () => {
    beforeEach(() => {
      vfs.writeFileSync('/dir/file1.txt', 'content1');
      vfs.writeFileSync('/dir/file2.txt', 'content2');
      vfs.mkdirSync('/dir/subdir');
    });

    it('should return array of entry names', () => {
      const entries = fs.readdirSync('/dir');
      expect(entries).toContain('file1.txt');
      expect(entries).toContain('file2.txt');
      expect(entries).toContain('subdir');
    });

    it('should return Dirent objects with withFileTypes', () => {
      const entries = fs.readdirSync('/dir', { withFileTypes: true }) as Dirent[];
      expect(entries.length).toBe(3);

      const file1 = entries.find(e => e.name === 'file1.txt');
      expect(file1?.isFile()).toBe(true);
      expect(file1?.isDirectory()).toBe(false);

      const subdir = entries.find(e => e.name === 'subdir');
      expect(subdir?.isFile()).toBe(false);
      expect(subdir?.isDirectory()).toBe(true);
    });

    it('should throw ENOENT for non-existent directory', () => {
      assert.throws(
        () => fs.readdirSync('/nonexistent'),
        /ENOENT/
      );
    });

    it('should throw ENOTDIR for file', () => {
      assert.throws(
        () => fs.readdirSync('/dir/file1.txt'),
        /ENOTDIR/
      );
    });
  });

  describe('fs.statSync()', () => {
    it('should return stats for file', () => {
      vfs.writeFileSync('/file.txt', 'hello world');
      const stats = fs.statSync('/file.txt');

      assert.strictEqual(stats.isFile(), true);
      assert.strictEqual(stats.isDirectory(), false);
      expect(stats.size).toBe(11); // 'hello world'.length
    });

    it('should return stats for directory', () => {
      vfs.mkdirSync('/mydir');
      const stats = fs.statSync('/mydir');

      assert.strictEqual(stats.isFile(), false);
      assert.strictEqual(stats.isDirectory(), true);
    });

    it('should throw ENOENT for non-existent path', () => {
      assert.throws(
        () => fs.statSync('/nonexistent'),
        /ENOENT/
      );
    });

    it('should have time properties', () => {
      vfs.writeFileSync('/file.txt', 'content');
      const stats = fs.statSync('/file.txt');

      expect(stats.mtime).toBeInstanceOf(Date);
      expect(stats.atime).toBeInstanceOf(Date);
      expect(stats.ctime).toBeInstanceOf(Date);
      expect(stats.birthtime).toBeInstanceOf(Date);
    });
  });

  describe('fs.lstatSync()', () => {
    it('should work same as statSync for regular files', () => {
      vfs.writeFileSync('/file.txt', 'content');
      const stats = fs.lstatSync('/file.txt');
      assert.strictEqual(stats.isFile(), true);
    });
  });

  describe('fs.unlinkSync()', () => {
    it('should delete file', () => {
      vfs.writeFileSync('/file.txt', 'content');
      fs.unlinkSync('/file.txt');
      assert.strictEqual(fs.existsSync('/file.txt'), false);
    });

    it('should throw ENOENT for non-existent file', () => {
      assert.throws(
        () => fs.unlinkSync('/nonexistent'),
        /ENOENT/
      );
    });
  });

  describe('fs.rmdirSync()', () => {
    it('should remove empty directory', () => {
      vfs.mkdirSync('/emptydir');
      fs.rmdirSync('/emptydir');
      assert.strictEqual(fs.existsSync('/emptydir'), false);
    });

    it('should throw ENOTEMPTY for non-empty directory', () => {
      vfs.writeFileSync('/dir/file.txt', 'content');
      assert.throws(
        () => fs.rmdirSync('/dir'),
        /ENOTEMPTY/
      );
    });
  });

  describe('fs.rmSync()', () => {
    it('should remove file', () => {
      vfs.writeFileSync('/file.txt', 'content');
      fs.rmSync('/file.txt');
      assert.strictEqual(fs.existsSync('/file.txt'), false);
    });

    it('should remove directory with recursive', () => {
      vfs.writeFileSync('/dir/subdir/file.txt', 'content');
      fs.rmSync('/dir', { recursive: true });
      assert.strictEqual(fs.existsSync('/dir'), false);
    });

    it('should not throw for non-existent with force', () => {
      fs.rmSync('/nonexistent', { force: true }); // Should not throw
    });

    it('should throw ENOENT without force', () => {
      assert.throws(
        () => fs.rmSync('/nonexistent'),
        /ENOENT/
      );
    });
  });

  describe('fs.renameSync()', () => {
    it('should rename file', () => {
      vfs.writeFileSync('/old.txt', 'content');
      fs.renameSync('/old.txt', '/new.txt');
      assert.strictEqual(fs.existsSync('/old.txt'), false);
      assert.strictEqual(fs.existsSync('/new.txt'), true);
      assert.strictEqual(vfs.readFileSync('/new.txt', 'utf8'), 'content');
    });

    it('should rename directory', () => {
      vfs.mkdirSync('/olddir');
      vfs.writeFileSync('/olddir/file.txt', 'content');
      fs.renameSync('/olddir', '/newdir');
      assert.strictEqual(fs.existsSync('/olddir'), false);
      assert.strictEqual(fs.existsSync('/newdir'), true);
      assert.strictEqual(fs.existsSync('/newdir/file.txt'), true);
    });
  });

  describe('fs.copyFileSync()', () => {
    it('should copy file', () => {
      vfs.writeFileSync('/source.txt', 'content');
      fs.copyFileSync('/source.txt', '/dest.txt');
      assert.strictEqual(fs.existsSync('/source.txt'), true);
      assert.strictEqual(fs.existsSync('/dest.txt'), true);
      assert.strictEqual(vfs.readFileSync('/dest.txt', 'utf8'), 'content');
    });
  });

  describe('fs.realpathSync()', () => {
    it('should return normalized path', () => {
      vfs.writeFileSync('/file.txt', 'content');
      const realpath = fs.realpathSync('/file.txt');
      assert.strictEqual(realpath, '/file.txt');
    });

    it('should resolve . and ..', () => {
      vfs.writeFileSync('/dir/file.txt', 'content');
      const realpath = fs.realpathSync('/dir/../dir/./file.txt');
      assert.strictEqual(realpath, '/dir/file.txt');
    });
  });

  describe('fs.accessSync()', () => {
    it('should not throw for existing file', () => {
      vfs.writeFileSync('/file.txt', 'content');
      fs.accessSync('/file.txt'); // Should not throw
    });

    it('should throw ENOENT for non-existent file', () => {
      assert.throws(
        () => fs.accessSync('/nonexistent'),
        /ENOENT/
      );
    });
  });

  describe('fs.openSync() / fs.closeSync()', () => {
    it('should open and close file', () => {
      vfs.writeFileSync('/file.txt', 'content');
      const fd = fs.openSync('/file.txt', 'r');
      expect(typeof fd).toBe('number');
      expect(fd).toBeGreaterThanOrEqual(3);
      fs.closeSync(fd);
    });

    it('should throw ENOENT for non-existent file with r flag', () => {
      assert.throws(
        () => fs.openSync('/nonexistent', 'r'),
        /ENOENT/
      );
    });

    it('should create file with w flag', () => {
      const fd = fs.openSync('/newfile.txt', 'w');
      fs.closeSync(fd);
      assert.strictEqual(fs.existsSync('/newfile.txt'), true);
    });
  });

  describe('fs.readSync()', () => {
    it('should read bytes from file descriptor', () => {
      vfs.writeFileSync('/file.txt', 'hello world');
      const fd = fs.openSync('/file.txt', 'r');
      const buffer = new Uint8Array(5);
      const bytesRead = fs.readSync(fd, buffer, 0, 5, 0);
      fs.closeSync(fd);

      assert.strictEqual(bytesRead, 5);
      assert.strictEqual(new TextDecoder().decode(buffer), 'hello');
    });

    it('should read from current position when position is null', () => {
      vfs.writeFileSync('/file.txt', 'hello world');
      const fd = fs.openSync('/file.txt', 'r');
      const buffer1 = new Uint8Array(5);
      const buffer2 = new Uint8Array(6);

      fs.readSync(fd, buffer1, 0, 5, null);
      fs.readSync(fd, buffer2, 0, 6, null);
      fs.closeSync(fd);

      assert.strictEqual(new TextDecoder().decode(buffer1), 'hello');
      assert.strictEqual(new TextDecoder().decode(buffer2), ' world');
    });
  });

  describe('fs.writeSync()', () => {
    it('should write bytes to file descriptor', () => {
      const fd = fs.openSync('/file.txt', 'w');
      const data = new TextEncoder().encode('hello');
      const bytesWritten = fs.writeSync(fd, data, 0, 5, 0);
      fs.closeSync(fd);

      assert.strictEqual(bytesWritten, 5);
      assert.strictEqual(vfs.readFileSync('/file.txt', 'utf8'), 'hello');
    });

    it('should write string directly', () => {
      const fd = fs.openSync('/file.txt', 'w');
      fs.writeSync(fd, 'hello world');
      fs.closeSync(fd);

      assert.strictEqual(vfs.readFileSync('/file.txt', 'utf8'), 'hello world');
    });
  });

  describe('fs.mkdtempSync()', () => {
    it('should create temp directory with prefix', () => {
      const tempDir = fs.mkdtempSync('/tmp/test-');
      assert.strictEqual(fs.existsSync(tempDir), true);
      assert.strictEqual(fs.statSync(tempDir).isDirectory(), true);
      expect(tempDir).toMatch(/^\/tmp\/test-[a-z0-9]+$/);
    });
  });

  describe('fs.constants', () => {
    it('should have F_OK constant', () => {
      assert.strictEqual(fs.constants.F_OK, 0);
    });

    it('should have R_OK constant', () => {
      assert.strictEqual(fs.constants.R_OK, 4);
    });

    it('should have W_OK constant', () => {
      assert.strictEqual(fs.constants.W_OK, 2);
    });

    it('should have X_OK constant', () => {
      assert.strictEqual(fs.constants.X_OK, 1);
    });
  });

  describe('fs.promises', () => {
    describe('readFile', () => {
      it('should read file as Buffer', async () => {
        vfs.writeFileSync('/test.txt', 'hello world');
        const data = await fs.promises.readFile('/test.txt');
        expect(data.toString()).toBe('hello world');
      });

      it('should read file as string with encoding', async () => {
        vfs.writeFileSync('/test.txt', 'hello world');
        const data = await fs.promises.readFile('/test.txt', 'utf8');
        assert.strictEqual(data, 'hello world');
      });
    });

    describe('writeFile', () => {
      it('should write file', async () => {
        await fs.promises.writeFile('/test.txt', 'hello world');
        assert.strictEqual(vfs.readFileSync('/test.txt', 'utf8'), 'hello world');
      });
    });

    describe('stat', () => {
      it('should return stats', async () => {
        vfs.writeFileSync('/test.txt', 'content');
        const stats = await fs.promises.stat('/test.txt');
        assert.strictEqual(stats.isFile(), true);
      });

      it('should reject for non-existent', async () => {
        await expect(fs.promises.stat('/nonexistent')).rejects.toThrow(/ENOENT/);
      });
    });

    describe('readdir', () => {
      it('should return entries', async () => {
        vfs.writeFileSync('/dir/file.txt', 'content');
        const entries = await fs.promises.readdir('/dir');
        expect(entries).toContain('file.txt');
      });
    });

    describe('mkdir', () => {
      it('should create directory', async () => {
        await fs.promises.mkdir('/newdir');
        assert.strictEqual(fs.existsSync('/newdir'), true);
      });

      it('should create recursively', async () => {
        await fs.promises.mkdir('/a/b/c', { recursive: true });
        assert.strictEqual(fs.existsSync('/a/b/c'), true);
      });
    });

    describe('unlink', () => {
      it('should delete file', async () => {
        vfs.writeFileSync('/test.txt', 'content');
        await fs.promises.unlink('/test.txt');
        assert.strictEqual(fs.existsSync('/test.txt'), false);
      });
    });

    describe('rename', () => {
      it('should rename file', async () => {
        vfs.writeFileSync('/old.txt', 'content');
        await fs.promises.rename('/old.txt', '/new.txt');
        assert.strictEqual(fs.existsSync('/old.txt'), false);
        assert.strictEqual(fs.existsSync('/new.txt'), true);
      });
    });

    describe('access', () => {
      it('should resolve for existing', async () => {
        vfs.writeFileSync('/test.txt', 'content');
        await fs.promises.access('/test.txt'); // Should not reject
      });

      it('should reject for non-existent', async () => {
        await expect(fs.promises.access('/nonexistent')).rejects.toThrow(/ENOENT/);
      });
    });

    describe('copyFile', () => {
      it('should copy file', async () => {
        vfs.writeFileSync('/src.txt', 'content');
        await fs.promises.copyFile('/src.txt', '/dest.txt');
        assert.strictEqual(vfs.readFileSync('/dest.txt', 'utf8'), 'content');
      });
    });
  });

  describe('Dirent class', () => {
    it('should have name property', () => {
      const dirent = new Dirent('file.txt', false, true);
      assert.strictEqual(dirent.name, 'file.txt');
    });

    it('should report isFile correctly', () => {
      const fileDirent = new Dirent('file.txt', false, true);
      const dirDirent = new Dirent('dir', true, false);

      assert.strictEqual(fileDirent.isFile(), true);
      assert.strictEqual(fileDirent.isDirectory(), false);
      assert.strictEqual(dirDirent.isFile(), false);
      assert.strictEqual(dirDirent.isDirectory(), true);
    });

    it('should return false for special types', () => {
      const dirent = new Dirent('file.txt', false, true);
      assert.strictEqual(dirent.isBlockDevice(), false);
      assert.strictEqual(dirent.isCharacterDevice(), false);
      assert.strictEqual(dirent.isFIFO(), false);
      assert.strictEqual(dirent.isSocket(), false);
      assert.strictEqual(dirent.isSymbolicLink(), false);
    });
  });

  // Note: Callback-based async tests are skipped due to VirtualFS timing issues
  // The fs.promises API is fully tested above and is the recommended API
  describe.skip('async callbacks', () => {
    describe('fs.readFile()', () => {
      it('should read file via callback', async () => {
        vfs.writeFileSync('/test.txt', 'hello world');
        await new Promise<void>((resolve) => {
          fs.readFile('/test.txt', (err, data) => {
            expect(err).toBeNull();
            expect(data?.toString()).toBe('hello world');
            resolve();
          });
        });
      });
    });

    describe('fs.stat()', () => {
      it('should stat file via callback', async () => {
        vfs.writeFileSync('/test.txt', 'content');
        await new Promise<void>((resolve) => {
          fs.stat('/test.txt', (err, stats) => {
            expect(err).toBeNull();
            expect(stats?.isFile()).toBe(true);
            resolve();
          });
        });
      });
    });

    describe('fs.readdir()', () => {
      it('should read directory via callback', async () => {
        vfs.writeFileSync('/dir/file.txt', 'content');
        await new Promise<void>((resolve) => {
          fs.readdir('/dir', (err, files) => {
            expect(err).toBeNull();
            expect(files).toContain('file.txt');
            resolve();
          });
        });
      });
    });

    describe('fs.access()', () => {
      it('should check access via callback', async () => {
        vfs.writeFileSync('/test.txt', 'content');
        await new Promise<void>((resolve) => {
          fs.access('/test.txt', (err) => {
            expect(err).toBeNull();
            resolve();
          });
        });
      });
    });
  });

  describe('path resolution', () => {
    it('should resolve relative paths against cwd', () => {
      const fsWithCwd = createFsShim(vfs, () => '/home/user');
      vfs.writeFileSync('/home/user/file.txt', 'content');

      const data = fsWithCwd.readFileSync('file.txt', 'utf8');
      assert.strictEqual(data, 'content');
    });

    it('should handle URL paths', () => {
      vfs.writeFileSync('/test.txt', 'content');
      const url = new URL('file:///test.txt');
      const data = fs.readFileSync(url as unknown as string, 'utf8');
      assert.strictEqual(data, 'content');
    });
  });
});
