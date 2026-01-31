/**
 * Sandbox Helpers - Generate files for deploying a cross-origin sandbox
 *
 * The sandbox runs on a different origin (e.g., myapp-sandbox.vercel.app)
 * to provide browser-enforced isolation from the main application.
 */

/**
 * Get the contents of the service worker file.
 * Returns null if running in browser or file is not found.
 *
 * Note: This function only works in Node.js. In the browser, it returns null.
 */
function getServiceWorkerContent(): string | null {
  // Only works in Node.js - check for presence of require
  if (typeof require === 'undefined') {
    return null;
  }

  try {
    // Dynamic requires to avoid bundling Node.js modules in browser build
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');

    // __dirname equivalent for ESM
    let dirname: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const url = require('url');
      // @ts-ignore - import.meta.url is available in ESM
      dirname = path.dirname(url.fileURLToPath(import.meta.url));
    } catch {
      // Fallback for CommonJS
      dirname = __dirname;
    }

    // Try dist directory first (when running from built package)
    let swPath = path.join(dirname, '__sw__.js');
    if (fs.existsSync(swPath)) {
      return fs.readFileSync(swPath, 'utf-8');
    }
    // Try relative to src (when running from source)
    swPath = path.join(dirname, '../dist/__sw__.js');
    if (fs.existsSync(swPath)) {
      return fs.readFileSync(swPath, 'utf-8');
    }
    return null;
  } catch {
    return null;
  }
}

export interface SandboxHtmlOptions {
  /**
   * URL to load almostnode from (e.g., unpkg, jsdelivr, or your CDN)
   * @default 'https://unpkg.com/almostnode/dist/index.js'
   */
  almostnodeUrl?: string;
  /**
   * Whether to include service worker registration for dev server support.
   * When true, the sandbox can run ViteDevServer/NextDevServer with URL access.
   * @default true
   */
  includeServiceWorker?: boolean;
}

/**
 * HTML template for the sandbox page.
 * This loads almostnode and handles postMessage communication with the parent.
 *
 * @param options - Configuration options or legacy URL string
 */
export function getSandboxHtml(options: SandboxHtmlOptions | string = {}): string {
  // Support legacy string argument
  const opts: SandboxHtmlOptions = typeof options === 'string'
    ? { almostnodeUrl: options }
    : options;

  const almostnodeUrl = opts.almostnodeUrl ?? 'https://unpkg.com/almostnode/dist/index.js';
  const includeServiceWorker = opts.includeServiceWorker ?? true;

  const serviceWorkerScript = includeServiceWorker ? `
  // Register service worker for dev server support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/__sw__.js', { scope: '/' })
      .then(reg => console.log('[Sandbox] Service worker registered'))
      .catch(err => console.warn('[Sandbox] Service worker registration failed:', err));
  }
` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>almostnode Sandbox</title>
</head>
<body>
<script type="module">
  import { VirtualFS, Runtime } from '${almostnodeUrl}';
${serviceWorkerScript}

  let vfs = null;
  let runtime = null;
  let consoleCallback = null;

  // Handle messages from parent
  window.addEventListener('message', async (event) => {
    const { type, id, code, filename, vfsSnapshot, options, path, content } = event.data;

    try {
      switch (type) {
        case 'init':
          // Initialize VFS from snapshot
          vfs = VirtualFS.fromSnapshot(vfsSnapshot);

          // Create runtime with options
          runtime = new Runtime(vfs, {
            cwd: options?.cwd,
            env: options?.env,
            onConsole: (method, args) => {
              // Forward console to parent
              parent.postMessage({
                type: 'console',
                consoleMethod: method,
                consoleArgs: args,
              }, '*');
            },
          });
          break;

        case 'syncFile':
          // Sync file changes from parent
          if (vfs) {
            if (content === null) {
              try { vfs.unlinkSync(path); } catch {}
            } else {
              vfs.writeFileSync(path, content);
            }
          }
          break;

        case 'execute':
          if (!runtime) {
            parent.postMessage({ type: 'error', id, error: 'Runtime not initialized' }, '*');
            return;
          }
          const execResult = runtime.execute(code, filename);
          parent.postMessage({ type: 'result', id, result: execResult }, '*');
          break;

        case 'runFile':
          if (!runtime) {
            parent.postMessage({ type: 'error', id, error: 'Runtime not initialized' }, '*');
            return;
          }
          const runResult = runtime.runFile(filename);
          parent.postMessage({ type: 'result', id, result: runResult }, '*');
          break;

        case 'clearCache':
          if (runtime) {
            runtime.clearCache();
          }
          break;
      }
    } catch (error) {
      if (id) {
        parent.postMessage({
          type: 'error',
          id,
          error: error instanceof Error ? error.message : String(error),
        }, '*');
      }
    }
  });

  // Signal ready to parent
  parent.postMessage({ type: 'ready' }, '*');
</script>
</body>
</html>`;
}

/**
 * Get vercel.json configuration for the sandbox.
 * Sets up CORS headers to allow embedding as a cross-origin iframe.
 */
export function getSandboxVercelConfig(): object {
  return {
    headers: [
      {
        source: '/(.*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        ],
      },
    ],
  };
}

export interface GenerateSandboxFilesOptions extends SandboxHtmlOptions {
  // Inherits almostnodeUrl and includeServiceWorker from SandboxHtmlOptions
}

/**
 * Generate all files needed for deploying a sandbox to Vercel or other platforms.
 *
 * @param options - Configuration options or legacy URL string
 * @returns Object with file names as keys and content as values
 *
 * @example
 * ```typescript
 * import { generateSandboxFiles } from 'almostnode';
 * import fs from 'fs';
 *
 * const files = generateSandboxFiles();
 *
 * // Write files to sandbox/ directory
 * fs.mkdirSync('sandbox', { recursive: true });
 * for (const [filename, content] of Object.entries(files)) {
 *   fs.writeFileSync(`sandbox/${filename}`, content);
 * }
 *
 * // Deploy to Vercel: cd sandbox && vercel --prod
 * ```
 */
export function generateSandboxFiles(options: GenerateSandboxFilesOptions | string = {}): {
  'index.html': string;
  'vercel.json': string;
  '__sw__.js'?: string;
} {
  // Support legacy string argument
  const opts: GenerateSandboxFilesOptions = typeof options === 'string'
    ? { almostnodeUrl: options }
    : options;

  const includeServiceWorker = opts.includeServiceWorker ?? true;
  const swContent = includeServiceWorker ? getServiceWorkerContent() : null;

  const files: {
    'index.html': string;
    'vercel.json': string;
    '__sw__.js'?: string;
  } = {
    'index.html': getSandboxHtml(opts),
    'vercel.json': JSON.stringify(getSandboxVercelConfig(), null, 2),
  };

  if (swContent) {
    files['__sw__.js'] = swContent;
  }

  return files;
}

/**
 * Instructions for setting up a sandbox on Vercel.
 * Useful for documentation or CLI output.
 */
export const SANDBOX_SETUP_INSTRUCTIONS = `
# Setting up a almostnode Sandbox on Vercel

## 1. Create sandbox directory
   mkdir sandbox

## 2. Generate sandbox files
   Use generateSandboxFiles() or copy the templates manually.

## 3. Deploy to Vercel
   cd sandbox
   vercel --prod

## 4. Use in your app
   const runtime = await createRuntime(vfs, {
     sandbox: 'https://your-sandbox.vercel.app'
   });

For more details, see: https://github.com/anthropics/almostnode#sandbox-setup
`.trim();
