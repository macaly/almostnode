import { defineConfig } from 'vite';
import { resolve } from 'path';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

const isTest = process.env.VITEST === 'true';

export default defineConfig({
  test: {
    // Exclude e2e tests - they should be run with `npm run test:e2e`
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/examples/**/e2e/**',
    ],
  },
  plugins: isTest ? [] : [
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
  define: isTest ? {} : {
    'process.env': {},
    global: 'globalThis',
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
    fs: {
      allow: [resolve(__dirname, './'), resolve(__dirname, 'node_modules')],
    },
  },
  resolve: {
    alias: isTest ? {} : {
      'node:zlib': resolve(__dirname, 'src/shims/zlib.ts'),
      'zlib': resolve(__dirname, 'src/shims/zlib.ts'),
      'buffer': 'buffer',
      'process': 'process/browser',
    },
  },
  optimizeDeps: {
    include: isTest ? [] : ['buffer', 'process', 'pako'],
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
