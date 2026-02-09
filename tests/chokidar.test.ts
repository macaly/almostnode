/**
 * Tests for chokidar shim
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import * as chokidar from '../src/shims/chokidar';

describe('chokidar shim', () => {
  let vfs: VirtualFS;

  beforeEach(() => {
    vfs = new VirtualFS();
    chokidar.setVFS(vfs);
    vfs.mkdirSync('/test', { recursive: true });
  });

  describe('watch()', () => {
    it('should create a watcher', () => {
      const watcher = chokidar.watch('/test');
      expect(watcher).toBeDefined();
      expect(watcher.close).toBeDefined();
      watcher.close();
    });

    it('should emit ready event', async () => {
      const watcher = chokidar.watch('/test');

      const readyPromise = new Promise<void>((resolve) => {
        watcher.on('ready', () => {
          resolve();
        });
      });

      await readyPromise;
      watcher.close();
    });

    it('should emit add events for existing files when ignoreInitial is false', async () => {
      vfs.writeFileSync('/test/existing.txt', 'content');

      const addedFiles: string[] = [];

      // Set up listener before watching
      const watcher = chokidar.watch('/test', { ignoreInitial: false });
      watcher.on('add', (path: unknown) => {
        addedFiles.push(path as string);
      });

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher.on('ready', () => resolve());
      });

      // The path should be the full normalized path
      expect(addedFiles.some(f => f.includes('existing.txt'))).toBe(true);
      watcher.close();
    });

    it('should not emit add events for existing files when ignoreInitial is true', async () => {
      vfs.writeFileSync('/test/existing.txt', 'content');

      const addedFiles: string[] = [];
      const watcher = chokidar.watch('/test', { ignoreInitial: true });

      watcher.on('add', (path: unknown) => {
        addedFiles.push(path as string);
      });

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher.on('ready', () => resolve());
      });

      expect(addedFiles).not.toContain('/test/existing.txt');
      watcher.close();
    });

    it('should emit change events on file modification', async () => {
      vfs.writeFileSync('/test/file.txt', 'initial');

      const changedFiles: string[] = [];
      const watcher = chokidar.watch('/test', { ignoreInitial: true });

      watcher.on('change', (path: unknown) => {
        changedFiles.push(path as string);
      });

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher.on('ready', () => resolve());
      });

      // Modify file
      vfs.writeFileSync('/test/file.txt', 'updated');

      expect(changedFiles).toContain('/test/file.txt');
      watcher.close();
    });

    it('should emit add events on file creation', async () => {
      const addedFiles: string[] = [];
      const watcher = chokidar.watch('/test', { ignoreInitial: true });

      watcher.on('add', (path: unknown) => {
        addedFiles.push(path as string);
      });

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher.on('ready', () => resolve());
      });

      // Create new file
      vfs.writeFileSync('/test/newfile.txt', 'content');

      expect(addedFiles).toContain('/test/newfile.txt');
      watcher.close();
    });

    it('should emit unlink events on file deletion', async () => {
      vfs.writeFileSync('/test/file.txt', 'content');

      const unlinkedFiles: string[] = [];
      const watcher = chokidar.watch('/test', { ignoreInitial: true });

      watcher.on('unlink', (path: unknown) => {
        unlinkedFiles.push(path as string);
      });

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher.on('ready', () => resolve());
      });

      // Delete file
      vfs.unlinkSync('/test/file.txt');

      expect(unlinkedFiles).toContain('/test/file.txt');
      watcher.close();
    });

    it('should support add() to watch additional paths', async () => {
      vfs.mkdirSync('/other', { recursive: true });

      const addedFiles: string[] = [];
      const watcher = chokidar.watch('/test', { ignoreInitial: true });

      watcher.on('add', (path: unknown) => {
        addedFiles.push(path as string);
      });

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher.on('ready', () => resolve());
      });

      // Add another path
      watcher.add('/other');

      // Create file in new path
      vfs.writeFileSync('/other/file.txt', 'content');

      expect(addedFiles).toContain('/other/file.txt');
      watcher.close();
    });

    it('should support unwatch() to stop watching paths', async () => {
      const changedFiles: string[] = [];
      const watcher = chokidar.watch('/test', { ignoreInitial: true });

      watcher.on('change', (path: unknown) => {
        changedFiles.push(path as string);
      });

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher.on('ready', () => resolve());
      });

      vfs.writeFileSync('/test/file.txt', 'initial');

      // Unwatch the path
      watcher.unwatch('/test');

      // Modify file - should not trigger event
      changedFiles.length = 0;
      vfs.writeFileSync('/test/file.txt', 'updated');

      // Give time for potential event (should not happen)
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(changedFiles).not.toContain('/test/file.txt');
      watcher.close();
    });

    it('should support ignored option with string', async () => {
      vfs.writeFileSync('/test/file.txt', 'content');
      vfs.writeFileSync('/test/ignored.txt', 'content');

      const addedFiles: string[] = [];
      const watcher = chokidar.watch('/test', {
        ignoreInitial: false,
        ignored: '/test/ignored.txt',
      });

      watcher.on('add', (path: unknown) => {
        addedFiles.push(path as string);
      });

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher.on('ready', () => resolve());
      });

      // Should have file.txt but not ignored.txt
      expect(addedFiles.some(f => f.includes('file.txt'))).toBe(true);
      expect(addedFiles.some(f => f.includes('ignored.txt'))).toBe(false);
      watcher.close();
    });

    it('should support ignored option with regex', async () => {
      vfs.writeFileSync('/test/file.txt', 'content');
      vfs.writeFileSync('/test/file.log', 'content');

      const addedFiles: string[] = [];
      const watcher = chokidar.watch('/test', {
        ignoreInitial: false,
        ignored: /\.log$/,
      });

      watcher.on('add', (path: unknown) => {
        addedFiles.push(path as string);
      });

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher.on('ready', () => resolve());
      });

      // Should have file.txt but not file.log
      expect(addedFiles.some(f => f.includes('file.txt'))).toBe(true);
      expect(addedFiles.some(f => f.includes('file.log'))).toBe(false);
      watcher.close();
    });

    it('should return watched paths from getWatched()', async () => {
      const watcher = chokidar.watch('/test');

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher.on('ready', () => resolve());
      });

      const watched = watcher.getWatched();
      expect(watched).toBeDefined();
      watcher.close();
    });

    it('should emit close event when closed', async () => {
      const watcher = chokidar.watch('/test');

      let closeCalled = false;
      watcher.on('close', () => {
        closeCalled = true;
      });

      await watcher.close();

      expect(closeCalled).toBe(true);
    });
  });

  describe('FSWatcher class', () => {
    it('should be exported', () => {
      expect(chokidar.FSWatcher).toBeDefined();
    });

    it('should be constructible with options', () => {
      const watcher = new chokidar.FSWatcher({ ignoreInitial: true });
      expect(watcher).toBeDefined();
      watcher.close();
    });
  });
});
