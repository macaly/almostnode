import { defineConfig } from 'vite';
import { resolve } from 'path';
import wasm from 'vite-plugin-wasm';


const isTest = process.env.VITEST === 'true';
export default defineConfig({
  base: '/',
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
  worker: {
    format: 'es',
  },
  build: {
    target: 'esnext',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'examples/index': resolve(__dirname, 'examples/index.html'),
        'examples/next-demo': resolve(__dirname, 'examples/next-demo.html'),
        'examples/vite-demo': resolve(__dirname, 'examples/vite-demo.html'),
        'examples/express-demo': resolve(__dirname, 'examples/express-demo.html'),
        'examples/npm-scripts-demo': resolve(__dirname, 'examples/npm-scripts-demo.html'),
        'examples/vitest-demo': resolve(__dirname, 'examples/vitest-demo.html'),
        'examples/demo-convex-app': resolve(__dirname, 'examples/demo-convex-app.html'),
        'examples/demo-vercel-ai-sdk': resolve(__dirname, 'examples/demo-vercel-ai-sdk.html'),
        'docs/index': resolve(__dirname, 'docs/index.html'),
        'docs/core-concepts': resolve(__dirname, 'docs/core-concepts.html'),
        'docs/nextjs-guide': resolve(__dirname, 'docs/nextjs-guide.html'),
        'docs/vite-guide': resolve(__dirname, 'docs/vite-guide.html'),
        'docs/security': resolve(__dirname, 'docs/security.html'),
        'docs/api-reference': resolve(__dirname, 'docs/api-reference.html'),
        'docs/tutorial-editor': resolve(__dirname, 'docs/tutorial-editor.html'),
        'examples/editor-tutorial': resolve(__dirname, 'examples/editor-tutorial.html'),
        'examples/agent-workbench': resolve(__dirname, 'examples/agent-workbench.html'),
      },
    },
    outDir: 'dist-site',
  },
  assetsInclude: ['**/*.wasm'],
});
