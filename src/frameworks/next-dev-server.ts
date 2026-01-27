/**
 * NextDevServer - Next.js-compatible dev server for browser environment
 * Implements file-based routing, API routes, and HMR
 */

import { DevServer, DevServerOptions, ResponseData, HMRUpdate } from '../dev-server';
import { VirtualFS } from '../virtual-fs';
import { Buffer } from '../shims/stream';

// Check if we're in a real browser environment (not jsdom or Node.js)
const isBrowser = typeof window !== 'undefined' &&
  typeof window.navigator !== 'undefined' &&
  'serviceWorker' in window.navigator;

// Type for esbuild module
type EsbuildModule = {
  transform: (code: string, options: unknown) => Promise<{ code: string; map: string }>;
  initialize: (options: unknown) => Promise<void>;
};

// Use window to store esbuild singleton
declare global {
  interface Window {
    __esbuild?: EsbuildModule;
    __esbuildInitPromise?: Promise<void>;
  }
}

/**
 * Initialize esbuild-wasm for browser transforms
 */
async function initEsbuild(): Promise<void> {
  if (!isBrowser) return;

  if (window.__esbuild) {
    return;
  }

  if (window.__esbuildInitPromise) {
    return window.__esbuildInitPromise;
  }

  window.__esbuildInitPromise = (async () => {
    try {
      const mod = await import(
        /* @vite-ignore */
        'https://esm.sh/esbuild-wasm@0.20.0'
      );

      const esbuildMod = mod.default || mod;

      try {
        await esbuildMod.initialize({
          wasmURL: 'https://unpkg.com/esbuild-wasm@0.20.0/esbuild.wasm',
        });
        console.log('[NextDevServer] esbuild-wasm initialized');
      } catch (initError) {
        if (initError instanceof Error && initError.message.includes('Cannot call "initialize" more than once')) {
          console.log('[NextDevServer] esbuild-wasm already initialized, reusing');
        } else {
          throw initError;
        }
      }

      window.__esbuild = esbuildMod;
    } catch (error) {
      console.error('[NextDevServer] Failed to initialize esbuild:', error);
      window.__esbuildInitPromise = undefined;
      throw error;
    }
  })();

  return window.__esbuildInitPromise;
}

function getEsbuild(): EsbuildModule | undefined {
  return isBrowser ? window.__esbuild : undefined;
}

export interface NextDevServerOptions extends DevServerOptions {
  /** Pages directory (default: '/pages') */
  pagesDir?: string;
  /** App directory for App Router (default: '/app') */
  appDir?: string;
  /** Public directory for static assets (default: '/public') */
  publicDir?: string;
  /** Prefer App Router over Pages Router (default: auto-detect) */
  preferAppRouter?: boolean;
}

/**
 * Tailwind CSS CDN script for runtime JIT compilation
 */
const TAILWIND_CDN_SCRIPT = `<script src="https://cdn.tailwindcss.com"></script>`;

/**
 * CORS Proxy script - provides proxyFetch function in the iframe
 * Reads proxy URL from localStorage (set by parent window)
 */
const CORS_PROXY_SCRIPT = `
<script>
  // CORS Proxy support for external API calls
  window.__getCorsProxy = function() {
    return localStorage.getItem('__corsProxyUrl') || null;
  };

  window.__setCorsProxy = function(url) {
    if (url) {
      localStorage.setItem('__corsProxyUrl', url);
    } else {
      localStorage.removeItem('__corsProxyUrl');
    }
  };

  window.__proxyFetch = async function(url, options) {
    const proxyUrl = window.__getCorsProxy();
    if (proxyUrl) {
      const proxiedUrl = proxyUrl + encodeURIComponent(url);
      return fetch(proxiedUrl, options);
    }
    return fetch(url, options);
  };
</script>
`;

/**
 * React Refresh preamble - MUST run before React is loaded
 */
const REACT_REFRESH_PREAMBLE = `
<script type="module">
// Block until React Refresh is loaded and initialized
const RefreshRuntime = await import('https://esm.sh/react-refresh@0.14.0/runtime').then(m => m.default || m);

RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshRuntime$ = RefreshRuntime;
window.$RefreshRegCount$ = 0;

window.$RefreshReg$ = (type, id) => {
  window.$RefreshRegCount$++;
  RefreshRuntime.register(type, id);
};

window.$RefreshSig$ = () => (type) => type;

console.log('[HMR] React Refresh initialized');
</script>
`;

/**
 * HMR client script for Next.js
 */
const HMR_CLIENT_SCRIPT = `
<script type="module">
(function() {
  const hotModules = new Map();
  const pendingUpdates = new Map();

  window.__vite_hot_context__ = function createHotContext(ownerPath) {
    if (hotModules.has(ownerPath)) {
      return hotModules.get(ownerPath);
    }

    const hot = {
      data: {},
      accept(callback) {
        hot._acceptCallback = callback;
      },
      dispose(callback) {
        hot._disposeCallback = callback;
      },
      invalidate() {
        location.reload();
      },
      prune(callback) {
        hot._pruneCallback = callback;
      },
      on(event, cb) {},
      off(event, cb) {},
      send(event, data) {},
      _acceptCallback: null,
      _disposeCallback: null,
      _pruneCallback: null,
    };

    hotModules.set(ownerPath, hot);
    return hot;
  };

  const channel = new BroadcastChannel('next-hmr');

  channel.onmessage = async (event) => {
    const { type, path, timestamp } = event.data;

    if (type === 'update') {
      console.log('[HMR] Update:', path);

      if (path.endsWith('.css')) {
        const links = document.querySelectorAll('link[rel="stylesheet"]');
        links.forEach(link => {
          const href = link.getAttribute('href');
          if (href && href.includes(path.replace(/^\\//, ''))) {
            link.href = href.split('?')[0] + '?t=' + timestamp;
          }
        });

        const styles = document.querySelectorAll('style[data-next-dev-id]');
        styles.forEach(style => {
          const id = style.getAttribute('data-next-dev-id');
          if (id && id.includes(path.replace(/^\\//, ''))) {
            import(path + '?t=' + timestamp).catch(() => {});
          }
        });
      } else if (path.match(/\\.(jsx?|tsx?)$/)) {
        await handleJSUpdate(path, timestamp);
      }
    } else if (type === 'full-reload') {
      console.log('[HMR] Full reload');
      location.reload();
    }
  };

  async function handleJSUpdate(path, timestamp) {
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    const hot = hotModules.get(normalizedPath);

    try {
      if (hot && hot._disposeCallback) {
        hot._disposeCallback(hot.data);
      }

      if (window.$RefreshRuntime$) {
        pendingUpdates.set(normalizedPath, timestamp);

        if (pendingUpdates.size === 1) {
          setTimeout(async () => {
            try {
              for (const [modulePath, ts] of pendingUpdates) {
                const moduleUrl = '.' + modulePath + '?t=' + ts;
                await import(moduleUrl);
              }

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
        console.log('[HMR] React Refresh not available, reloading page');
        location.reload();
      }
    } catch (error) {
      console.error('[HMR] Update failed:', error);
      location.reload();
    }
  }

  console.log('[HMR] Next.js client ready');
})();
</script>
`;

/**
 * Next.js Link shim code
 */
const NEXT_LINK_SHIM = `
import React from 'react';

export default function Link({ href, children, ...props }) {
  const handleClick = (e) => {
    if (props.onClick) {
      props.onClick(e);
    }

    // Allow cmd/ctrl click to open in new tab
    if (e.metaKey || e.ctrlKey) {
      return;
    }

    e.preventDefault();
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return React.createElement('a', { href, onClick: handleClick, ...props }, children);
}

export { Link };
`;

/**
 * Next.js Router shim code
 */
const NEXT_ROUTER_SHIM = `
import React, { useState, useEffect, createContext, useContext } from 'react';

const RouterContext = createContext(null);

export function useRouter() {
  const [pathname, setPathname] = useState(typeof window !== 'undefined' ? window.location.pathname : '/');
  const [query, setQuery] = useState({});

  useEffect(() => {
    const updateRoute = () => {
      setPathname(window.location.pathname);
      setQuery(Object.fromEntries(new URLSearchParams(window.location.search)));
    };

    window.addEventListener('popstate', updateRoute);
    updateRoute();

    return () => window.removeEventListener('popstate', updateRoute);
  }, []);

  return {
    pathname,
    query,
    asPath: pathname + window.location.search,
    push: (url, as, options) => {
      window.history.pushState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return Promise.resolve(true);
    },
    replace: (url, as, options) => {
      window.history.replaceState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return Promise.resolve(true);
    },
    prefetch: () => Promise.resolve(),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    reload: () => window.location.reload(),
    events: {
      on: () => {},
      off: () => {},
      emit: () => {},
    },
    isFallback: false,
    isReady: true,
    isPreview: false,
  };
}

export const Router = {
  events: {
    on: () => {},
    off: () => {},
    emit: () => {},
  },
  push: (url) => {
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
    return Promise.resolve(true);
  },
  replace: (url) => {
    window.history.replaceState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
    return Promise.resolve(true);
  },
};

export default { useRouter, Router };
`;

/**
 * Next.js Navigation shim code (App Router)
 *
 * This shim provides App Router-specific navigation hooks from 'next/navigation'.
 * These are DIFFERENT from the Pages Router hooks in 'next/router':
 *
 * Pages Router (next/router):
 *   - useRouter() returns { pathname, query, push, replace, events, ... }
 *   - Has router.events for route change subscriptions
 *   - query object contains URL params
 *
 * App Router (next/navigation):
 *   - useRouter() returns { push, replace, back, forward, refresh, prefetch }
 *   - usePathname() for current path
 *   - useSearchParams() for URL search params
 *   - useParams() for dynamic route segments
 *   - No events - use useEffect with pathname/searchParams instead
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/use-router
 */
const NEXT_NAVIGATION_SHIM = `
import React, { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * App Router's useRouter hook
 * Returns navigation methods only (no pathname, no query)
 * Use usePathname() and useSearchParams() for URL info
 */
export function useRouter() {
  const push = useCallback((url, options) => {
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  const replace = useCallback((url, options) => {
    window.history.replaceState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  const back = useCallback(() => window.history.back(), []);
  const forward = useCallback(() => window.history.forward(), []);
  const refresh = useCallback(() => window.location.reload(), []);
  const prefetch = useCallback(() => Promise.resolve(), []);

  return useMemo(() => ({
    push,
    replace,
    back,
    forward,
    refresh,
    prefetch,
  }), [push, replace, back, forward, refresh, prefetch]);
}

/**
 * usePathname - Returns the current URL pathname
 * Reactively updates when navigation occurs
 * @example const pathname = usePathname(); // '/dashboard/settings'
 */
export function usePathname() {
  const [pathname, setPathname] = useState(
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  useEffect(() => {
    const handler = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  return pathname;
}

/**
 * useSearchParams - Returns the current URL search parameters
 * @example const searchParams = useSearchParams();
 *          const query = searchParams.get('q'); // '?q=hello' -> 'hello'
 */
export function useSearchParams() {
  const [searchParams, setSearchParams] = useState(() => {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  });

  useEffect(() => {
    const handler = () => {
      setSearchParams(new URLSearchParams(window.location.search));
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  return searchParams;
}

/**
 * useParams - Returns dynamic route parameters
 * For route /users/[id]/page.jsx with URL /users/123:
 * @example const { id } = useParams(); // { id: '123' }
 *
 * NOTE: This simplified implementation returns empty object.
 * Full implementation would need route pattern matching.
 */
export function useParams() {
  // In a real implementation, this would parse the current route
  // against the route pattern to extract params
  // For now, return empty object - works for basic cases
  return {};
}

/**
 * useSelectedLayoutSegment - Returns the active child segment one level below
 * Useful for styling active nav items in layouts
 * @example For /dashboard/settings, returns 'settings' in dashboard layout
 */
export function useSelectedLayoutSegment() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  return segments[0] || null;
}

/**
 * useSelectedLayoutSegments - Returns all active child segments
 * @example For /dashboard/settings/profile, returns ['dashboard', 'settings', 'profile']
 */
export function useSelectedLayoutSegments() {
  const pathname = usePathname();
  return pathname.split('/').filter(Boolean);
}

/**
 * redirect - Programmatic redirect (typically used in Server Components)
 * In this browser implementation, performs immediate navigation
 */
export function redirect(url) {
  window.location.href = url;
}

/**
 * notFound - Trigger the not-found UI
 * In this browser implementation, throws an error
 */
export function notFound() {
  throw new Error('NEXT_NOT_FOUND');
}

// Re-export Link for convenience (can import from next/navigation or next/link)
export { default as Link } from 'next/link';
`;

/**
 * Next.js Head shim code
 */
const NEXT_HEAD_SHIM = `
import React, { useEffect } from 'react';

export default function Head({ children }) {
  useEffect(() => {
    // Process children and update document.head
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;

      const { type, props } = child;

      if (type === 'title' && props.children) {
        document.title = Array.isArray(props.children)
          ? props.children.join('')
          : props.children;
      } else if (type === 'meta') {
        const existingMeta = props.name
          ? document.querySelector(\`meta[name="\${props.name}"]\`)
          : props.property
            ? document.querySelector(\`meta[property="\${props.property}"]\`)
            : null;

        if (existingMeta) {
          Object.keys(props).forEach(key => {
            existingMeta.setAttribute(key, props[key]);
          });
        } else {
          const meta = document.createElement('meta');
          Object.keys(props).forEach(key => {
            meta.setAttribute(key, props[key]);
          });
          document.head.appendChild(meta);
        }
      } else if (type === 'link') {
        const link = document.createElement('link');
        Object.keys(props).forEach(key => {
          link.setAttribute(key, props[key]);
        });
        document.head.appendChild(link);
      }
    });
  }, [children]);

  return null;
}
`;

/**
 * NextDevServer - A lightweight Next.js-compatible development server
 *
 * Supports both routing paradigms:
 *
 * 1. PAGES ROUTER (legacy, /pages directory):
 *    - /pages/index.jsx        -> /
 *    - /pages/about.jsx        -> /about
 *    - /pages/users/[id].jsx   -> /users/:id (dynamic)
 *    - /pages/api/hello.js     -> /api/hello (API route)
 *    - Uses next/router for navigation
 *
 * 2. APP ROUTER (new, /app directory):
 *    - /app/page.jsx           -> /
 *    - /app/about/page.jsx     -> /about
 *    - /app/users/[id]/page.jsx -> /users/:id (dynamic)
 *    - /app/layout.jsx         -> Root layout (wraps all pages)
 *    - /app/about/layout.jsx   -> Nested layout (wraps /about/*)
 *    - Uses next/navigation for navigation
 *
 * The server auto-detects which router to use based on directory existence,
 * preferring App Router if both exist. Can be overridden via options.
 */
export class NextDevServer extends DevServer {
  /** Pages Router directory (default: '/pages') */
  private pagesDir: string;

  /** App Router directory (default: '/app') */
  private appDir: string;

  /** Static assets directory (default: '/public') */
  private publicDir: string;

  /** Whether to use App Router (true) or Pages Router (false) */
  private useAppRouter: boolean;

  /** Cleanup function for file watchers */
  private watcherCleanup: (() => void) | null = null;

  /** BroadcastChannel for HMR updates to iframe */
  private hmrChannel: BroadcastChannel | null = null;

  constructor(vfs: VirtualFS, options: NextDevServerOptions) {
    super(vfs, options);
    this.pagesDir = options.pagesDir || '/pages';
    this.appDir = options.appDir || '/app';
    this.publicDir = options.publicDir || '/public';

    // Auto-detect which router to use based on directory existence
    // User can override with preferAppRouter option
    if (options.preferAppRouter !== undefined) {
      this.useAppRouter = options.preferAppRouter;
    } else {
      // Prefer App Router if /app directory exists with a page.jsx file
      this.useAppRouter = this.hasAppRouter();
    }
  }

  /**
   * Check if App Router is available
   */
  private hasAppRouter(): boolean {
    try {
      // Check if /app directory exists and has a page file
      if (!this.exists(this.appDir)) return false;

      // Check for root page
      const extensions = ['.jsx', '.tsx', '.js', '.ts'];
      for (const ext of extensions) {
        if (this.exists(`${this.appDir}/page${ext}`)) return true;
      }
      return false;
    } catch {
      return false;
    }
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
    const urlObj = new URL(url, 'http://localhost');
    const pathname = urlObj.pathname;

    // Serve Next.js shims
    if (pathname.startsWith('/_next/shims/')) {
      return this.serveNextShim(pathname);
    }

    // Static assets from /_next/static/*
    if (pathname.startsWith('/_next/static/')) {
      return this.serveStaticAsset(pathname);
    }

    // API routes: /api/*
    if (pathname.startsWith('/api/')) {
      return this.handleApiRoute(method, pathname, headers, body);
    }

    // Public directory files
    const publicPath = this.publicDir + pathname;
    if (this.exists(publicPath) && !this.isDirectory(publicPath)) {
      return this.serveFile(publicPath);
    }

    // Direct file requests (e.g., /pages/index.jsx for HMR re-imports)
    if (this.needsTransform(pathname) && this.exists(pathname)) {
      return this.transformAndServe(pathname, pathname);
    }

    // Serve regular files directly if they exist
    if (this.exists(pathname) && !this.isDirectory(pathname)) {
      return this.serveFile(pathname);
    }

    // Page routes: everything else
    return this.handlePageRoute(pathname, urlObj.search);
  }

  /**
   * Serve Next.js shims (link, router, head, navigation)
   */
  private serveNextShim(pathname: string): ResponseData {
    const shimName = pathname.replace('/_next/shims/', '').replace('.js', '');

    let code: string;
    switch (shimName) {
      case 'link':
        code = NEXT_LINK_SHIM;
        break;
      case 'router':
        code = NEXT_ROUTER_SHIM;
        break;
      case 'head':
        code = NEXT_HEAD_SHIM;
        break;
      case 'navigation':
        code = NEXT_NAVIGATION_SHIM;
        break;
      default:
        return this.notFound(pathname);
    }

    const buffer = Buffer.from(code);
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
  }

  /**
   * Serve static assets from /_next/static/
   */
  private serveStaticAsset(pathname: string): ResponseData {
    // Map /_next/static/* to actual file location
    const filePath = pathname.replace('/_next/static/', '/');
    if (this.exists(filePath)) {
      return this.serveFile(filePath);
    }
    return this.notFound(pathname);
  }

  /**
   * Handle API route requests
   */
  private async handleApiRoute(
    method: string,
    pathname: string,
    headers: Record<string, string>,
    body?: Buffer
  ): Promise<ResponseData> {
    // Map /api/hello → /pages/api/hello.js or .ts
    const apiFile = this.resolveApiFile(pathname);

    if (!apiFile) {
      return {
        statusCode: 404,
        statusMessage: 'Not Found',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: Buffer.from(JSON.stringify({ error: 'API route not found' })),
      };
    }

    try {
      // Read and transform the API handler to CJS for eval execution
      const code = this.vfs.readFileSync(apiFile, 'utf8');
      const transformed = await this.transformApiHandler(code, apiFile);

      // Create mock req/res objects
      const req = this.createMockRequest(method, pathname, headers, body);
      const res = this.createMockResponse();

      // Execute the handler
      await this.executeApiHandler(transformed, req, res);

      // Wait for async handlers (like those using https.get with callbacks)
      // with a reasonable timeout
      if (!res.isEnded()) {
        const timeout = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('API handler timeout')), 30000);
        });
        await Promise.race([res.waitForEnd(), timeout]);
      }

      return res.toResponse();
    } catch (error) {
      console.error('[NextDevServer] API error:', error);
      return {
        statusCode: 500,
        statusMessage: 'Internal Server Error',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: Buffer.from(JSON.stringify({
          error: error instanceof Error ? error.message : 'Internal Server Error'
        })),
      };
    }
  }

  /**
   * Resolve API route to file path
   */
  private resolveApiFile(pathname: string): string | null {
    // Remove /api prefix and look in /pages/api
    const apiPath = pathname.replace(/^\/api/, `${this.pagesDir}/api`);

    const extensions = ['.js', '.ts', '.jsx', '.tsx'];

    for (const ext of extensions) {
      const filePath = apiPath + ext;
      if (this.exists(filePath)) {
        return filePath;
      }
    }

    // Try index file
    for (const ext of extensions) {
      const filePath = `${apiPath}/index${ext}`;
      if (this.exists(filePath)) {
        return filePath;
      }
    }

    return null;
  }

  /**
   * Create mock Next.js request object
   */
  private createMockRequest(
    method: string,
    pathname: string,
    headers: Record<string, string>,
    body?: Buffer
  ) {
    const url = new URL(pathname, 'http://localhost');

    return {
      method,
      url: pathname,
      headers,
      query: Object.fromEntries(url.searchParams),
      body: body ? JSON.parse(body.toString()) : undefined,
      cookies: this.parseCookies(headers.cookie || ''),
    };
  }

  /**
   * Parse cookie header
   */
  private parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!cookieHeader) return cookies;

    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookies[name] = decodeURIComponent(value);
      }
    });

    return cookies;
  }

  /**
   * Create mock Next.js response object
   */
  private createMockResponse() {
    let statusCode = 200;
    let statusMessage = 'OK';
    const headers: Record<string, string> = {};
    let responseBody = '';
    let ended = false;
    let resolveEnded: (() => void) | null = null;

    // Promise that resolves when response is ended
    const endedPromise = new Promise<void>((resolve) => {
      resolveEnded = resolve;
    });

    const markEnded = () => {
      if (!ended) {
        ended = true;
        if (resolveEnded) resolveEnded();
      }
    };

    return {
      status(code: number) {
        statusCode = code;
        return this;
      },
      setHeader(name: string, value: string) {
        headers[name] = value;
        return this;
      },
      json(data: unknown) {
        headers['Content-Type'] = 'application/json; charset=utf-8';
        responseBody = JSON.stringify(data);
        markEnded();
        return this;
      },
      send(data: string | object) {
        if (typeof data === 'object') {
          return this.json(data);
        }
        responseBody = data;
        markEnded();
        return this;
      },
      end(data?: string) {
        if (data) responseBody = data;
        markEnded();
        return this;
      },
      redirect(statusOrUrl: number | string, url?: string) {
        if (typeof statusOrUrl === 'number') {
          statusCode = statusOrUrl;
          headers['Location'] = url || '/';
        } else {
          statusCode = 307;
          headers['Location'] = statusOrUrl;
        }
        markEnded();
        return this;
      },
      isEnded() {
        return ended;
      },
      waitForEnd() {
        return endedPromise;
      },
      toResponse(): ResponseData {
        const buffer = Buffer.from(responseBody);
        headers['Content-Length'] = String(buffer.length);
        return {
          statusCode,
          statusMessage,
          headers,
          body: buffer,
        };
      },
    };
  }

  /**
   * Execute API handler code
   */
  private async executeApiHandler(
    code: string,
    req: ReturnType<typeof this.createMockRequest>,
    res: ReturnType<typeof this.createMockResponse>
  ): Promise<void> {
    try {
      // Create a minimal require function for built-in modules
      const builtinModules: Record<string, unknown> = {
        https: await import('../shims/https'),
        http: await import('../shims/http'),
        path: await import('../shims/path'),
        fs: await import('../shims/fs').then(m => m.createFsShim(this.vfs)),
        url: await import('../shims/url'),
        querystring: await import('../shims/querystring'),
        util: await import('../shims/util'),
        events: await import('../shims/events'),
        stream: await import('../shims/stream'),
        buffer: await import('../shims/buffer'),
        crypto: await import('../shims/crypto'),
      };

      const require = (id: string): unknown => {
        // Handle node: prefix
        const modId = id.startsWith('node:') ? id.slice(5) : id;
        if (builtinModules[modId]) {
          return builtinModules[modId];
        }
        throw new Error(`Module not found: ${id}`);
      };

      // Create module context
      const module = { exports: {} as Record<string, unknown> };
      const exports = module.exports;

      // Execute the transformed code
      // The code is already in CJS format from esbuild transform
      const wrappedCode = `
        (function(exports, require, module) {
          ${code}
        })
      `;

      const fn = eval(wrappedCode);
      fn(exports, require, module);

      // Get the handler - check both module.exports and module.exports.default
      let handler = module.exports.default || module.exports;

      // If handler is still an object with a default property, unwrap it
      if (typeof handler === 'object' && handler !== null && 'default' in handler) {
        handler = (handler as Record<string, unknown>).default;
      }

      if (typeof handler !== 'function') {
        throw new Error('No default export handler found');
      }

      // Call the handler - it may be async
      const result = handler(req, res);

      // If the handler returns a promise, wait for it
      if (result instanceof Promise) {
        await result;
      }
    } catch (error) {
      console.error('[NextDevServer] API handler error:', error);
      throw error;
    }
  }

  /**
   * Handle page route requests
   */
  private async handlePageRoute(pathname: string, search: string): Promise<ResponseData> {
    // Use App Router if available
    if (this.useAppRouter) {
      return this.handleAppRouterPage(pathname, search);
    }

    // Resolve pathname to page file (Pages Router)
    const pageFile = this.resolvePageFile(pathname);

    if (!pageFile) {
      // Try to serve 404 page if exists
      const notFoundPage = this.resolvePageFile('/404');
      if (notFoundPage) {
        const html = await this.generatePageHtml(notFoundPage, '/404');
        return {
          statusCode: 404,
          statusMessage: 'Not Found',
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
          body: Buffer.from(html),
        };
      }
      return this.serve404Page();
    }

    // Check if this is a direct request for a page file (e.g., /pages/index.jsx)
    if (this.needsTransform(pathname)) {
      return this.transformAndServe(pageFile, pathname);
    }

    // Generate HTML shell with page component
    const html = await this.generatePageHtml(pageFile, pathname);

    const buffer = Buffer.from(html);
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
  }

  /**
   * Handle App Router page requests
   */
  private async handleAppRouterPage(pathname: string, search: string): Promise<ResponseData> {
    // Resolve the route to page and layouts
    const route = this.resolveAppRoute(pathname);

    if (!route) {
      // Try not-found page
      const notFoundRoute = this.resolveAppRoute('/not-found');
      if (notFoundRoute) {
        const html = await this.generateAppRouterHtml(notFoundRoute, '/not-found');
        return {
          statusCode: 404,
          statusMessage: 'Not Found',
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
          body: Buffer.from(html),
        };
      }
      return this.serve404Page();
    }

    const html = await this.generateAppRouterHtml(route, pathname);

    const buffer = Buffer.from(html);
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
  }

  /**
   * Resolve App Router route to page and layout files
   */
  private resolveAppRoute(pathname: string): { page: string; layouts: string[] } | null {
    const extensions = ['.jsx', '.tsx', '.js', '.ts'];
    const segments = pathname === '/' ? [] : pathname.split('/').filter(Boolean);

    // Build the directory path
    let dirPath = this.appDir;
    const layouts: string[] = [];

    // Collect layouts from root to current directory
    for (const ext of extensions) {
      const rootLayout = `${this.appDir}/layout${ext}`;
      if (this.exists(rootLayout)) {
        layouts.push(rootLayout);
        break;
      }
    }

    // Walk through segments to find page and collect layouts
    for (const segment of segments) {
      dirPath = `${dirPath}/${segment}`;

      // Check for layout in this segment
      for (const ext of extensions) {
        const layoutPath = `${dirPath}/layout${ext}`;
        if (this.exists(layoutPath)) {
          layouts.push(layoutPath);
          break;
        }
      }
    }

    // Find the page file
    for (const ext of extensions) {
      const pagePath = `${dirPath}/page${ext}`;
      if (this.exists(pagePath)) {
        return { page: pagePath, layouts };
      }
    }

    // Try dynamic segments
    return this.resolveAppDynamicRoute(pathname, segments);
  }

  /**
   * Resolve dynamic App Router routes like /app/[id]/page.jsx
   */
  private resolveAppDynamicRoute(
    pathname: string,
    segments: string[]
  ): { page: string; layouts: string[] } | null {
    const extensions = ['.jsx', '.tsx', '.js', '.ts'];

    const tryPath = (
      dirPath: string,
      remainingSegments: string[],
      layouts: string[]
    ): { page: string; layouts: string[] } | null => {
      // Check for layout at current level
      for (const ext of extensions) {
        const layoutPath = `${dirPath}/layout${ext}`;
        if (this.exists(layoutPath) && !layouts.includes(layoutPath)) {
          layouts = [...layouts, layoutPath];
        }
      }

      if (remainingSegments.length === 0) {
        // Look for page file
        for (const ext of extensions) {
          const pagePath = `${dirPath}/page${ext}`;
          if (this.exists(pagePath)) {
            return { page: pagePath, layouts };
          }
        }
        return null;
      }

      const [current, ...rest] = remainingSegments;

      // Try exact match first
      const exactPath = `${dirPath}/${current}`;
      if (this.isDirectory(exactPath)) {
        const result = tryPath(exactPath, rest, layouts);
        if (result) return result;
      }

      // Try dynamic segment [param]
      try {
        const entries = this.vfs.readdirSync(dirPath);
        for (const entry of entries) {
          if (entry.startsWith('[') && entry.endsWith(']') && !entry.includes('.')) {
            const dynamicPath = `${dirPath}/${entry}`;
            if (this.isDirectory(dynamicPath)) {
              const result = tryPath(dynamicPath, rest, layouts);
              if (result) return result;
            }
          }
        }
      } catch {
        // Directory doesn't exist
      }

      return null;
    };

    // Collect root layout
    const layouts: string[] = [];
    for (const ext of extensions) {
      const rootLayout = `${this.appDir}/layout${ext}`;
      if (this.exists(rootLayout)) {
        layouts.push(rootLayout);
        break;
      }
    }

    return tryPath(this.appDir, segments, layouts);
  }

  /**
   * Generate HTML for App Router with nested layouts
   */
  private async generateAppRouterHtml(
    route: { page: string; layouts: string[] },
    pathname: string
  ): Promise<string> {
    // Check for global CSS files
    const globalCssLinks: string[] = [];
    const cssLocations = ['/app/globals.css', '/styles/globals.css', '/styles/global.css'];
    for (const cssPath of cssLocations) {
      if (this.exists(cssPath)) {
        globalCssLinks.push(`<link rel="stylesheet" href=".${cssPath}">`);
      }
    }

    // Build the nested component structure
    // Layouts wrap the page from outside in
    const pageModulePath = '.' + route.page;
    const layoutImports = route.layouts
      .map((layout, i) => `import Layout${i} from '.${layout}';`)
      .join('\n    ');

    // Build nested JSX: Layout0 > Layout1 > ... > Page
    let nestedJsx = 'React.createElement(Page)';
    for (let i = route.layouts.length - 1; i >= 0; i--) {
      nestedJsx = `React.createElement(Layout${i}, null, ${nestedJsx})`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Next.js App</title>
  ${TAILWIND_CDN_SCRIPT}
  ${CORS_PROXY_SCRIPT}
  ${globalCssLinks.join('\n  ')}
  ${REACT_REFRESH_PREAMBLE}
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.2.0?dev",
      "react/": "https://esm.sh/react@18.2.0&dev/",
      "react-dom": "https://esm.sh/react-dom@18.2.0?dev",
      "react-dom/": "https://esm.sh/react-dom@18.2.0&dev/",
      "react-dom/client": "https://esm.sh/react-dom@18.2.0/client?dev",
      "next/link": "./_next/shims/link.js",
      "next/router": "./_next/shims/router.js",
      "next/head": "./_next/shims/head.js",
      "next/navigation": "./_next/shims/navigation.js"
    }
  }
  </script>
  ${HMR_CLIENT_SCRIPT}
</head>
<body>
  <div id="__next"></div>
  <script type="module">
    import React from 'react';
    import ReactDOM from 'react-dom/client';
    import Page from '${pageModulePath}';
    ${layoutImports}

    function App() {
      return ${nestedJsx};
    }

    ReactDOM.createRoot(document.getElementById('__next')).render(
      React.createElement(React.StrictMode, null,
        React.createElement(App)
      )
    );
  </script>
</body>
</html>`;
  }

  /**
   * Resolve URL pathname to page file
   */
  private resolvePageFile(pathname: string): string | null {
    // Handle root path
    if (pathname === '/') {
      pathname = '/index';
    }

    const extensions = ['.jsx', '.tsx', '.js', '.ts'];

    // Try exact match: /about → /pages/about.jsx
    for (const ext of extensions) {
      const filePath = `${this.pagesDir}${pathname}${ext}`;
      if (this.exists(filePath)) {
        return filePath;
      }
    }

    // Try index file: /about → /pages/about/index.jsx
    for (const ext of extensions) {
      const filePath = `${this.pagesDir}${pathname}/index${ext}`;
      if (this.exists(filePath)) {
        return filePath;
      }
    }

    // Try dynamic route matching
    return this.resolveDynamicRoute(pathname);
  }

  /**
   * Resolve dynamic routes like /users/[id]
   */
  private resolveDynamicRoute(pathname: string): string | null {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return null;

    const extensions = ['.jsx', '.tsx', '.js', '.ts'];

    // Build possible paths with dynamic segments
    // e.g., /users/123 could match /pages/users/[id].jsx
    const tryPath = (dirPath: string, remainingSegments: string[]): string | null => {
      if (remainingSegments.length === 0) {
        // Try index file
        for (const ext of extensions) {
          const indexPath = `${dirPath}/index${ext}`;
          if (this.exists(indexPath)) {
            return indexPath;
          }
        }
        return null;
      }

      const [current, ...rest] = remainingSegments;

      // Try exact match first
      const exactPath = `${dirPath}/${current}`;

      // Check if it's a file
      for (const ext of extensions) {
        if (rest.length === 0 && this.exists(exactPath + ext)) {
          return exactPath + ext;
        }
      }

      // Check if it's a directory
      if (this.isDirectory(exactPath)) {
        const exactResult = tryPath(exactPath, rest);
        if (exactResult) return exactResult;
      }

      // Try dynamic segment [param]
      try {
        const entries = this.vfs.readdirSync(dirPath);
        for (const entry of entries) {
          // Check for dynamic file like [id].jsx
          for (const ext of extensions) {
            const dynamicFilePattern = /^\[([^\]]+)\]$/;
            const nameWithoutExt = entry.replace(ext, '');
            if (entry.endsWith(ext) && dynamicFilePattern.test(nameWithoutExt)) {
              // It's a dynamic file like [id].jsx
              if (rest.length === 0) {
                const filePath = `${dirPath}/${entry}`;
                if (this.exists(filePath)) {
                  return filePath;
                }
              }
            }
          }

          // Check for dynamic directory like [id]
          if (entry.startsWith('[') && entry.endsWith(']') && !entry.includes('.')) {
            const dynamicPath = `${dirPath}/${entry}`;
            if (this.isDirectory(dynamicPath)) {
              const dynamicResult = tryPath(dynamicPath, rest);
              if (dynamicResult) return dynamicResult;
            }
          }

          // Check for catch-all [...param].jsx
          for (const ext of extensions) {
            if (entry.startsWith('[...') && entry.endsWith(']' + ext)) {
              const filePath = `${dirPath}/${entry}`;
              if (this.exists(filePath)) {
                return filePath;
              }
            }
          }
        }
      } catch {
        // Directory doesn't exist
      }

      return null;
    };

    return tryPath(this.pagesDir, segments);
  }

  /**
   * Generate HTML shell for a page
   */
  private async generatePageHtml(pageFile: string, pathname: string): Promise<string> {
    // Convert page file path to relative module path
    const pageModulePath = '.' + pageFile;

    // Check for global CSS files
    const globalCssLinks: string[] = [];
    const cssLocations = ['/styles/globals.css', '/styles/global.css', '/app/globals.css'];
    for (const cssPath of cssLocations) {
      if (this.exists(cssPath)) {
        globalCssLinks.push(`<link rel="stylesheet" href=".${cssPath}">`);
      }
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Next.js App</title>
  ${TAILWIND_CDN_SCRIPT}
  ${CORS_PROXY_SCRIPT}
  ${globalCssLinks.join('\n  ')}
  ${REACT_REFRESH_PREAMBLE}
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.2.0?dev",
      "react/": "https://esm.sh/react@18.2.0&dev/",
      "react-dom": "https://esm.sh/react-dom@18.2.0?dev",
      "react-dom/": "https://esm.sh/react-dom@18.2.0&dev/",
      "react-dom/client": "https://esm.sh/react-dom@18.2.0/client?dev",
      "next/link": "./_next/shims/link.js",
      "next/router": "./_next/shims/router.js",
      "next/head": "./_next/shims/head.js"
    }
  }
  </script>
  ${HMR_CLIENT_SCRIPT}
</head>
<body>
  <div id="__next"></div>
  <script type="module">
    import React from 'react';
    import ReactDOM from 'react-dom/client';
    import Page from '${pageModulePath}';

    // Handle client-side navigation
    function App() {
      const [currentPath, setCurrentPath] = React.useState(window.location.pathname);

      React.useEffect(() => {
        const handlePopState = () => {
          setCurrentPath(window.location.pathname);
          // Re-render the page component
          window.location.reload();
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
      }, []);

      return React.createElement(Page);
    }

    ReactDOM.createRoot(document.getElementById('__next')).render(
      React.createElement(React.StrictMode, null,
        React.createElement(App)
      )
    );
  </script>
</body>
</html>`;
  }

  /**
   * Serve a basic 404 page
   */
  private serve404Page(): ResponseData {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - Page Not Found</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #fafafa;
    }
    h1 { font-size: 48px; margin: 0; }
    p { color: #666; margin-top: 10px; }
    a { color: #0070f3; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>404</h1>
  <p>This page could not be found.</p>
  <p><a href="/">Go back home</a></p>
</body>
</html>`;

    const buffer = Buffer.from(html);
    return {
      statusCode: 404,
      statusMessage: 'Not Found',
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': String(buffer.length),
      },
      body: buffer,
    };
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
      const transformed = await this.transformCode(content, urlPath);

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
      console.error('[NextDevServer] Transform error:', error);
      const message = error instanceof Error ? error.message : 'Transform failed';
      const body = `// Transform Error: ${message}\nconsole.error(${JSON.stringify(message)});`;
      return {
        statusCode: 200,
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
   * Transform JSX/TS code to browser-compatible JavaScript (ESM for browser)
   */
  private async transformCode(code: string, filename: string): Promise<string> {
    if (!isBrowser) {
      return code;
    }

    await initEsbuild();

    const esbuild = getEsbuild();
    if (!esbuild) {
      throw new Error('esbuild not available');
    }

    let loader: 'js' | 'jsx' | 'ts' | 'tsx' = 'js';
    if (filename.endsWith('.jsx')) loader = 'jsx';
    else if (filename.endsWith('.tsx')) loader = 'tsx';
    else if (filename.endsWith('.ts')) loader = 'ts';

    const result = await esbuild.transform(code, {
      loader,
      format: 'esm',
      target: 'esnext',
      jsx: 'automatic',
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

  /**
   * Transform API handler code to CommonJS for eval execution
   */
  private async transformApiHandler(code: string, filename: string): Promise<string> {
    if (isBrowser) {
      // Use esbuild in browser
      await initEsbuild();

      const esbuild = getEsbuild();
      if (!esbuild) {
        throw new Error('esbuild not available');
      }

      let loader: 'js' | 'jsx' | 'ts' | 'tsx' = 'js';
      if (filename.endsWith('.jsx')) loader = 'jsx';
      else if (filename.endsWith('.tsx')) loader = 'tsx';
      else if (filename.endsWith('.ts')) loader = 'ts';

      const result = await esbuild.transform(code, {
        loader,
        format: 'cjs',  // CommonJS for eval execution
        target: 'esnext',
        platform: 'neutral',
        sourcefile: filename,
      });

      return result.code;
    }

    // Simple ESM to CJS transform for Node.js/test environment
    let transformed = code;

    // Convert: import X from 'Y' -> const X = require('Y')
    transformed = transformed.replace(
      /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
      'const $1 = require("$2")'
    );

    // Convert: import { X } from 'Y' -> const { X } = require('Y')
    transformed = transformed.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g,
      'const {$1} = require("$2")'
    );

    // Convert: export default function X -> module.exports = function X
    transformed = transformed.replace(
      /export\s+default\s+function\s+(\w+)/g,
      'module.exports = function $1'
    );

    // Convert: export default function -> module.exports = function
    transformed = transformed.replace(
      /export\s+default\s+function\s*\(/g,
      'module.exports = function('
    );

    // Convert: export default X -> module.exports = X
    transformed = transformed.replace(
      /export\s+default\s+/g,
      'module.exports = '
    );

    return transformed;
  }

  /**
   * Add React Refresh registration to transformed code
   */
  private addReactRefresh(code: string, filename: string): string {
    const components: string[] = [];

    const funcDeclRegex = /(?:^|\n)(?:export\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\(/g;
    let match;
    while ((match = funcDeclRegex.exec(code)) !== null) {
      if (!components.includes(match[1])) {
        components.push(match[1]);
      }
    }

    const arrowRegex = /(?:^|\n)(?:export\s+)?(?:const|let|var)\s+([A-Z][a-zA-Z0-9]*)\s*=/g;
    while ((match = arrowRegex.exec(code)) !== null) {
      if (!components.includes(match[1])) {
        components.push(match[1]);
      }
    }

    if (components.length === 0) {
      return `// HMR Setup
import.meta.hot = window.__vite_hot_context__("${filename}");

${code}

if (import.meta.hot) {
  import.meta.hot.accept();
}
`;
    }

    const registrations = components
      .map(name => `  $RefreshReg$(${name}, "${filename} ${name}");`)
      .join('\n');

    return `// HMR Setup
import.meta.hot = window.__vite_hot_context__("${filename}");

${code}

// React Refresh Registration
if (import.meta.hot) {
${registrations}
  import.meta.hot.accept(() => {
    if (window.$RefreshRuntime$) {
      window.$RefreshRuntime$.performReactRefresh();
    }
  });
}
`;
  }

  /**
   * Start file watching for HMR
   */
  startWatching(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      this.hmrChannel = new BroadcastChannel('next-hmr');
    }

    const watchers: Array<{ close: () => void }> = [];

    // Watch /pages directory
    try {
      const pagesWatcher = this.vfs.watch(this.pagesDir, { recursive: true }, (eventType, filename) => {
        if (eventType === 'change' && filename) {
          const fullPath = filename.startsWith('/') ? filename : `${this.pagesDir}/${filename}`;
          this.handleFileChange(fullPath);
        }
      });
      watchers.push(pagesWatcher);
    } catch (error) {
      console.warn('[NextDevServer] Could not watch pages directory:', error);
    }

    // Watch /app directory for App Router
    if (this.useAppRouter) {
      try {
        const appWatcher = this.vfs.watch(this.appDir, { recursive: true }, (eventType, filename) => {
          if (eventType === 'change' && filename) {
            const fullPath = filename.startsWith('/') ? filename : `${this.appDir}/${filename}`;
            this.handleFileChange(fullPath);
          }
        });
        watchers.push(appWatcher);
      } catch (error) {
        console.warn('[NextDevServer] Could not watch app directory:', error);
      }
    }

    // Watch /public directory for static assets
    try {
      const publicWatcher = this.vfs.watch(this.publicDir, { recursive: true }, (eventType, filename) => {
        if (eventType === 'change' && filename) {
          this.handleFileChange(`${this.publicDir}/${filename}`);
        }
      });
      watchers.push(publicWatcher);
    } catch {
      // Ignore if public directory doesn't exist
    }

    this.watcherCleanup = () => {
      watchers.forEach(w => w.close());
    };
  }

  /**
   * Handle file change event
   */
  private handleFileChange(path: string): void {
    const isCSS = path.endsWith('.css');
    const isJS = /\.(jsx?|tsx?)$/.test(path);
    const updateType = (isCSS || isJS) ? 'update' : 'full-reload';

    const update: HMRUpdate = {
      type: updateType,
      path,
      timestamp: Date.now(),
    };

    this.emitHMRUpdate(update);

    if (this.hmrChannel) {
      this.hmrChannel.postMessage(update);
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

    if (this.hmrChannel) {
      this.hmrChannel.close();
      this.hmrChannel = null;
    }

    super.stop();
  }
}

export default NextDevServer;
