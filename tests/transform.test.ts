import { describe, it, expect } from 'vitest';

/**
 * Tests for the ESM to CJS transformation
 *
 * Note: The actual esbuild transformation runs in browser only.
 * These tests verify the transform module's interface and behavior.
 */
describe('Transform module', () => {
  describe('isTransformerReady', () => {
    it('should return true in non-browser environment (tests skip esbuild)', async () => {
      const { isTransformerReady } = await import('../src/transform');
      // In Node.js test environment, we skip esbuild entirely
      expect(isTransformerReady()).toBe(true);
    });
  });

  describe('transformFile', () => {
    it('should return code unchanged in non-browser environment', async () => {
      const { transformFile } = await import('../src/transform');
      const code = 'export const foo = 42;';
      const result = await transformFile(code, 'test.js');
      // In Node.js test environment, code is returned as-is
      expect(result).toBe(code);
    });
  });

  describe('transformPackage', () => {
    it('should count files that need transformation', async () => {
      const { transformPackage } = await import('../src/transform');
      const { VirtualFS } = await import('../src/virtual-fs');

      const vfs = new VirtualFS();
      vfs.mkdirSync('/pkg', { recursive: true });
      vfs.writeFileSync('/pkg/index.js', 'export const x = 1;');
      vfs.writeFileSync('/pkg/util.js', 'const y = 2;'); // CJS, no transform needed

      const count = await transformPackage(vfs, '/pkg');
      // Only index.js has ESM syntax and needs transformation
      expect(count).toBe(1);
    });
  });
});

/**
 * The esbuild transformation with platform: 'node' handles:
 * - import.meta.url -> converted to use url module and __filename
 * - ESM exports -> module.exports
 * - ESM imports -> require()
 *
 * Our runtime provides __filename and __dirname, so esbuild's
 * node-style output works correctly.
 */
