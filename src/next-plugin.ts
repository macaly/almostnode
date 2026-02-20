/**
 * Next.js Plugin for almostnode
 *
 * Provides utilities for serving the service worker file in Next.js applications.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - import.meta.url is available in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Get the contents of the almostnode service worker file.
 * Use this in a Next.js API route or middleware to serve the service worker.
 *
 * @example
 * ```typescript
 * // app/api/__sw__/route.ts (App Router)
 * import { getServiceWorkerContent } from 'almostnode/next';
 *
 * export async function GET() {
 *   const content = getServiceWorkerContent();
 *   return new Response(content, {
 *     headers: {
 *       'Content-Type': 'application/javascript',
 *       'Cache-Control': 'no-cache',
 *     },
 *   });
 * }
 * ```
 *
 * @example
 * ```typescript
 * // pages/api/__sw__.ts (Pages Router)
 * import { getServiceWorkerContent } from 'almostnode/next';
 * import type { NextApiRequest, NextApiResponse } from 'next';
 *
 * export default function handler(req: NextApiRequest, res: NextApiResponse) {
 *   const content = getServiceWorkerContent();
 *   res.setHeader('Content-Type', 'application/javascript');
 *   res.setHeader('Cache-Control', 'no-cache');
 *   res.send(content);
 * }
 * ```
 */
export function getServiceWorkerContent(): string {
  // The service worker file is in the dist directory relative to this file
  // In src: ../dist/__sw__.js
  // In dist: ./__sw__.js
  let swFilePath = path.join(__dirname, '__sw__.js');

  // If running from src directory during development, look in dist
  if (!fs.existsSync(swFilePath)) {
    swFilePath = path.join(__dirname, '../dist/__sw__.js');
  }

  if (!fs.existsSync(swFilePath)) {
    throw new Error('Service worker file not found. Make sure almostnode is built.');
  }

  return fs.readFileSync(swFilePath, 'utf-8');
}

/**
 * Get the path to the almostnode service worker file.
 * Useful if you want to copy it to your public directory.
 *
 * @example
 * ```javascript
 * // scripts/copy-sw.js
 * const { getServiceWorkerPath } = require('almostnode/next');
 * const fs = require('fs');
 * const path = require('path');
 *
 * const swPath = getServiceWorkerPath();
 * fs.copyFileSync(swPath, path.join(__dirname, '../public/__sw__.js'));
 * ```
 */
export function getServiceWorkerPath(): string {
  let swFilePath = path.join(__dirname, '__sw__.js');

  if (!fs.existsSync(swFilePath)) {
    swFilePath = path.join(__dirname, '../dist/__sw__.js');
  }

  if (!fs.existsSync(swFilePath)) {
    throw new Error('Service worker file not found. Make sure almostnode is built.');
  }

  return swFilePath;
}

/**
 * Get the path to the almostnode runtime worker script.
 *
 * The runtime worker is a Web Worker used by `WorkerRuntime` to execute Node.js
 * code off the main thread. By default, `WorkerRuntime` resolves the worker via
 * `new URL(..., import.meta.url)`, which Vite handles correctly but Turbopack
 * and Webpack cannot — they try to statically resolve the asset at build time
 * and fail when the path is a server-relative `/assets/...` URL.
 *
 * To fix this, serve the worker file yourself and pass its URL as `workerUrl`
 * to `createRuntime()` or `new WorkerRuntime()`.
 *
 * @example Next.js (App Router) — serve the worker from an API route
 * ```typescript
 * // app/api/almostnode-worker/route.ts
 * import { getWorkerContent } from 'almostnode/next';
 *
 * export async function GET() {
 *   return new Response(getWorkerContent(), {
 *     headers: {
 *       'Content-Type': 'application/javascript',
 *       'Cache-Control': 'no-cache',
 *     },
 *   });
 * }
 *
 * // In your client component:
 * const runtime = await createRuntime(vfs, {
 *   dangerouslyAllowSameOrigin: true,
 *   useWorker: true,
 *   workerUrl: '/api/almostnode-worker',
 * });
 * ```
 */
export function getWorkerPath(): string {
  // The worker file is built to dist/assets/runtime-worker.js (stable name, no hash)
  let workerFilePath = path.join(__dirname, 'assets', 'runtime-worker.js');

  if (!fs.existsSync(workerFilePath)) {
    workerFilePath = path.join(__dirname, '../dist/assets/runtime-worker.js');
  }

  if (!fs.existsSync(workerFilePath)) {
    throw new Error(
      'almostnode runtime worker file not found. Make sure almostnode is built (`npm run build:lib`).'
    );
  }

  return workerFilePath;
}

/**
 * Get the contents of the almostnode runtime worker script as a string.
 * Use this in a Next.js API route to serve the worker to the browser.
 *
 * @see {@link getWorkerPath} for usage examples.
 */
export function getWorkerContent(): string {
  return fs.readFileSync(getWorkerPath(), 'utf-8');
}

export default { getServiceWorkerContent, getServiceWorkerPath, getWorkerContent, getWorkerPath };
