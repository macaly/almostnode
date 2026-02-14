import 'dotenv/config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173/examples/vite-demo.html',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'node e2e/cors-proxy-server.mjs',
      url: 'http://localhost:8787',
      reuseExistingServer: !process.env.CI,
      timeout: 10000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
