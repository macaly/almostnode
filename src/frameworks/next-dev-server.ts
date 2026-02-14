/**
 * NextDevServer - Next.js-compatible dev server for browser environment
 * Implements file-based routing, API routes, and HMR
 */

import { DevServer, DevServerOptions, ResponseData, HMRUpdate } from '../dev-server';
import { VirtualFS } from '../virtual-fs';
import { Buffer } from '../shims/stream';
import { simpleHash } from '../utils/hash';
import { loadTailwindConfig } from './tailwind-config-loader';
import { parseNextConfigValue } from './next-config-parser';
import {
  redirectNpmImports as _redirectNpmImports,
  stripCssImports as _stripCssImports,
  addReactRefresh as _addReactRefresh,
  transformEsmToCjsSimple,
  type CssModuleContext,
} from './code-transforms';
import {
  NEXT_LINK_SHIM,
  NEXT_ROUTER_SHIM,
  NEXT_NAVIGATION_SHIM,
  NEXT_HEAD_SHIM,
  NEXT_IMAGE_SHIM,
  NEXT_DYNAMIC_SHIM,
  NEXT_SCRIPT_SHIM,
  NEXT_FONT_GOOGLE_SHIM,
  NEXT_FONT_LOCAL_SHIM,
} from './next-shims';
import {
  type AppRoute,
  generateAppRouterHtml as _generateAppRouterHtml,
  generatePageHtml as _generatePageHtml,
  serve404Page as _serve404Page,
} from './next-html-generator';
import {
  type RouteResolverContext,
  hasAppRouter,
  resolveAppRoute,
  resolveAppRouteHandler,
  resolvePageFile,
  resolveApiFile,
  resolveFileWithExtension,
  needsTransform,
} from './next-route-resolver';
import {
  createMockRequest,
  createMockResponse,
  createStreamingMockResponse,
  createBuiltinModules,
  executeApiHandler,
} from './next-api-handler';
import { createVfsRequire, type VfsModule } from './vfs-require';
import { bundleNpmModuleForBrowser, clearNpmBundleCache, initNpmServe } from './npm-serve';
import { ESBUILD_WASM_ESM_CDN, ESBUILD_WASM_BINARY_CDN } from '../config/cdn';

// Check if we're in a real browser environment (not jsdom or Node.js)
const isBrowser = typeof window !== 'undefined' &&
  typeof window.navigator !== 'undefined' &&
  'serviceWorker' in window.navigator;

// Window.__esbuild type is declared in src/types/external.d.ts

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
        ESBUILD_WASM_ESM_CDN
      );

      const esbuildMod = mod.default || mod;

      try {
        await esbuildMod.initialize({
          wasmURL: ESBUILD_WASM_BINARY_CDN,
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

function getEsbuild(): typeof import('esbuild-wasm') | undefined {
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
  /** Environment variables (NEXT_PUBLIC_* are available in browser code via process.env) */
  env?: Record<string, string>;
  /** Asset prefix for static files (e.g., '/marketing'). Auto-detected from next.config if not specified. */
  assetPrefix?: string;
  /** Base path for the app (e.g., '/docs'). Auto-detected from next.config if not specified. */
  basePath?: string;
  /** Additional import map entries for the generated HTML (e.g., CDN URLs for framework packages) */
  additionalImportMap?: Record<string, string>;
  /** Additional packages that should NOT be redirected to esm.sh CDN (e.g., packages in the import map) */
  additionalLocalPackages?: string[];
  /** Extra modules to inject into API route handlers (available via require()) */
  apiModules?: Record<string, unknown>;
  /** Pin dependency versions in esm.sh URLs (e.g., 'zod@3.23.8' adds &deps=zod@3.23.8) */
  esmShDeps?: string;
  /** CORS proxy URL prefix for API route handlers (available as process.env.CORS_PROXY_URL) */
  corsProxy?: string;
}

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

  /** Target window for HMR updates (iframe contentWindow) */
  private hmrTargetWindow: Window | null = null;

  /** Store options for later access (e.g., env vars) */
  private options: NextDevServerOptions;

  /** Transform result cache for performance */
  private transformCache: Map<string, { code: string; hash: string }> = new Map();

  /** Path aliases from tsconfig.json (e.g., @/* -> ./*) */
  private pathAliases: Map<string, string> = new Map();

  /** Shared module cache for VFS-based require (persists across API requests) */
  private vfsModuleCache: Record<string, VfsModule> = {};

  /**
   * Create a VFS-based require function for API route handlers.
   * Resolves npm packages from /node_modules/ in VFS.
   */
  private createApiVfsRequire(builtinModules: Record<string, unknown>): (id: string) => unknown {
    const env: Record<string, string> = { ...this.options.env };
    if (this.options.corsProxy) {
      env.CORS_PROXY_URL = this.options.corsProxy;
    }
    const { require: vfsRequire } = createVfsRequire(this.vfs, '/', {
      builtinModules,
      process: {
        env,
        cwd: () => '/',
        platform: 'browser',
        version: 'v18.0.0',
        versions: { node: '18.0.0' },
      },
      moduleCache: this.vfsModuleCache,
    });
    return vfsRequire;
  }

  /** Cached Tailwind config script (injected before CDN) */
  private tailwindConfigScript: string = '';

  /** Whether Tailwind config has been loaded */
  private tailwindConfigLoaded: boolean = false;

  /** Asset prefix for static files (e.g., '/marketing') */
  private assetPrefix: string = '';

  /** Base path for the app (e.g., '/docs') */
  private basePath: string = '';

  /** Route resolver context (passes VFS access to standalone route functions) */
  private get routeCtx(): RouteResolverContext {
    return {
      exists: (path: string) => this.exists(path),
      isDirectory: (path: string) => this.isDirectory(path),
      readdir: (path: string) => this.vfs.readdirSync(path) as string[],
    };
  }

  constructor(vfs: VirtualFS, options: NextDevServerOptions) {
    super(vfs, options);
    this.options = options;

    // Initialize esbuild VFS so /_npm/ bundling can resolve from node_modules
    initNpmServe(vfs);

    // Inject CORS proxy URL into env so API handlers get it via process.env
    if (options.corsProxy) {
      if (!this.options.env) this.options.env = {};
      this.options.env.CORS_PROXY_URL = options.corsProxy;
    }

    this.pagesDir = options.pagesDir || '/pages';
    this.appDir = options.appDir || '/app';
    this.publicDir = options.publicDir || '/public';

    // Auto-detect which router to use based on directory existence
    // User can override with preferAppRouter option
    if (options.preferAppRouter !== undefined) {
      this.useAppRouter = options.preferAppRouter;
    } else {
      // Prefer App Router if /app directory exists with a page.jsx file
      this.useAppRouter = hasAppRouter(this.appDir, this.routeCtx);
    }

    // Load path aliases from tsconfig.json
    this.loadPathAliases();

    // Load assetPrefix from options or auto-detect from next.config
    this.loadAssetPrefix(options.assetPrefix);

    // Load basePath from options or auto-detect from next.config
    this.loadBasePath(options.basePath);
  }

  /**
   * Load path aliases from tsconfig.json
   * Supports common patterns like @/* -> ./*
   */
  private loadPathAliases(): void {
    try {
      const tsconfigPath = '/tsconfig.json';
      if (!this.vfs.existsSync(tsconfigPath)) {
        return;
      }

      const content = this.vfs.readFileSync(tsconfigPath, 'utf-8');
      const tsconfig = JSON.parse(content);
      const paths = tsconfig?.compilerOptions?.paths;

      if (!paths) {
        return;
      }

      // Convert tsconfig paths to a simple alias map
      // e.g., "@/*": ["./*"] becomes "@/" -> "/"
      for (const [alias, targets] of Object.entries(paths)) {
        if (Array.isArray(targets) && targets.length > 0) {
          // Remove trailing * from alias and target
          const aliasPrefix = alias.replace(/\*$/, '');
          const targetPrefix = (targets[0] as string).replace(/\*$/, '').replace(/^\./, '');
          this.pathAliases.set(aliasPrefix, targetPrefix);
        }
      }
    } catch (e) {
      // Silently ignore tsconfig parse errors
    }
  }

  /**
   * Load a string config value from options or auto-detect from next.config.ts/js
   */
  private loadConfigStringValue(key: string, optionValue?: string): string {
    if (optionValue !== undefined) {
      let val = optionValue.startsWith('/') ? optionValue : `/${optionValue}`;
      if (val.endsWith('/')) val = val.slice(0, -1);
      return val;
    }

    try {
      const configFiles: { path: string; isTs: boolean }[] = [
        { path: '/next.config.ts', isTs: true },
        { path: '/next.config.js', isTs: false },
        { path: '/next.config.mjs', isTs: false },
      ];

      for (const { path, isTs } of configFiles) {
        if (!this.vfs.existsSync(path)) continue;
        const content = this.vfs.readFileSync(path, 'utf-8');
        const value = parseNextConfigValue(content, key, isTs);
        if (value) {
          let normalized = value.startsWith('/') ? value : `/${value}`;
          if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
          return normalized;
        }
      }
    } catch {
      // Silently ignore config parse errors
    }

    return '';
  }

  private loadAssetPrefix(optionValue?: string): void {
    this.assetPrefix = this.loadConfigStringValue('assetPrefix', optionValue);
  }

  private loadBasePath(optionValue?: string): void {
    this.basePath = this.loadConfigStringValue('basePath', optionValue);
  }

  /**
   * Resolve path aliases in transformed code
   * Converts imports like "@/components/foo" to "/__virtual__/PORT/components/foo"
   * This ensures imports go through the virtual server instead of the main server
   */
  private resolvePathAliases(code: string, currentFile: string): string {
    if (this.pathAliases.size === 0) {
      return code;
    }

    // Get the virtual server base path
    const virtualBase = `/__virtual__/${this.port}`;

    let result = code;

    for (const [alias, target] of this.pathAliases) {
      // Match import/export statements with the alias
      // Handles: import ... from "@/...", export ... from "@/...", import("@/...")
      const aliasEscaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Pattern to match the alias in import/export statements
      // This matches: from "@/...", from '@/...', import("@/..."), import('@/...')
      const pattern = new RegExp(
        `(from\\s*['"]|import\\s*\\(\\s*['"])${aliasEscaped}([^'"]+)(['"])`,
        'g'
      );

      result = result.replace(pattern, (match, prefix, path, quote) => {
        // Convert alias to virtual server path
        // e.g., @/components/faq -> /__virtual__/3001/components/faq
        const resolvedPath = `${virtualBase}${target}${path}`;
        return `${prefix}${resolvedPath}${quote}`;
      });
    }

    return result;
  }

  /**
   * Set an environment variable at runtime
   * NEXT_PUBLIC_* variables will be available via process.env in browser code
   */
  setEnv(key: string, value: string): void {
    this.options.env = this.options.env || {};
    this.options.env[key] = value;
  }

  /**
   * Get current environment variables
   */
  getEnv(): Record<string, string> {
    return { ...this.options.env };
  }

  /**
   * Set the target window for HMR updates (typically iframe.contentWindow)
   * This enables HMR to work with sandboxed iframes via postMessage
   */
  setHMRTarget(targetWindow: Window): void {
    this.hmrTargetWindow = targetWindow;
  }

  /**
   * Generate a script tag that defines process.env with NEXT_PUBLIC_* variables
   * This makes environment variables available to browser code via process.env.NEXT_PUBLIC_*
   * Also includes all env variables for Server Component compatibility
   */
  private generateEnvScript(): string {
    const env = this.options.env || {};

    // Only include NEXT_PUBLIC_* vars in the HTML (client-side accessible)
    // Non-public vars should never be exposed in HTML for security
    const publicEnvVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (key.startsWith('NEXT_PUBLIC_')) {
        publicEnvVars[key] = value;
      }
    }

    // Always create process.env even if empty (some code checks for process.env existence)
    // This prevents "process is not defined" errors
    return `<script>
  // Environment variables (injected by NextDevServer)
  window.process = window.process || {};
  window.process.env = window.process.env || {};
  Object.assign(window.process.env, ${JSON.stringify(publicEnvVars)});
  // Next.js config values
  window.__NEXT_BASE_PATH__ = ${JSON.stringify(this.basePath)};
</script>`;
  }

  /**
   * Load Tailwind config from tailwind.config.ts and generate a script
   * that configures the Tailwind CDN at runtime
   */
  private async loadTailwindConfigIfNeeded(): Promise<string> {
    // Return cached script if already loaded
    if (this.tailwindConfigLoaded) {
      return this.tailwindConfigScript;
    }

    try {
      const result = await loadTailwindConfig(this.vfs, this.root);

      if (result.success) {
        this.tailwindConfigScript = result.configScript;
      } else if (result.error) {
        console.warn('[NextDevServer] Tailwind config warning:', result.error);
        this.tailwindConfigScript = '';
      }
    } catch (error) {
      console.warn('[NextDevServer] Failed to load tailwind.config:', error);
      this.tailwindConfigScript = '';
    }

    this.tailwindConfigLoaded = true;
    return this.tailwindConfigScript;
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
    let pathname = urlObj.pathname;

    // Strip virtual prefix if present (e.g., /__virtual__/3001/foo -> /foo)
    const virtualPrefixMatch = pathname.match(/^\/__virtual__\/\d+/);
    if (virtualPrefixMatch) {
      pathname = pathname.slice(virtualPrefixMatch[0].length) || '/';
    }

    // Strip assetPrefix if present (e.g., /marketing/images/foo.png -> /images/foo.png)
    // This allows static assets to be served from /public when using assetPrefix in next.config
    // Also handles double-slash case: /marketing//images/foo.png (when assetPrefix ends with /)
    if (this.assetPrefix && pathname.startsWith(this.assetPrefix)) {
      const rest = pathname.slice(this.assetPrefix.length);
      // Handle both /marketing/images and /marketing//images cases
      if (rest === '' || rest.startsWith('/')) {
        pathname = rest || '/';
        // Normalize double slashes that may occur from assetPrefix concatenation
        if (pathname.startsWith('//')) {
          pathname = pathname.slice(1);
        }
      }
    }

    // Strip basePath if present (e.g., /docs/about -> /about)
    if (this.basePath && pathname.startsWith(this.basePath)) {
      const rest = pathname.slice(this.basePath.length);
      if (rest === '' || rest.startsWith('/')) {
        pathname = rest || '/';
      }
    }

    // Serve Next.js shims
    if (pathname.startsWith('/_next/shims/')) {
      return this.serveNextShim(pathname);
    }

    // Route info endpoint for client-side navigation params extraction
    if (pathname === '/_next/route-info') {
      return this.serveRouteInfo(urlObj.searchParams.get('pathname') || '/');
    }

    // Serve page components for client-side navigation (Pages Router)
    if (pathname.startsWith('/_next/pages/')) {
      return this.servePageComponent(pathname);
    }

    // Serve app components for client-side navigation (App Router)
    if (pathname.startsWith('/_next/app/')) {
      return this.serveAppComponent(pathname);
    }

    // Static assets from /_next/static/*
    if (pathname.startsWith('/_next/static/')) {
      return this.serveStaticAsset(pathname);
    }

    // Serve npm packages bundled from VFS node_modules
    if (pathname.startsWith('/_npm/')) {
      return this.serveNpmModule(pathname);
    }

    // App Router API routes (route.ts/route.js) - check before Pages Router API routes
    if (this.useAppRouter) {
      const appRouteFile = resolveAppRouteHandler(this.appDir, pathname, this.routeCtx);
      if (appRouteFile) {
        return this.handleAppRouteHandler(method, pathname, headers, body, appRouteFile, urlObj.search);
      }
    }

    // Pages Router API routes: /api/*
    if (pathname.startsWith('/api/')) {
      return this.handleApiRoute(method, pathname, headers, body);
    }

    // Public directory files
    const publicPath = this.publicDir + pathname;
    if (this.exists(publicPath) && !this.isDirectory(publicPath)) {
      return this.serveFile(publicPath);
    }

    // Direct file requests (e.g., /pages/index.jsx for HMR re-imports)
    if (needsTransform(pathname) && this.exists(pathname)) {
      return this.transformAndServe(pathname, pathname);
    }

    // Try to resolve file with different extensions (for imports without extensions)
    // e.g., /components/faq -> /components/faq.tsx
    const resolvedFile = resolveFileWithExtension(pathname, this.routeCtx);
    if (resolvedFile) {
      if (needsTransform(resolvedFile)) {
        return this.transformAndServe(resolvedFile, pathname);
      }
      return this.serveFile(resolvedFile);
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
      case 'image':
        code = NEXT_IMAGE_SHIM;
        break;
      case 'dynamic':
        code = NEXT_DYNAMIC_SHIM;
        break;
      case 'script':
        code = NEXT_SCRIPT_SHIM;
        break;
      case 'font/google':
        code = NEXT_FONT_GOOGLE_SHIM;
        break;
      case 'font/local':
        code = NEXT_FONT_LOCAL_SHIM;
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
   * Serve route info for client-side navigation
   * Returns params extracted from dynamic route segments
   */
  private serveRouteInfo(pathname: string): ResponseData {
    const route = resolveAppRoute(this.appDir, pathname, this.routeCtx);

    const info = route
      ? { params: route.params, found: true, page: route.page, layouts: route.layouts }
      : { params: {}, found: false };

    const json = JSON.stringify(info);
    const buffer = Buffer.from(json);

    return {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
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
   * Serve page components for client-side navigation
   * Maps /_next/pages/index.js → /pages/index.jsx (transformed)
   */
  private async servePageComponent(pathname: string): Promise<ResponseData> {
    // Extract the route from /_next/pages/about.js → /about
    const route = pathname
      .replace('/_next/pages', '')
      .replace(/\.js$/, '');

    // Resolve the actual page file
    const pageFile = resolvePageFile(this.pagesDir, route, this.routeCtx);

    if (!pageFile) {
      return this.notFound(pathname);
    }

    // Transform and serve the page component as a JS module
    // Use the actual file path (pageFile) for both reading and determining the loader
    return this.transformAndServe(pageFile, pageFile);
  }

  /**
   * Serve app components for client-side navigation (App Router)
   * Maps /_next/app/app/about/page.js → /app/about/page.tsx (transformed)
   */
  private async serveAppComponent(pathname: string): Promise<ResponseData> {
    // Extract the file path from /_next/app prefix
    const rawFilePath = pathname.replace('/_next/app', '');

    // First, try the path as-is (handles imports with explicit extensions like .tsx/.ts)
    if (this.exists(rawFilePath) && !this.isDirectory(rawFilePath)) {
      return this.transformAndServe(rawFilePath, rawFilePath);
    }

    // Strip .js extension and try different extensions
    // e.g. /_next/app/app/about/page.js → /app/about/page → /app/about/page.tsx
    const filePath = rawFilePath.replace(/\.js$/, '');

    const extensions = ['.tsx', '.jsx', '.ts', '.js'];
    for (const ext of extensions) {
      const fullPath = filePath + ext;
      if (this.exists(fullPath)) {
        return this.transformAndServe(fullPath, fullPath);
      }
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
    const apiFile = resolveApiFile(this.pagesDir, pathname, this.routeCtx);

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
      const req = createMockRequest(method, pathname, headers, body);
      const res = createMockResponse();

      // Execute the handler
      const builtins = await createBuiltinModules(
        () => import('../shims/fs').then(m => m.createFsShim(this.vfs))
      );
      if (this.options.apiModules) {
        Object.assign(builtins, this.options.apiModules);
      }
      const vfsRequire = this.createApiVfsRequire(builtins);
      const result = await executeApiHandler(transformed, req, res, this.options.env, builtins, vfsRequire);

      // If the handler returned a Response object, convert it to ResponseData
      if (result instanceof Response) {
        const respHeaders: Record<string, string> = {};
        result.headers.forEach((value: string, key: string) => {
          respHeaders[key] = value;
        });
        const bodyBytes = result.body
          ? new Uint8Array(await new Response(result.body).arrayBuffer())
          : new Uint8Array(0);
        return {
          statusCode: result.status,
          statusMessage: result.statusText || 'OK',
          headers: respHeaders,
          body: Buffer.from(bodyBytes),
        };
      }

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
   * Handle App Router route handler (route.ts) requests
   * These use the Web Request/Response API pattern
   */
  private async handleAppRouteHandler(
    method: string,
    pathname: string,
    headers: Record<string, string>,
    body: Buffer | undefined,
    routeFile: string,
    search?: string
  ): Promise<ResponseData> {
    try {
      const code = this.vfs.readFileSync(routeFile, 'utf8');
      const transformed = await this.transformApiHandler(code, routeFile);

      // Create module context and execute the route handler
      const builtinModules = await createBuiltinModules();
      if (this.options.apiModules) {
        Object.assign(builtinModules, this.options.apiModules);
      }
      const vfsRequire = this.createApiVfsRequire(builtinModules);

      const require = (id: string): unknown => {
        const modId = id.startsWith('node:') ? id.slice(5) : id;
        if (builtinModules[modId]) return builtinModules[modId];
        return vfsRequire(modId);
      };

      const moduleObj = { exports: {} as Record<string, unknown> };
      const exports = moduleObj.exports;
      const env: Record<string, string> = { ...this.options.env };
      if (this.options.corsProxy) env.CORS_PROXY_URL = this.options.corsProxy;
      const process = {
        env,
        cwd: () => '/',
        platform: 'browser',
        version: 'v18.0.0',
        versions: { node: '18.0.0' },
      };

      const fn = new Function('exports', 'require', 'module', 'process', transformed);
      fn(exports, require, moduleObj, process);

      // Get the handler for the HTTP method
      const methodUpper = method.toUpperCase();
      const handler = moduleObj.exports[methodUpper] || moduleObj.exports[methodUpper.toLowerCase()];

      if (typeof handler !== 'function') {
        return {
          statusCode: 405,
          statusMessage: 'Method Not Allowed',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: Buffer.from(JSON.stringify({ error: `Method ${method} not allowed` })),
        };
      }

      // Create a Web API Request object
      const requestUrl = new URL(pathname + (search || ''), 'http://localhost');
      const requestInit: RequestInit = {
        method: methodUpper,
        headers: new Headers(headers),
      };
      if (body && methodUpper !== 'GET' && methodUpper !== 'HEAD') {
        requestInit.body = body;
      }
      const request = new Request(requestUrl.toString(), requestInit);

      // Extract route params
      const route = resolveAppRoute(this.appDir, pathname, this.routeCtx);
      const params = route?.params || {};

      // Call the handler
      const response = await handler(request, { params: Promise.resolve(params) });

      // Convert Response to our format
      if (response instanceof Response) {
        const respHeaders: Record<string, string> = {};
        response.headers.forEach((value: string, key: string) => {
          respHeaders[key] = value;
        });

        const respBody = await response.text();
        return {
          statusCode: response.status,
          statusMessage: response.statusText || 'OK',
          headers: respHeaders,
          body: Buffer.from(respBody),
        };
      }

      // If the handler returned a plain object, serialize as JSON
      if (response && typeof response === 'object') {
        const json = JSON.stringify(response);
        return {
          statusCode: 200,
          statusMessage: 'OK',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: Buffer.from(json),
        };
      }

      return {
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: Buffer.from(String(response || '')),
      };
    } catch (error) {
      console.error('[NextDevServer] App Route handler error:', error);
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
   * Handle streaming API route requests
   * This is called by the server bridge for requests that need streaming support
   */
  async handleStreamingRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: Buffer | undefined,
    onStart: (statusCode: number, statusMessage: string, headers: Record<string, string>) => void,
    onChunk: (chunk: string | Uint8Array) => void,
    onEnd: () => void
  ): Promise<void> {
    const urlObj = new URL(url, 'http://localhost');
    let pathname = urlObj.pathname;

    // Strip virtual prefix if present (same as handleRequest)
    const virtualPrefixMatch = pathname.match(/^\/__virtual__\/\d+/);
    if (virtualPrefixMatch) {
      pathname = pathname.slice(virtualPrefixMatch[0].length) || '/';
    }

    // Check App Router route handlers first (they return Response objects with ReadableStream bodies)
    if (this.useAppRouter) {
      const appRouteFile = resolveAppRouteHandler(this.appDir, pathname, this.routeCtx);
      if (appRouteFile) {
        return this.handleAppRouteHandlerStreaming(
          method, pathname, headers, body, appRouteFile, urlObj.search, onStart, onChunk, onEnd
        );
      }
    }

    // Pages Router API routes
    if (!pathname.startsWith('/api/')) {
      onStart(404, 'Not Found', { 'Content-Type': 'application/json' });
      onChunk(JSON.stringify({ error: 'Not found' }));
      onEnd();
      return;
    }

    const apiFile = resolveApiFile(this.pagesDir, pathname, this.routeCtx);

    if (!apiFile) {
      onStart(404, 'Not Found', { 'Content-Type': 'application/json' });
      onChunk(JSON.stringify({ error: 'API route not found' }));
      onEnd();
      return;
    }

    try {
      const code = this.vfs.readFileSync(apiFile, 'utf8');
      const transformed = await this.transformApiHandler(code, apiFile);

      const req = createMockRequest(method, pathname, headers, body);
      const res = createStreamingMockResponse(onStart, onChunk, onEnd);

      const builtins = await createBuiltinModules(
        () => import('../shims/fs').then(m => m.createFsShim(this.vfs))
      );
      if (this.options.apiModules) {
        Object.assign(builtins, this.options.apiModules);
      }
      const vfsRequire = this.createApiVfsRequire(builtins);
      const result = await executeApiHandler(transformed, req, res, this.options.env, builtins, vfsRequire);

      // If the handler returned a Response object (Web API style), stream it
      // directly. This lets Pages Router handlers use `return new Response()`
      // or return AI SDK's `toUIMessageStreamResponse()` without manual SSE splitting.
      if (result instanceof Response) {
        const respHeaders: Record<string, string> = {};
        result.headers.forEach((value: string, key: string) => {
          respHeaders[key] = value;
        });
        onStart(result.status, result.statusText || 'OK', respHeaders);
        if (result.body) {
          const reader = result.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            onChunk(value);
          }
        }
        onEnd();
        return;
      }

      // Wait for the response to end (classic req/res pattern)
      if (!res.isEnded()) {
        const timeout = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('API handler timeout')), 30000);
        });
        await Promise.race([res.waitForEnd(), timeout]);
      }
    } catch (error) {
      console.error('[NextDevServer] Streaming API error:', error);
      onStart(500, 'Internal Server Error', { 'Content-Type': 'application/json' });
      onChunk(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal Server Error' }));
      onEnd();
    }
  }

  /**
   * Handle App Router route handler with streaming support.
   * Executes the handler, and if it returns a Response with a ReadableStream body,
   * pipes the stream through the onStart/onChunk/onEnd callbacks.
   */
  private async handleAppRouteHandlerStreaming(
    method: string,
    pathname: string,
    headers: Record<string, string>,
    body: Buffer | undefined,
    routeFile: string,
    search: string | undefined,
    onStart: (statusCode: number, statusMessage: string, headers: Record<string, string>) => void,
    onChunk: (chunk: string | Uint8Array) => void,
    onEnd: () => void
  ): Promise<void> {
    try {
      const code = this.vfs.readFileSync(routeFile, 'utf8');
      const transformed = await this.transformApiHandler(code, routeFile);

      const builtinModules = await createBuiltinModules(
        () => import('../shims/fs').then(m => m.createFsShim(this.vfs))
      );
      if (this.options.apiModules) {
        Object.assign(builtinModules, this.options.apiModules);
      }
      const vfsRequire = this.createApiVfsRequire(builtinModules);

      const require = (id: string): unknown => {
        const modId = id.startsWith('node:') ? id.slice(5) : id;
        if (builtinModules[modId]) return builtinModules[modId];
        return vfsRequire(modId);
      };

      const moduleObj = { exports: {} as Record<string, unknown> };
      const exports = moduleObj.exports;
      const env: Record<string, string> = { ...this.options.env };
      if (this.options.corsProxy) env.CORS_PROXY_URL = this.options.corsProxy;
      const process = {
        env,
        cwd: () => '/',
        platform: 'browser',
        version: 'v18.0.0',
        versions: { node: '18.0.0' },
      };

      const fn = new Function('exports', 'require', 'module', 'process', transformed);
      fn(exports, require, moduleObj, process);

      // Get the handler for the HTTP method
      const methodUpper = method.toUpperCase();
      const handler = moduleObj.exports[methodUpper] || moduleObj.exports[methodUpper.toLowerCase()];

      if (typeof handler !== 'function') {
        onStart(405, 'Method Not Allowed', { 'Content-Type': 'application/json' });
        onChunk(JSON.stringify({ error: `Method ${method} not allowed` }));
        onEnd();
        return;
      }

      // Create a Web API Request object
      const requestUrl = new URL(pathname + (search || ''), 'http://localhost');
      const requestInit: RequestInit = {
        method: methodUpper,
        headers: new Headers(headers),
      };
      if (body && methodUpper !== 'GET' && methodUpper !== 'HEAD') {
        requestInit.body = body;
      }
      const request = new Request(requestUrl.toString(), requestInit);

      // Extract route params
      const route = resolveAppRoute(this.appDir, pathname, this.routeCtx);
      const params = route?.params || {};

      // Call the handler
      const response = await handler(request, { params: Promise.resolve(params) });

      if (response instanceof Response) {
        const respHeaders: Record<string, string> = {};
        response.headers.forEach((value: string, key: string) => {
          respHeaders[key] = value;
        });

        if (response.body) {
          // Stream the response body through callbacks
          onStart(response.status, response.statusText || 'OK', respHeaders);
          const reader = response.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              onChunk(value);
            }
          } finally {
            onEnd();
          }
        } else {
          // No body
          onStart(response.status, response.statusText || 'OK', respHeaders);
          onEnd();
        }
      } else {
        // Non-Response return value
        const json = JSON.stringify(response || {});
        onStart(200, 'OK', { 'Content-Type': 'application/json; charset=utf-8' });
        onChunk(json);
        onEnd();
      }
    } catch (error) {
      console.error('[NextDevServer] App Route streaming error:', error);
      onStart(500, 'Internal Server Error', { 'Content-Type': 'application/json' });
      onChunk(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal Server Error' }));
      onEnd();
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
    const pageFile = resolvePageFile(this.pagesDir, pathname, this.routeCtx);

    if (!pageFile) {
      // Try to serve 404 page if exists
      const notFoundPage = resolvePageFile(this.pagesDir, '/404', this.routeCtx);
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
    if (needsTransform(pathname)) {
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
    const route = resolveAppRoute(this.appDir, pathname, this.routeCtx);

    if (!route) {
      // Try not-found page
      const notFoundRoute = resolveAppRoute(this.appDir, '/not-found', this.routeCtx);
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
   * Build context object for HTML generation functions
   */
  private htmlContext() {
    return {
      port: this.port,
      exists: (path: string) => this.exists(path),
      generateEnvScript: () => this.generateEnvScript(),
      loadTailwindConfigIfNeeded: () => this.loadTailwindConfigIfNeeded(),
      additionalImportMap: this.options.additionalImportMap,
    };
  }

  /**
   * Generate HTML for App Router with nested layouts
   */
  private async generateAppRouterHtml(
    route: AppRoute,
    pathname: string
  ): Promise<string> {
    return _generateAppRouterHtml(this.htmlContext(), route, pathname);
  }


  /**
   * Generate HTML shell for a page
   */
  private async generatePageHtml(pageFile: string, pathname: string): Promise<string> {
    return _generatePageHtml(this.htmlContext(), pageFile, pathname);
  }

  /**
   * Serve a basic 404 page
   */
  private serve404Page(): ResponseData {
    return _serve404Page(this.port);
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

      // Use filePath (with extension) for transform so loader is correctly determined
      const transformed = await this.transformCode(content, filePath);

      // Cache the transform result (LRU eviction at 500 entries)
      this.transformCache.set(filePath, { code: transformed, hash });
      if (this.transformCache.size > 500) {
        const firstKey = this.transformCache.keys().next().value;
        if (firstKey) this.transformCache.delete(firstKey);
      }

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
      // Even in non-browser mode, strip/transform CSS imports
      // so CSS module imports get replaced with class name objects
      return this.stripCssImports(code, filename);
    }

    await initEsbuild();

    const esbuild = getEsbuild();
    if (!esbuild) {
      throw new Error('esbuild not available');
    }

    // Remove CSS imports before transformation - they are handled via <link> tags
    // CSS imports in ESM would fail with MIME type errors
    const codeWithoutCssImports = this.stripCssImports(code, filename);

    // Resolve path aliases (e.g., @/ -> /) before transformation
    const codeWithResolvedAliases = this.resolvePathAliases(codeWithoutCssImports, filename);

    let loader: 'js' | 'jsx' | 'ts' | 'tsx' = 'js';
    if (filename.endsWith('.jsx')) loader = 'jsx';
    else if (filename.endsWith('.tsx')) loader = 'tsx';
    else if (filename.endsWith('.ts')) loader = 'ts';

    const result = await esbuild.transform(codeWithResolvedAliases, {
      loader,
      format: 'esm',
      target: 'esnext',
      jsx: 'automatic',
      jsxImportSource: 'react',
      sourcemap: 'inline',
      sourcefile: filename,
    });

    // Redirect bare npm imports to esm.sh CDN
    const codeWithCdnImports = this.redirectNpmImports(result.code);

    // Add React Refresh registration for JSX/TSX files
    if (/\.(jsx|tsx)$/.test(filename)) {
      return this.addReactRefresh(codeWithCdnImports, filename);
    }

    return codeWithCdnImports;
  }

  /** Cached dependency versions from package.json */
  private _dependencies: Record<string, string> | undefined;

  private getDependencies(): Record<string, string> {
    if (this._dependencies) return this._dependencies;
    let deps: Record<string, string> = {};
    try {
      const pkgPath = `${this.root}/package.json`;
      if (this.vfs.existsSync(pkgPath)) {
        const pkg = JSON.parse(this.vfs.readFileSync(pkgPath, 'utf-8'));
        deps = { ...pkg.dependencies, ...pkg.devDependencies };
      }
    } catch { /* ignore parse errors */ }
    this._dependencies = deps;
    return deps;
  }

  /** Cached set of packages installed in VFS node_modules */
  private _installedPackages: Set<string> | undefined;

  /** Scan /node_modules/ in VFS to build a set of installed package names. */
  private getInstalledPackages(): Set<string> {
    if (this._installedPackages) return this._installedPackages;
    const pkgs = new Set<string>();
    const nmDir = '/node_modules';
    try {
      if (!this.vfs.existsSync(nmDir)) {
        this._installedPackages = pkgs;
        return pkgs;
      }
      const entries = this.vfs.readdirSync(nmDir) as string[];
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        if (entry.startsWith('@')) {
          // Scoped package — list sub-entries
          const scopeDir = nmDir + '/' + entry;
          try {
            const scopeEntries = this.vfs.readdirSync(scopeDir) as string[];
            for (const sub of scopeEntries) {
              pkgs.add(entry + '/' + sub);
            }
          } catch { /* ignore */ }
        } else {
          pkgs.add(entry);
        }
      }
    } catch { /* ignore */ }
    this._installedPackages = pkgs;
    return pkgs;
  }

  /** Invalidate installed packages cache (call after npm install). */
  clearInstalledPackagesCache(): void {
    this._installedPackages = undefined;
    this._dependencies = undefined;
    clearNpmBundleCache();
  }

  /**
   * Serve a bundled npm module from VFS node_modules.
   * /_npm/@ai-sdk/react → esbuild bundles @ai-sdk/react as ESM
   */
  private async serveNpmModule(pathname: string): Promise<ResponseData> {
    const specifier = pathname.slice('/_npm/'.length);
    if (!specifier) {
      return this.notFound(pathname);
    }

    try {
      const code = await bundleNpmModuleForBrowser(specifier);
      return {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
        body: Buffer.from(code),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[NextDevServer] Failed to bundle npm module '${specifier}':`, msg);
      return {
        statusCode: 500,
        statusMessage: 'Internal Server Error',
        headers: { 'Content-Type': 'text/plain' },
        body: Buffer.from(`Failed to bundle '${specifier}': ${msg}`),
      };
    }
  }

  private redirectNpmImports(code: string): string {
    return _redirectNpmImports(code, this.options.additionalLocalPackages, this.getDependencies(), this.options.esmShDeps, this.getInstalledPackages());
  }

  private stripCssImports(code: string, currentFile?: string): string {
    return _stripCssImports(code, currentFile, this.getCssModuleContext());
  }

  private getCssModuleContext(): CssModuleContext {
    return {
      readFile: (path: string) => this.vfs.readFileSync(path, 'utf-8'),
      exists: (path: string) => this.exists(path),
    };
  }

  /**
   * Transform API handler code to CommonJS for eval execution
   */
  private async transformApiHandler(code: string, filename: string): Promise<string> {
    // Resolve path aliases first
    const codeWithResolvedAliases = this.resolvePathAliases(code, filename);

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

      const result = await esbuild.transform(codeWithResolvedAliases, {
        loader,
        format: 'cjs',  // CommonJS for eval execution
        target: 'esnext',
        platform: 'neutral',
        sourcefile: filename,
      });

      return result.code;
    }

    return transformEsmToCjsSimple(codeWithResolvedAliases);
  }

  private addReactRefresh(code: string, filename: string): string {
    return _addReactRefresh(code, filename);
  }

  /**
   * Start file watching for HMR
   */
  startWatching(): void {
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

    // Send HMR update via postMessage (works with sandboxed iframes)
    if (this.hmrTargetWindow) {
      try {
        this.hmrTargetWindow.postMessage({ ...update, channel: 'next-hmr' }, '*');
      } catch (e) {
        // Window may be closed or unavailable
      }
    }
  }

  /**
   * Override serveFile to wrap JSON files as ES modules
   * This is needed because browsers can't dynamically import raw JSON files
   */
  protected serveFile(filePath: string): ResponseData {
    // For JSON files, wrap as ES module so they can be dynamically imported
    if (filePath.endsWith('.json')) {
      try {
        const normalizedPath = this.resolvePath(filePath);
        const content = this.vfs.readFileSync(normalizedPath);

        // Properly convert content to string
        // VirtualFS may return string, Buffer, or Uint8Array
        let jsonContent: string;
        if (typeof content === 'string') {
          jsonContent = content;
        } else if (content instanceof Uint8Array) {
          // Use TextDecoder for Uint8Array (includes Buffer in browser)
          jsonContent = new TextDecoder('utf-8').decode(content);
        } else {
          // Fallback for other buffer-like objects
          jsonContent = Buffer.from(content).toString('utf-8');
        }

        // Wrap JSON as ES module
        const esModuleContent = `export default ${jsonContent};`;
        const buffer = Buffer.from(esModuleContent);

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
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return this.notFound(filePath);
        }
        return this.serverError(error);
      }
    }

    // For all other files, use the parent implementation
    return super.serveFile(filePath);
  }

  /**
   * Resolve a path (helper to access protected method from parent)
   */
  protected resolvePath(urlPath: string): string {
    // Remove query string and hash
    let path = urlPath.split('?')[0].split('#')[0];

    // Normalize path
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    // Join with root
    if (this.root !== '/') {
      path = this.root + path;
    }

    return path;
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
}

export default NextDevServer;
