import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  resolve: {
    alias: {
      // Alias Node.js built-ins to our shims for browser builds
      'node:zlib': resolve(__dirname, 'src/shims/zlib.ts'),
      'zlib': resolve(__dirname, 'src/shims/zlib.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@webcontainer/api'],
  },
});
