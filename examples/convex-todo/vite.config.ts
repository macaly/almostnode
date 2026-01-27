import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';

export default defineConfig({
  plugins: [
    // WASM support for brotli-wasm
    wasm(),
    topLevelAwait(),
    // Custom plugin to handle browser-specific module resolution
    {
      name: 'browser-shims',
      enforce: 'pre',
      resolveId(source, importer) {
        // Redirect node:zlib to our zlib shim (needed for just-bash)
        if (source === 'node:zlib' || source === 'zlib') {
          return path.resolve(__dirname, '../../src/shims/zlib.ts');
        }
        // Redirect vfs-adapter (imports types from just-bash)
        if (source.endsWith('/shims/vfs-adapter') || source.endsWith('/shims/vfs-adapter.ts')) {
          return path.resolve(__dirname, 'src/stubs/vfs-adapter.ts');
        }
        // Resolve brotli-wasm internal imports to absolute paths
        if (source === 'brotli-wasm/pkg.web/brotli_wasm.js') {
          return path.resolve(__dirname, '../../node_modules/brotli-wasm/pkg.web/brotli_wasm.js');
        }
        // Handle WASM URL import
        if (source === 'brotli-wasm/pkg.web/brotli_wasm_bg.wasm?url') {
          // Return the resolved path with the ?url suffix
          return {
            id: path.resolve(__dirname, '../../node_modules/brotli-wasm/pkg.web/brotli_wasm_bg.wasm') + '?url',
            external: false,
          };
        }
        return null;
      },
    },
    react(),
  ],
  resolve: {
    alias: {
      '@runtime': path.resolve(__dirname, '../../src'),
      // Provide browser-compatible polyfills
      'buffer': 'buffer',
      'process': 'process/browser',
    },
  },
  define: {
    // Define process.env for browser
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer', 'process', 'pako'],
    // Exclude brotli-wasm from optimization - we load it directly
    exclude: ['convex', 'brotli-wasm'],
    esbuildOptions: {
      // Allow WASM loading
      target: 'esnext',
    },
  },
  assetsInclude: ['**/*.wasm'],
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  server: {
    fs: {
      // Allow serving files from the parent node_modules (for brotli-wasm)
      allow: [
        path.resolve(__dirname, '../../'),
        path.resolve(__dirname, '../../node_modules'),
      ],
    },
  },
});
