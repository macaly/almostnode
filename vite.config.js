import { defineConfig } from 'vite';
import { resolve } from 'path';

const isTest = process.env.VITEST === 'true';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  resolve: {
    alias: isTest ? {} : {
      // Alias Node.js built-ins to our shims for browser builds
      // These aliases are only applied during browser builds, not during testing
      'node:zlib': resolve(__dirname, 'src/shims/zlib.ts'),
      'zlib': resolve(__dirname, 'src/shims/zlib.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@webcontainer/api'],
  },
});
