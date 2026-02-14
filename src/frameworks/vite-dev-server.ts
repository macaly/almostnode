/**
 * ViteDevServer - Vite-compatible dev server for browser environment
 * Serves files from VirtualFS with JSX/TypeScript transformation
 */

import { DevServer, DevServerOptions, ResponseData, HMRUpdate } from '../dev-server';
import { VirtualFS } from '../virtual-fs';
import { Buffer } from '../shims/stream';
import { simpleHash } from '../utils/hash';
import { addReactRefresh as _addReactRefresh } from './code-transforms';
import { ESBUILD_WASM_ESM_CDN, ESBUILD_WASM_BINARY_CDN, REACT_REFRESH_CDN, REACT_CDN, REACT_DOM_CDN } from '../config/cdn';

// Check if we're in a real browser environment (not jsdom or Node.js)
// jsdom has window but doesn't have ServiceWorker or SharedArrayBuffer
const isBrowser = typeof window !== 'undefined' &&
  typeof window.navigator !== 'undefined' &&
  'serviceWorker' in window.navigator;

// Window.__esbuild type is declared in src/types/external.d.ts

/**
 * Initialize esbuild-wasm for browser transforms
 * Uses window-level singleton to prevent "Cannot call initialize more than once" errors
 */
async function initEsbuild(): Promise<void> {
  if (!isBrowser) return;

  // Check if already initialized (survives HMR)
  if (window.__esbuild) {
    return;
  }

  // Check if initialization is in progress
  if (window.__esbuildInitPromise) {
    return window.__esbuildInitPromise;
  }

  window.__esbuildInitPromise = (async () => {
    try {
      const mod = await import(
        /* @vite-ignore */
        ESBUILD_WASM_ESM_CDN
      );

      const esbuildMod = mod.default || mod;

      try {
        await esbuildMod.initialize({
          wasmURL: ESBUILD_WASM_BINARY_CDN,
        });
        console.log('[ViteDevServer] esbuild-wasm initialized');
      } catch (initError) {
        // If esbuild is already initialized (e.g., from a previous HMR cycle),
        // the WASM is still loaded and the module is usable
        if (initError instanceof Error && initError.message.includes('Cannot call "initialize" more than once')) {
          console.log('[ViteDevServer] esbuild-wasm already initialized, reusing');
        } else {
          throw initError;
        }
      }

      window.__esbuild = esbuildMod;
    } catch (error) {
      console.error('[ViteDevServer] Failed to initialize esbuild:', error);
      window.__esbuildInitPromise = undefined;
      throw error;
    }
  })();

  return window.__esbuildInitPromise;
}

/**
 * Get the esbuild instance (after initialization)
 */
function getEsbuild(): typeof import('esbuild-wasm') | undefined {
  return isBrowser ? window.__esbuild : undefined;
}

export interface ViteDevServerOptions extends DevServerOptions {
  /**
   * Enable JSX transformation (default: true)
   */
  jsx?: boolean;

  /**
   * JSX factory function (default: 'React.createElement')
   */
  jsxFactory?: string;

  /**
   * JSX fragment function (default: 'React.Fragment')
   */
  jsxFragment?: string;

  /**
   * Auto-inject React import for JSX files (default: true)
   */
  jsxAutoImport?: boolean;
}

/**
 * React Refresh preamble - MUST run before React is loaded
 * This script is blocking to ensure injectIntoGlobalHook runs first
 */
const REACT_REFRESH_PREAMBLE = `
<script type="module">
// Block until React Refresh is loaded and initialized
// This MUST happen before React is imported
const RefreshRuntime = await import('${REACT_REFRESH_CDN}').then(m => m.default || m);

// Hook into React BEFORE it's loaded
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshRuntime$ = RefreshRuntime;

// Track registrations for debugging
window.$RefreshRegCount$ = 0;

// Register function called by transformed modules
window.$RefreshReg$ = (type, id) => {
  window.$RefreshRegCount$++;
  RefreshRuntime.register(type, id);
};

// Signature function (simplified - always returns identity)
window.$RefreshSig$ = () => (type) => type;

console.log('[HMR] React Refresh initialized');
</script>
`;

/**
 * HMR client script injected into index.html
 * Implements the import.meta.hot API and handles HMR updates
 */
const HMR_CLIENT_SCRIPT = `
<script type="module">
(function() {
  // Track hot modules and their callbacks
  const hotModules = new Map();
  const pendingUpdates = new Map();

  // Implement import.meta.hot API (Vite-compatible)
  window.__vite_hot_context__ = function createHotContext(ownerPath) {
    // Return existing context if already created
    if (hotModules.has(ownerPath)) {
      return hotModules.get(ownerPath);
    }

    const hot = {
      // Persisted data between updates
      data: {},

      // Accept self-updates
      accept(callback) {
        hot._acceptCallback = callback;
      },

      // Cleanup before update
      dispose(callback) {
        hot._disposeCallback = callback;
      },

      // Force full reload
      invalidate() {
        location.reload();
      },

      // Prune callback (called when module is no longer imported)
      prune(callback) {
        hot._pruneCallback = callback;
      },

      // Event handlers (not implemented)
      on(event, cb) {},
      off(event, cb) {},
      send(event, data) {},

      // Internal callbacks
      _acceptCallback: null,
      _disposeCallback: null,
      _pruneCallback: null,
    };

    hotModules.set(ownerPath, hot);
    return hot;
  };

  // Listen for HMR updates via postMessage (works with sandboxed iframes)
  window.addEventListener('message', async (event) => {
    // Filter for HMR messages only
    if (!event.data || event.data.channel !== 'vite-hmr') return;
    const { type, path, timestamp } = event.data;

    if (type === 'update') {
      console.log('[HMR] Update:', path);

      if (path.endsWith('.css')) {
        // CSS hot reload - update stylesheet href
        const links = document.querySelectorAll('link[rel="stylesheet"]');
        links.forEach(link => {
          const href = link.getAttribute('href');
          if (href && href.includes(path.replace(/^\\//, ''))) {
            link.href = href.split('?')[0] + '?t=' + timestamp;
          }
        });

        // Also update any injected style tags
        const styles = document.querySelectorAll('style[data-vite-dev-id]');
        styles.forEach(style => {
          const id = style.getAttribute('data-vite-dev-id');
          if (id && id.includes(path.replace(/^\\//, ''))) {
            // Re-import the CSS module to get updated styles
            import(path + '?t=' + timestamp).catch(() => {});
          }
        });
      } else if (path.match(/\\.(jsx?|tsx?)$/)) {
        // JS/JSX hot reload with React Refresh
        await handleJSUpdate(path, timestamp);
      }
    } else if (type === 'full-reload') {
      console.log('[HMR] Full reload');
      location.reload();
    }
  });

  // Handle JS/JSX module updates
  async function handleJSUpdate(path, timestamp) {
    // Normalize path to match module keys
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    const hot = hotModules.get(normalizedPath);

    try {
      // Call dispose callback if registered
      if (hot && hot._disposeCallback) {
        hot._disposeCallback(hot.data);
      }

      // Enqueue React Refresh (batches multiple updates)
      if (window.$RefreshRuntime$) {
        pendingUpdates.set(normalizedPath, timestamp);

        // Schedule refresh after a short delay to batch updates
        if (pendingUpdates.size === 1) {
          setTimeout(async () => {
            try {
              // Re-import all pending modules
              for (const [modulePath, ts] of pendingUpdates) {
                const moduleUrl = '.' + modulePath + '?t=' + ts;
                await import(moduleUrl);
              }

              // Perform React Refresh
              window.$RefreshRuntime$.performReactRefresh();
              console.log('[HMR] Updated', pendingUpdates.size, 'module(s)');

              pendingUpdates.clear();
            } catch (error) {
              console.error('[HMR] Failed to apply update:', error);
              pendingUpdates.clear();
              location.reload();
            }
          }, 30);
        }
      } else {
        // No React Refresh available, fall back to page reload
        console.log('[HMR] React Refresh not available, reloading page');
        location.reload();
      }
    } catch (error) {
      console.error('[HMR] Update failed:', error);
      location.reload();
    }
  }

  console.log('[HMR] Client ready with React Refresh support');
})();
</script>
`;

export class ViteDevServer extends DevServer {
  private watcherCleanup: (() => void) | null = null;
  private options: ViteDevServerOptions;
  private hmrTargetWindow: Window | null = null;
  private transformCache: Map<string, { code: string; hash: string }> = new Map();

  constructor(vfs: VirtualFS, options: ViteDevServerOptions) {
    super(vfs, options);
    this.options = {
      jsx: true,
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      jsxAutoImport: true,
      ...options,
    };
  }

  /**
   * Set the target window for HMR updates (typically iframe.contentWindow)
   * This enables HMR to work with sandboxed iframes via postMessage
   */
  setHMRTarget(targetWindow: Window): void {
    this.hmrTargetWindow = targetWindow;
  }

  /**
   * Handle an incoming HTTP request
   */
  async handleRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: Buffer
  ): Promise<ResponseData> {
    // Parse URL
    const urlObj = new URL(url, 'http://localhost');
    let pathname = urlObj.pathname;

    // Handle root path - serve index.html
    if (pathname === '/') {
      pathname = '/index.html';
    }

    // Resolve the full path
    const filePath = this.resolvePath(pathname);

    // Check if file exists
    if (!this.exists(filePath)) {
      // Try with .html extension
      if (this.exists(filePath + '.html')) {
        return this.serveFile(filePath + '.html');
      }
      // Try index.html in directory
      if (this.isDirectory(filePath) && this.exists(filePath + '/index.html')) {
        return this.serveFile(filePath + '/index.html');
      }
      return this.notFound(pathname);
    }

    // If it's a directory, redirect to index.html
    if (this.isDirectory(filePath)) {
      if (this.exists(filePath + '/index.html')) {
        return this.serveFile(filePath + '/index.html');
      }
      return this.notFound(pathname);
    }

    // Check if file needs transformation (JSX/TS)
    if (this.needsTransform(pathname)) {
      return this.transformAndServe(filePath, pathname);
    }

    // Check if CSS is being imported as a module (needs to be converted to JS)
    // In browser context with ES modules, CSS imports need to be served as JS
    if (pathname.endsWith('.css')) {
      // Check various header formats for sec-fetch-dest
      const secFetchDest =
        headers['sec-fetch-dest'] ||
        headers['Sec-Fetch-Dest'] ||
        headers['SEC-FETCH-DEST'] ||
        '';

      // In browser, serve CSS as module when:
      // 1. Requested as a script (sec-fetch-dest: script)
      // 2. Empty dest (sec-fetch-dest: empty) - fetch() calls
      // 3. No sec-fetch-dest but in browser context - assume module import
      const isModuleImport =
        secFetchDest === 'script' ||
        secFetchDest === 'empty' ||
        (isBrowser && secFetchDest === '');

      if (isModuleImport) {
        return this.serveCssAsModule(filePath);
      }
      // Otherwise serve as regular CSS (e.g., <link> tags with sec-fetch-dest: style)
      return this.serveFile(filePath);
    }

    // Check if it's HTML that needs HMR client injection
    if (pathname.endsWith('.html')) {
      return this.serveHtmlWithHMR(filePath);
    }

    // Serve static file
    return this.serveFile(filePath);
  }

  /**
   * Start file watching for HMR
   */
  startWatching(): void {
    // Watch /src directory for changes
    const srcPath = this.root === '/' ? '/src' : `${this.root}/src`;

    try {
      const watcher = this.vfs.watch(srcPath, { recursive: true }, (eventType, filename) => {
        if (eventType === 'change' && filename) {
          const fullPath = filename.startsWith('/') ? filename : `${srcPath}/${filename}`;
          this.handleFileChange(fullPath);
        }
      });

      this.watcherCleanup = () => {
        watcher.close();
      };
    } catch (error) {
      console.warn('[ViteDevServer] Could not watch /src directory:', error);
    }

    // Also watch for CSS files in root
    try {
      const rootWatcher = this.vfs.watch(this.root, { recursive: false }, (eventType, filename) => {
        if (eventType === 'change' && filename && filename.endsWith('.css')) {
          this.handleFileChange(`${this.root}/${filename}`);
        }
      });

      const originalCleanup = this.watcherCleanup;
      this.watcherCleanup = () => {
        originalCleanup?.();
        rootWatcher.close();
      };
    } catch {
      // Ignore if root watching fails
    }
  }

  /**
   * Handle file change event
   */
  private handleFileChange(path: string): void {
    // Determine update type:
    // - CSS and JS/JSX/TSX files: 'update' (handled by HMR client)
    // - Other files: 'full-reload'
    const isCSS = path.endsWith('.css');
    const isJS = /\.(jsx?|tsx?)$/.test(path);
    const updateType = (isCSS || isJS) ? 'update' : 'full-reload';

    const update: HMRUpdate = {
      type: updateType,
      path,
      timestamp: Date.now(),
    };

    // Emit event for ServerBridge
    this.emitHMRUpdate(update);

    // Send HMR update via postMessage (works with sandboxed iframes)
    if (this.hmrTargetWindow) {
      try {
        this.hmrTargetWindow.postMessage({ ...update, channel: 'vite-hmr' }, '*');
      } catch (e) {
        // Window may be closed or unavailable
      }
    }
  }

  /**
   * Stop the server
   */
  stop(): void {
    if (this.watcherCleanup) {
      this.watcherCleanup();
      this.watcherCleanup = null;
    }

    this.hmrTargetWindow = null;

    super.stop();
  }

  /**
   * Check if a file needs transformation
   */
  private needsTransform(path: string): boolean {
    return /\.(jsx|tsx|ts)$/.test(path);
  }

  /**
   * Transform and serve a JSX/TS file
   */
  private async transformAndServe(filePath: string, urlPath: string): Promise<ResponseData> {
    try {
      const content = this.vfs.readFileSync(filePath, 'utf8');
      const hash = simpleHash(content);

      // Check transform cache
      const cached = this.transformCache.get(filePath);
      if (cached && cached.hash === hash) {
        const buffer = Buffer.from(cached.code);
        return {
          statusCode: 200,
          statusMessage: 'OK',
          headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Content-Length': String(buffer.length),
            'Cache-Control': 'no-cache',
            'X-Transformed': 'true',
            'X-Cache': 'hit',
          },
          body: buffer,
        };
      }

      const transformed = await this.transformCode(content, urlPath);

      // Cache the transform result
      this.transformCache.set(filePath, { code: transformed, hash });

      const buffer = Buffer.from(transformed);
      return {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Content-Length': String(buffer.length),
          'Cache-Control': 'no-cache',
          'X-Transformed': 'true',
        },
        body: buffer,
      };
    } catch (error) {
      console.error('[ViteDevServer] Transform error:', error);
      const message = error instanceof Error ? error.message : 'Transform failed';
      const body = `// Transform Error: ${message}\nconsole.error(${JSON.stringify(message)});`;
      return {
        statusCode: 200, // Return 200 with error in code to show in browser console
        statusMessage: 'OK',
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'X-Transform-Error': 'true',
        },
        body: Buffer.from(body),
      };
    }
  }

  /**
   * Transform JSX/TS code to browser-compatible JavaScript
   */
  private async transformCode(code: string, filename: string): Promise<string> {
    if (!isBrowser) {
      // In test environment, just return code as-is
      return code;
    }

    // Initialize esbuild if needed
    await initEsbuild();

    const esbuild = getEsbuild();
    if (!esbuild) {
      throw new Error('esbuild not available');
    }

    // Determine loader based on extension
    let loader: 'js' | 'jsx' | 'ts' | 'tsx' = 'js';
    if (filename.endsWith('.jsx')) loader = 'jsx';
    else if (filename.endsWith('.tsx')) loader = 'tsx';
    else if (filename.endsWith('.ts')) loader = 'ts';

    const result = await esbuild.transform(code, {
      loader,
      format: 'esm', // Keep as ES modules for browser
      target: 'esnext',
      jsx: 'automatic', // Use React 17+ automatic runtime
      jsxImportSource: 'react',
      sourcemap: 'inline',
      sourcefile: filename,
    });

    // Add React Refresh registration for JSX/TSX files
    if (/\.(jsx|tsx)$/.test(filename)) {
      return this.addReactRefresh(result.code, filename);
    }

    return result.code;
  }

  private addReactRefresh(code: string, filename: string): string {
    return _addReactRefresh(code, filename);
  }

  /**
   * Serve CSS file as a JavaScript module that injects styles
   * This is needed because ES module imports of CSS files need to return JS
   */
  private serveCssAsModule(filePath: string): ResponseData {
    try {
      const css = this.vfs.readFileSync(filePath, 'utf8');

      // Create JavaScript that injects the CSS into the document
      const js = `
// CSS Module: ${filePath}
const css = ${JSON.stringify(css)};
const style = document.createElement('style');
style.setAttribute('data-vite-dev-id', ${JSON.stringify(filePath)});
style.textContent = css;
document.head.appendChild(style);
export default css;
`;

      const buffer = Buffer.from(js);
      return {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Content-Length': String(buffer.length),
          'Cache-Control': 'no-cache',
        },
        body: buffer,
      };
    } catch (error) {
      return this.serverError(error);
    }
  }

  /**
   * Serve HTML file with HMR client script injected
   *
   * IMPORTANT: React Refresh preamble MUST be injected before any module scripts.
   * The preamble uses top-level await to block until React Refresh is loaded
   * and injectIntoGlobalHook is called. This ensures React Refresh hooks into
   * React BEFORE React is imported by any module.
   */
  private serveHtmlWithHMR(filePath: string): ResponseData {
    try {
      let content = this.vfs.readFileSync(filePath, 'utf8');

      // Inject a React import map if the HTML doesn't already have one.
      // This lets seed HTML omit the esm.sh boilerplate — the platform provides it.
      if (!content.includes('"importmap"')) {
        const importMap = `<script type="importmap">
{
  "imports": {
    "react": "${REACT_CDN}?dev",
    "react/": "${REACT_CDN}&dev/",
    "react-dom": "${REACT_DOM_CDN}?dev",
    "react-dom/": "${REACT_DOM_CDN}&dev/"
  }
}
</script>`;
        if (content.includes('</head>')) {
          content = content.replace('</head>', `${importMap}\n</head>`);
        } else if (content.includes('<head>')) {
          content = content.replace('<head>', `<head>\n${importMap}`);
        }
      }

      // Inject React Refresh preamble before any app module scripts.
      // Firefox requires all <script type="importmap"> to appear before any <script type="module">,
      // so if the HTML contains an import map, inject AFTER the last one (not right after <head>).
      const importMapRegex = /<script\b[^>]*\btype\s*=\s*["']importmap["'][^>]*>[\s\S]*?<\/script>/gi;
      let lastImportMapEnd = -1;
      let match;
      while ((match = importMapRegex.exec(content)) !== null) {
        lastImportMapEnd = match.index + match[0].length;
      }

      if (lastImportMapEnd !== -1) {
        // Insert preamble right after the last import map </script>
        content = content.slice(0, lastImportMapEnd) + REACT_REFRESH_PREAMBLE + content.slice(lastImportMapEnd);
      } else if (content.includes('<head>')) {
        content = content.replace('<head>', `<head>${REACT_REFRESH_PREAMBLE}`);
      } else if (content.includes('<html')) {
        // If no <head>, inject after <html...>
        content = content.replace(/<html[^>]*>/, `$&${REACT_REFRESH_PREAMBLE}`);
      } else {
        // Prepend if no html tag
        content = REACT_REFRESH_PREAMBLE + content;
      }

      // Inject HMR client script before </head> or </body>
      if (content.includes('</head>')) {
        content = content.replace('</head>', `${HMR_CLIENT_SCRIPT}</head>`);
      } else if (content.includes('</body>')) {
        content = content.replace('</body>', `${HMR_CLIENT_SCRIPT}</body>`);
      } else {
        // Append at the end if no closing tag found
        content += HMR_CLIENT_SCRIPT;
      }

      const buffer = Buffer.from(content);
      return {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': String(buffer.length),
          'Cache-Control': 'no-cache',
        },
        body: buffer,
      };
    } catch (error) {
      return this.serverError(error);
    }
  }
}

export default ViteDevServer;
