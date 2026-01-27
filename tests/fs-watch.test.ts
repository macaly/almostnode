/**
 * Tests for fs.watch functionality in VirtualFS
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import { createFsShim } from '../src/shims/fs';

describe('VirtualFS fs.watch', () => {
  let vfs: VirtualFS;

  beforeEach(() => {
    vfs = new VirtualFS();
    vfs.mkdirSync('/test', { recursive: true });
  });

  describe('watch()', () => {
    it('should notify on file write (change)', async () => {
      // Create initial file
      vfs.writeFileSync('/test/file.txt', 'initial');

      const events: { eventType: string; filename: string | null }[] = [];

      const watcher = vfs.watch('/test/file.txt', (eventType, filename) => {
        events.push({ eventType, filename });
      });

      // Modify file
      vfs.writeFileSync('/test/file.txt', 'updated');

      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('change');
      expect(events[0].filename).toBe('file.txt');

      watcher.close();
    });

    it('should notify on file creation (rename)', async () => {
      const events: { eventType: string; filename: string | null }[] = [];

      // Watch parent directory
      const watcher = vfs.watch('/test', { recursive: true }, (eventType, filename) => {
        events.push({ eventType, filename });
      });

      // Create new file
      vfs.writeFileSync('/test/newfile.txt', 'content');

      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('rename');
      expect(events[0].filename).toBe('newfile.txt');

      watcher.close();
    });

    it('should notify on file deletion (rename)', async () => {
      vfs.writeFileSync('/test/file.txt', 'content');

      const events: { eventType: string; filename: string | null }[] = [];

      const watcher = vfs.watch('/test', { recursive: true }, (eventType, filename) => {
        events.push({ eventType, filename });
      });

      // Delete file
      vfs.unlinkSync('/test/file.txt');

      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('rename');
      expect(events[0].filename).toBe('file.txt');

      watcher.close();
    });

    it('should notify on file rename', async () => {
      vfs.writeFileSync('/test/old.txt', 'content');

      const events: { eventType: string; filename: string | null }[] = [];

      const watcher = vfs.watch('/test', { recursive: true }, (eventType, filename) => {
        events.push({ eventType, filename });
      });

      // Rename file
      vfs.renameSync('/test/old.txt', '/test/new.txt');

      // Should get two events: one for old file removal, one for new file creation
      expect(events.length).toBe(2);
      expect(events.some(e => e.filename === 'old.txt')).toBe(true);
      expect(events.some(e => e.filename === 'new.txt')).toBe(true);

      watcher.close();
    });

    it('should stop notifying after close()', async () => {
      vfs.writeFileSync('/test/file.txt', 'initial');

      const events: { eventType: string; filename: string | null }[] = [];

      const watcher = vfs.watch('/test/file.txt', (eventType, filename) => {
        events.push({ eventType, filename });
      });

      // Close watcher
      watcher.close();

      // Modify file
      vfs.writeFileSync('/test/file.txt', 'updated');

      // Should not receive event
      expect(events.length).toBe(0);
    });

    it('should support recursive watching', async () => {
      vfs.mkdirSync('/test/subdir', { recursive: true });

      const events: { eventType: string; filename: string | null }[] = [];

      const watcher = vfs.watch('/test', { recursive: true }, (eventType, filename) => {
        events.push({ eventType, filename });
      });

      // Create file in subdirectory
      vfs.writeFileSync('/test/subdir/deep.txt', 'content');

      expect(events.length).toBe(1);
      expect(events[0].filename).toBe('subdir/deep.txt');

      watcher.close();
    });

    it('should support options as second parameter', async () => {
      vfs.writeFileSync('/test/file.txt', 'initial');

      const events: { eventType: string; filename: string | null }[] = [];

      const watcher = vfs.watch('/test/file.txt', { persistent: true }, (eventType, filename) => {
        events.push({ eventType, filename });
      });

      vfs.writeFileSync('/test/file.txt', 'updated');

      expect(events.length).toBe(1);

      watcher.close();
    });

    it('should support listener as second parameter', async () => {
      vfs.writeFileSync('/test/file.txt', 'initial');

      const events: { eventType: string; filename: string | null }[] = [];

      const watcher = vfs.watch('/test/file.txt', (eventType, filename) => {
        events.push({ eventType, filename });
      });

      vfs.writeFileSync('/test/file.txt', 'updated');

      expect(events.length).toBe(1);

      watcher.close();
    });
  });

  describe('fs shim watch()', () => {
    it('should expose watch through fs shim', async () => {
      const fs = createFsShim(vfs);
      vfs.writeFileSync('/test/file.txt', 'initial');

      const events: { eventType: string; filename: string | null }[] = [];

      const watcher = fs.watch('/test/file.txt', (eventType, filename) => {
        events.push({ eventType, filename });
      });

      fs.writeFileSync('/test/file.txt', 'updated');

      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('change');

      watcher.close();
    });
  });
});

describe('VirtualFS extended Stats', () => {
  let vfs: VirtualFS;

  beforeEach(() => {
    vfs = new VirtualFS();
  });

  it('should return full stats object for files', () => {
    vfs.writeFileSync('/file.txt', 'hello world');
    const stats = vfs.statSync('/file.txt');

    expect(stats.isFile()).toBe(true);
    expect(stats.isDirectory()).toBe(false);
    expect(stats.isSymbolicLink()).toBe(false);
    expect(stats.size).toBe(11); // 'hello world'.length
    expect(stats.mode).toBe(0o644);
    expect(stats.mtime).toBeInstanceOf(Date);
    expect(stats.atime).toBeInstanceOf(Date);
    expect(stats.ctime).toBeInstanceOf(Date);
    expect(typeof stats.mtimeMs).toBe('number');
  });

  it('should return full stats object for directories', () => {
    vfs.mkdirSync('/dir');
    const stats = vfs.statSync('/dir');

    expect(stats.isFile()).toBe(false);
    expect(stats.isDirectory()).toBe(true);
    expect(stats.mode).toBe(0o755);
  });

  it('should have lstatSync that works like statSync', () => {
    vfs.writeFileSync('/file.txt', 'content');
    const stats = vfs.lstatSync('/file.txt');

    expect(stats.isFile()).toBe(true);
    expect(stats.isDirectory()).toBe(false);
  });
});

describe('VirtualFS async methods', () => {
  let vfs: VirtualFS;

  beforeEach(() => {
    vfs = new VirtualFS();
  });

  it('should support async readFile', async () => {
    vfs.writeFileSync('/file.txt', 'hello');

    const result = await new Promise<{ err: Error | null; data?: string }>((resolve) => {
      vfs.readFile('/file.txt', { encoding: 'utf8' }, (err, data) => {
        resolve({ err, data: data as string });
      });
    });

    expect(result.err).toBeNull();
    expect(result.data).toBe('hello');
  });

  it('should support async stat', async () => {
    vfs.writeFileSync('/file.txt', 'content');

    const result = await new Promise<{ err: Error | null; stats?: unknown }>((resolve) => {
      vfs.stat('/file.txt', (err, stats) => {
        resolve({ err, stats });
      });
    });

    expect(result.err).toBeNull();
    expect((result.stats as { isFile: () => boolean })?.isFile()).toBe(true);
  });

  it('should support async readdir', async () => {
    vfs.mkdirSync('/dir');
    vfs.writeFileSync('/dir/a.txt', 'a');
    vfs.writeFileSync('/dir/b.txt', 'b');

    const result = await new Promise<{ err: Error | null; files?: string[] }>((resolve) => {
      vfs.readdir('/dir', (err, files) => {
        resolve({ err, files });
      });
    });

    expect(result.err).toBeNull();
    expect(result.files).toContain('a.txt');
    expect(result.files).toContain('b.txt');
  });

  it('should support async realpath', async () => {
    vfs.writeFileSync('/file.txt', 'content');

    const result = await new Promise<{ err: Error | null; resolved?: string }>((resolve) => {
      vfs.realpath('/file.txt', (err, resolved) => {
        resolve({ err, resolved });
      });
    });

    expect(result.err).toBeNull();
    expect(result.resolved).toBe('/file.txt');
  });

  it('should support accessSync', () => {
    vfs.writeFileSync('/file.txt', 'content');
    expect(() => vfs.accessSync('/file.txt')).not.toThrow();
    expect(() => vfs.accessSync('/nonexistent.txt')).toThrow();
  });

  it('should support copyFileSync', () => {
    vfs.writeFileSync('/src.txt', 'content');
    vfs.copyFileSync('/src.txt', '/dest.txt');
    expect(vfs.readFileSync('/dest.txt', 'utf8')).toBe('content');
  });
});
