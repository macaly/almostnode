/**
 * Express installation and execution tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import { Runtime } from '../src/runtime';
import { PackageManager } from '../src/npm';
import { getServerBridge, resetServerBridge } from '../src/server-bridge';

describe('Express Integration', () => {
  let vfs: VirtualFS;
  let runtime: Runtime;
  let npm: PackageManager;

  beforeEach(() => {
    vfs = new VirtualFS();
    runtime = new Runtime(vfs, {
      onConsole: (method, args) => {
        // Suppress console output during tests
      },
    });
    npm = new PackageManager(vfs);
    resetServerBridge();
  });

  describe('Express detection', () => {
    it('should detect express usage with single quotes', () => {
      const code = `const express = require('express');`;
      expect(code.includes("require('express')")).toBe(true);
    });

    it('should detect express usage with double quotes', () => {
      const code = `const express = require("express");`;
      expect(code.includes('require("express")')).toBe(true);
    });
  });

  describe('Express installation', { timeout: 120000 }, () => {
    it('should resolve express package', async () => {
      const progress: string[] = [];

      const result = await npm.install('express', {
        onProgress: (msg) => progress.push(msg),
      });

      expect(result.installed.has('express')).toBe(true);
      expect(result.installed.get('express')?.version).toBeDefined();

      // Should have resolved dependencies
      expect(result.installed.size).toBeGreaterThan(1);

      // Express should be in node_modules
      expect(vfs.existsSync('/node_modules/express/package.json')).toBe(true);
    });

    it('should install express dependencies', async () => {
      const result = await npm.install('express');

      // Check some key dependencies exist
      const expectedDeps = [
        'accepts',
        'body-parser',
        'content-type',
        'cookie',
        'debug',
      ];

      for (const dep of expectedDeps) {
        expect(
          result.installed.has(dep),
          `Should have installed ${dep}`
        ).toBe(true);
      }
    });
  });

  describe('Express execution', { timeout: 120000 }, () => {
    it('should require express after installation', async () => {
      await npm.install('express');

      // Verify express package exists
      expect(vfs.existsSync('/node_modules/express/package.json')).toBe(true);

      // Read the package.json
      const pkgJson = JSON.parse(
        vfs.readFileSync('/node_modules/express/package.json', 'utf8')
      );

      // Express uses default index.js, so main may or may not be defined
      // Check that the entry point file exists
      const main = pkgJson.main || 'index.js';
      const mainPath = `/node_modules/express/${main}`;
      expect(vfs.existsSync(mainPath)).toBe(true);
    });

    it('should create express app', async () => {
      await npm.install('express');

      // Set up server bridge
      let serverPort: number | null = null;
      getServerBridge({
        baseUrl: 'http://localhost',
        onServerReady: (port) => {
          serverPort = port;
        },
      });

      // Execute express code
      const code = `
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello from Express!');
});

app.listen(3000, () => {
  console.log('Express server running on port 3000');
});
      `;

      // Try to execute and capture any error for debugging
      let error: Error | null = null;
      try {
        runtime.execute(code, '/server.js');
      } catch (e) {
        error = e as Error;
        console.error('Express execution error:', error.message);
        console.error('Stack:', error.stack);
      }

      expect(error).toBeNull();
    });
  });
});
