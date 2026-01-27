/**
 * Integration tests for ESM to CJS transformation
 * Uses Node's esbuild to test the same transformation logic as the browser
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as esbuild from 'esbuild';
import { VirtualFS } from '../src/virtual-fs';
import { Runtime } from '../src/runtime';

/**
 * Transform ESM code to CJS using the same options as our browser transform
 */
async function transformCode(code: string): Promise<string> {
  const result = await esbuild.transform(code, {
    loader: 'js',
    format: 'cjs',
    target: 'esnext',
    platform: 'neutral',
    define: {
      'import.meta.url': 'import_meta.url',
      'import.meta.dirname': 'import_meta.dirname',
      'import.meta.filename': 'import_meta.filename',
      'import.meta': 'import_meta',
    },
  });
  return result.code;
}

describe('ESM to CJS transformation', () => {
  let vfs: VirtualFS;
  let runtime: Runtime;

  beforeEach(() => {
    vfs = new VirtualFS();
    runtime = new Runtime(vfs);
  });

  describe('import.meta.url handling', () => {
    it('should transform import.meta.url to import_meta.url', async () => {
      const esm = `export const url = import.meta.url;`;
      const cjs = await transformCode(esm);

      expect(cjs).toContain('import_meta.url');
      expect(cjs).not.toContain('import.meta.url');
    });

    it('should work with new URL(path, import.meta.url)', async () => {
      const esm = `export const pkgUrl = new URL('../package.json', import.meta.url);`;
      const cjs = await transformCode(esm);

      expect(cjs).toContain('import_meta.url');
    });

    it('should execute transformed code with import_meta provided', async () => {
      const esm = `export const url = import.meta.url;`;
      const cjs = await transformCode(esm);

      vfs.writeFileSync('/test.js', cjs);
      const { exports } = runtime.runFile('/test.js');
      const result = exports as { url: string };

      expect(result.url).toBe('file:///test.js');
    });
  });

  describe('ESM exports transformation', () => {
    it('should transform named exports', async () => {
      const esm = `export const foo = 42;`;
      const cjs = await transformCode(esm);

      vfs.writeFileSync('/test.js', cjs);
      const { exports } = runtime.runFile('/test.js');
      const result = exports as { foo: number };

      expect(result.foo).toBe(42);
    });

    it('should transform default exports', async () => {
      const esm = `export default function hello() { return 'world'; }`;
      const cjs = await transformCode(esm);

      vfs.writeFileSync('/test.js', cjs);
      const { exports } = runtime.runFile('/test.js');
      const result = exports as { default: () => string };

      expect(result.default()).toBe('world');
    });
  });

  describe('ESM imports transformation', () => {
    it('should transform import statements', async () => {
      const depEsm = `export const value = 123;`;
      const mainEsm = `import { value } from './dep.js'; export const result = value * 2;`;

      const depCjs = await transformCode(depEsm);
      const mainCjs = await transformCode(mainEsm);

      vfs.writeFileSync('/dep.js', depCjs);
      vfs.writeFileSync('/main.js', mainCjs);

      const { exports } = runtime.runFile('/main.js');
      const result = exports as { result: number };
      expect(result.result).toBe(246);
    });
  });

  describe('__filename/__dirname handling', () => {
    it('should allow code to declare its own __filename without conflict', async () => {
      // This simulates what Vite's pre-bundled code might do
      const code = `
        var __filename = '/custom/path.js';
        exports.filename = __filename;
      `;

      vfs.writeFileSync('/test.js', code);
      const { exports } = runtime.runFile('/test.js');
      const result = exports as { filename: string };

      // The code's own declaration should work
      expect(result.filename).toBe('/custom/path.js');
    });

    it('should provide __filename when code does not declare it', async () => {
      const code = `exports.filename = __filename;`;

      vfs.writeFileSync('/mymodule.js', code);
      const { exports } = runtime.runFile('/mymodule.js');
      const result = exports as { filename: string };

      expect(result.filename).toBe('/mymodule.js');
    });
  });

  describe('fileURLToPath usage', () => {
    it('should work with url.fileURLToPath', async () => {
      const esm = `
        import { fileURLToPath } from 'url';
        export const path = fileURLToPath(import.meta.url);
      `;
      const cjs = await transformCode(esm);

      vfs.writeFileSync('/test.js', cjs);
      const { exports } = runtime.runFile('/test.js');
      const result = exports as { path: string };

      expect(result.path).toBe('/test.js');
    });

    it('should work with the common __dirname pattern', async () => {
      const esm = `
        import { fileURLToPath } from 'url';
        import { dirname } from 'path';
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        export { __filename, __dirname };
      `;
      const cjs = await transformCode(esm);

      vfs.mkdirSync('/src', { recursive: true });
      vfs.writeFileSync('/src/module.js', cjs);
      const { exports } = runtime.runFile('/src/module.js');
      const result = exports as { __filename: string; __dirname: string };

      expect(result.__filename).toBe('/src/module.js');
      expect(result.__dirname).toBe('/src');
    });
  });
});
