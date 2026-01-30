import { defineConfig } from 'vite';
import { resolve } from 'path';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

/**
 * Vite config for the sandbox server.
 *
 * The sandbox is meant to be embedded in a cross-origin iframe,
 * so we DON'T set COOP/COEP headers here (unlike the main app).
 */
export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    {
      name: 'browser-shims',
      enforce: 'pre',
      resolveId(source) {
        if (source === 'node:zlib' || source === 'zlib') {
          return resolve(__dirname, 'src/shims/zlib.ts');
        }
        if (source === 'brotli-wasm/pkg.web/brotli_wasm.js') {
          return resolve(__dirname, 'node_modules/brotli-wasm/pkg.web/brotli_wasm.js');
        }
        if (source === 'brotli-wasm/pkg.web/brotli_wasm_bg.wasm?url') {
          return {
            id: resolve(__dirname, 'node_modules/brotli-wasm/pkg.web/brotli_wasm_bg.wasm') + '?url',
            external: false,
          };
        }
        return null;
      },
    },
  ],
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  server: {
    // Headers that allow this page to be embedded in a cross-origin iframe
    // when the parent has Cross-Origin-Embedder-Policy set
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
    fs: {
      allow: [resolve(__dirname, './'), resolve(__dirname, 'node_modules')],
    },
  },
  resolve: {
    alias: {
      'node:zlib': resolve(__dirname, 'src/shims/zlib.ts'),
      'zlib': resolve(__dirname, 'src/shims/zlib.ts'),
      'buffer': 'buffer',
      'process': 'process/browser',
    },
  },
  optimizeDeps: {
    include: ['buffer', 'process', 'pako'],
    exclude: ['brotli-wasm', 'convex'],
    esbuildOptions: { target: 'esnext' },
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  assetsInclude: ['**/*.wasm'],
});
