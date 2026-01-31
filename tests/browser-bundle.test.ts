/**
 * Tests to ensure the browser bundle doesn't import Node.js-only modules
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Browser bundle compatibility', () => {
  const distPath = path.join(__dirname, '../dist');
  const indexMjs = path.join(distPath, 'index.mjs');

  it('should have built index.mjs', () => {
    expect(fs.existsSync(indexMjs)).toBe(true);
  });

  it('should not import Node.js "url" module at top level', () => {
    const content = fs.readFileSync(indexMjs, 'utf-8');

    // Check for top-level imports (first 50 lines typically contain imports)
    const lines = content.split('\n').slice(0, 100);
    const topLevelImports = lines.filter(line =>
      line.startsWith('import') && line.includes('from')
    );

    // None of the top-level imports should be from "url" (the Node.js module)
    const urlImports = topLevelImports.filter(line =>
      line.includes('from "url"') || line.includes("from 'url'")
    );

    expect(urlImports).toEqual([]);
  });

  it('should not import Node.js "fs" module at top level', () => {
    const content = fs.readFileSync(indexMjs, 'utf-8');

    const lines = content.split('\n').slice(0, 100);
    const topLevelImports = lines.filter(line =>
      line.startsWith('import') && line.includes('from')
    );

    const fsImports = topLevelImports.filter(line =>
      line.includes('from "fs"') || line.includes("from 'fs'")
    );

    expect(fsImports).toEqual([]);
  });

  it('should not import Node.js "path" module at top level (should use shim)', () => {
    const content = fs.readFileSync(indexMjs, 'utf-8');

    const lines = content.split('\n').slice(0, 100);
    const topLevelImports = lines.filter(line =>
      line.startsWith('import') && line.includes('from')
    );

    // Should not import from "path" directly - should use the bundled shim
    const pathImports = topLevelImports.filter(line =>
      (line.includes('from "path"') || line.includes("from 'path'")) &&
      !line.includes('shims/path')
    );

    expect(pathImports).toEqual([]);
  });

  it('should contain the browser-compatible fileURLToPath shim', () => {
    const content = fs.readFileSync(indexMjs, 'utf-8');

    // The shim defines its own fileURLToPath function
    expect(content).toContain('function fileURLToPath');
  });

  it('should use dynamic require for Node.js modules in getServiceWorkerContent', () => {
    const content = fs.readFileSync(indexMjs, 'utf-8');

    // The function should check for require before using it
    expect(content).toContain('typeof require');
  });
});
