/**
 * Next.js HTML page generation
 * Standalone functions extracted from NextDevServer for generating
 * App Router HTML, Pages Router HTML, and 404 pages.
 */

import { Buffer } from '../shims/stream';
import { ResponseData } from '../dev-server';
import {
  TAILWIND_CDN_SCRIPT,
  CORS_PROXY_SCRIPT,
  REACT_REFRESH_PREAMBLE,
  HMR_CLIENT_SCRIPT,
} from './next-shims';
import { REACT_CDN, REACT_DOM_CDN } from '../config/cdn';

/** Resolved App Router route with page, layouts, and UI convention files */
export interface AppRoute {
  page: string;
  layouts: string[];
  params: Record<string, string | string[]>;
  loading?: string;
  error?: string;
  notFound?: string;
}

/** Context needed by HTML generation functions */
export interface HtmlGeneratorContext {
  port: number;
  exists: (path: string) => boolean;
  generateEnvScript: () => string;
  loadTailwindConfigIfNeeded: () => Promise<string>;
  /** Additional import map entries (e.g., framework-specific CDN mappings) */
  additionalImportMap?: Record<string, string>;
}

/**
 * Generate HTML for App Router with nested layouts
 */
export async function generateAppRouterHtml(
  ctx: HtmlGeneratorContext,
  route: AppRoute,
  pathname: string
): Promise<string> {
  // Use virtual server prefix for all file imports so the service worker can intercept them
  const virtualPrefix = `/__virtual__/${ctx.port}`;

  // Check for global CSS files
  const globalCssLinks: string[] = [];
  const cssLocations = ['/app/globals.css', '/styles/globals.css', '/styles/global.css'];
  for (const cssPath of cssLocations) {
    if (ctx.exists(cssPath)) {
      globalCssLinks.push(`<link rel="stylesheet" href="${virtualPrefix}${cssPath}">`);
    }
  }

  // Build convention file paths for the inline script
  const loadingModulePath = route.loading ? `${virtualPrefix}${route.loading}` : '';
  const errorModulePath = route.error ? `${virtualPrefix}${route.error}` : '';
  const notFoundModulePath = route.notFound ? `${virtualPrefix}${route.notFound}` : '';

  // Build additional import map entries from context
  const additionalImportMapEntries = ctx.additionalImportMap
    ? Object.entries(ctx.additionalImportMap)
        .map(([key, value]) => `\n      "${key}": "${value}",`)
        .join('')
    : '';

  // Generate env script for NEXT_PUBLIC_* variables
  const envScript = ctx.generateEnvScript();

  // Load Tailwind config if available (must be injected BEFORE CDN script)
  const tailwindConfigScript = await ctx.loadTailwindConfigIfNeeded();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="${virtualPrefix}/">
  <title>Next.js App</title>
  ${envScript}
  ${TAILWIND_CDN_SCRIPT}
  ${tailwindConfigScript}
  ${CORS_PROXY_SCRIPT}
  ${globalCssLinks.join('\n  ')}
  <script type="importmap">
  {
    "imports": {
      "react": "${REACT_CDN}?dev",
      "react/": "${REACT_CDN}&dev/",
      "react-dom": "${REACT_DOM_CDN}?dev",
      "react-dom/": "${REACT_DOM_CDN}&dev/",
      "react-dom/client": "${REACT_DOM_CDN}/client?dev",${additionalImportMapEntries}
      "next/link": "${virtualPrefix}/_next/shims/link.js",
      "next/router": "${virtualPrefix}/_next/shims/router.js",
      "next/head": "${virtualPrefix}/_next/shims/head.js",
      "next/navigation": "${virtualPrefix}/_next/shims/navigation.js",
      "next/image": "${virtualPrefix}/_next/shims/image.js",
      "next/dynamic": "${virtualPrefix}/_next/shims/dynamic.js",
      "next/script": "${virtualPrefix}/_next/shims/script.js",
      "next/font/google": "${virtualPrefix}/_next/shims/font/google.js",
      "next/font/local": "${virtualPrefix}/_next/shims/font/local.js"
    }
  }
  </script>
  ${REACT_REFRESH_PREAMBLE}
  ${HMR_CLIENT_SCRIPT}
</head>
<body>
  <div id="__next"></div>
  <script type="module">
    import React from 'react';
    import ReactDOM from 'react-dom/client';

    const virtualBase = '${virtualPrefix}';

    // Initial route params (embedded by server for initial page load)
    const initialRouteParams = ${JSON.stringify(route.params)};
    const initialPathname = '${pathname}';

    // Expose initial params for useParams() hook
    window.__NEXT_ROUTE_PARAMS__ = initialRouteParams;

    // Convention file paths (loading.tsx, error.tsx, not-found.tsx)
    const loadingModulePath = '${loadingModulePath}';
    const errorModulePath = '${errorModulePath}';
    const notFoundModulePath = '${notFoundModulePath}';

    // Route info cache: pathname -> Promise<{ found, params, page, layouts }>
    // Uses promise-based caching to deduplicate concurrent requests
    const routeInfoCache = new Map();

    // Pre-seed cache with server-resolved initial route data
    routeInfoCache.set(initialPathname, Promise.resolve({
      found: true,
      params: initialRouteParams,
      page: '${route.page}',
      layouts: ${JSON.stringify(route.layouts)},
    }));

    // Resolve route via server — handles route groups, dynamic segments, catch-all, etc.
    function resolveRoute(pathname) {
      let route = pathname;
      if (route.startsWith(virtualBase)) {
        route = route.slice(virtualBase.length);
      }
      route = route.replace(/^\\/+/, '/') || '/';

      if (!routeInfoCache.has(route)) {
        routeInfoCache.set(route,
          fetch(virtualBase + '/_next/route-info?pathname=' + encodeURIComponent(route))
            .then(r => r.json())
            .catch(e => {
              console.error('[Router] Failed to resolve route:', e);
              routeInfoCache.delete(route);
              return { found: false, params: {}, page: null, layouts: [] };
            })
        );
      }
      return routeInfoCache.get(route);
    }

    // Dynamic page loader with retry (SW may need time to recover after idle termination)
    async function loadPage(pathname) {
      const info = await resolveRoute(pathname);
      if (!info.found || !info.page) return null;
      const modulePath = virtualBase + '/_next/app' + info.page;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const module = await import(/* @vite-ignore */ modulePath + (attempt > 0 ? '?retry=' + attempt : ''));
          return module.default;
        } catch (e) {
          console.warn('[Navigation] Load attempt ' + (attempt + 1) + ' failed:', modulePath, e.message);
          if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
        }
      }
      console.error('[Navigation] Failed to load page after 3 attempts:', modulePath);
      return null;
    }

    // Load layouts (with caching)
    const layoutCache = new Map();
    async function loadLayouts(pathname) {
      const info = await resolveRoute(pathname);
      const layoutPaths = (info.layouts || []).map(l => virtualBase + '/_next/app' + l);
      const layouts = [];
      for (const path of layoutPaths) {
        if (layoutCache.has(path)) {
          layouts.push(layoutCache.get(path));
        } else {
          try {
            const module = await import(/* @vite-ignore */ path);
            layoutCache.set(path, module.default);
            layouts.push(module.default);
          } catch (e) {
            // Layout might not exist for this segment, skip
          }
        }
      }
      return layouts;
    }

    // Load convention components (loading.tsx, error.tsx)
    let LoadingComponent = null;
    let ErrorComponent = null;
    let NotFoundComponent = null;

    async function loadConventionComponents() {
      if (loadingModulePath) {
        try {
          const mod = await import(/* @vite-ignore */ loadingModulePath);
          LoadingComponent = mod.default;
        } catch (e) { /* loading.tsx not available */ }
      }
      if (errorModulePath) {
        try {
          const mod = await import(/* @vite-ignore */ errorModulePath);
          ErrorComponent = mod.default;
        } catch (e) { /* error.tsx not available */ }
      }
      if (notFoundModulePath) {
        try {
          const mod = await import(/* @vite-ignore */ notFoundModulePath);
          NotFoundComponent = mod.default;
        } catch (e) { /* not-found.tsx not available */ }
      }
    }
    await loadConventionComponents();

    // Error boundary class component
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', error, info);
      }
      render() {
        if (this.state.error) {
          if (this.props.fallback) {
            return React.createElement(this.props.fallback, {
              error: this.state.error,
              reset: () => this.setState({ error: null })
            });
          }
          return React.createElement('div', { style: { color: 'red', padding: '20px' } },
            'Error: ' + this.state.error.message
          );
        }
        return this.props.children;
      }
    }

    // Wrapper that provides searchParams/params props and handles errors
    function PageWrapper({ component: Component, pathname, search }) {
      const [searchParams, setSearchParams] = React.useState(() => {
        const url = new URL(window.location.href);
        return Promise.resolve(Object.fromEntries(url.searchParams));
      });
      const [params, setParams] = React.useState(() => Promise.resolve(initialRouteParams));
      const [isNotFound, setIsNotFound] = React.useState(false);

      React.useEffect(() => {
        // Update searchParams when search changes
        const url = new URL(window.location.href);
        setSearchParams(Promise.resolve(Object.fromEntries(url.searchParams)));
      }, [search]);

      React.useEffect(() => {
        // Update route params when pathname changes
        let cancelled = false;
        resolveRoute(pathname).then(info => {
          if (!cancelled) setParams(Promise.resolve(info.params || {}));
        });
        return () => { cancelled = true; };
      }, [pathname]);

      if (isNotFound && NotFoundComponent) {
        return React.createElement(NotFoundComponent);
      }
      if (isNotFound) {
        return React.createElement('div', { style: { padding: '20px', textAlign: 'center' } },
          React.createElement('h2', null, '404'),
          React.createElement('p', null, 'This page could not be found.')
        );
      }

      // Render the component via createElement so hooks work correctly
      try {
        return React.createElement(Component, { searchParams, params });
      } catch (e) {
        if (e && e.message === 'NEXT_NOT_FOUND') {
          // Will re-render with notFound on next tick
          if (!isNotFound) setIsNotFound(true);
          return null;
        }
        throw e; // Let ErrorBoundary handle it
      }
    }

    // Router component
    function Router() {
      const [Page, setPage] = React.useState(null);
      const [layouts, setLayouts] = React.useState([]);
      const [path, setPath] = React.useState(window.location.pathname);
      const [search, setSearch] = React.useState(window.location.search);

      React.useEffect(() => {
        Promise.all([loadPage(path), loadLayouts(path)]).then(([P, L]) => {
          if (P) setPage(() => P);
          setLayouts(L);
        });
      }, []);

      React.useEffect(() => {
        const handleNavigation = async () => {
          const newPath = window.location.pathname;
          const newSearch = window.location.search;
          console.log('[Router] handleNavigation called, newPath:', newPath, 'current path:', path);

          // Always update search params
          if (newSearch !== search) {
            setSearch(newSearch);
          }

          if (newPath !== path) {
            console.log('[Router] Path changed, loading new page...');
            setPath(newPath);
            const [P, L, routeInfo] = await Promise.all([loadPage(newPath), loadLayouts(newPath), resolveRoute(newPath)]);
            window.__NEXT_ROUTE_PARAMS__ = routeInfo.params || {};
            console.log('[Router] Page loaded:', !!P, 'Layouts:', L.length);
            if (P) setPage(() => P);
            setLayouts(L);
          } else {
            console.log('[Router] Path unchanged, skipping navigation');
          }
        };
        window.addEventListener('popstate', handleNavigation);
        console.log('[Router] Added popstate listener for path:', path);
        return () => window.removeEventListener('popstate', handleNavigation);
      }, [path, search]);

      if (!Page) return null;

      // Render page via PageWrapper so hooks work correctly
      // Pass search to force re-render when query params change
      let content = React.createElement(PageWrapper, { component: Page, pathname: path, search: search });

      // Wrap with loading.tsx Suspense fallback if it exists
      if (LoadingComponent) {
        content = React.createElement(React.Suspense,
          { fallback: React.createElement(LoadingComponent) },
          content
        );
      }

      // Wrap with error boundary if error.tsx exists
      if (ErrorComponent) {
        content = React.createElement(ErrorBoundary, { fallback: ErrorComponent }, content);
      }

      for (let i = layouts.length - 1; i >= 0; i--) {
        content = React.createElement(layouts[i], null, content);
      }
      return content;
    }

    // Mark that we've initialized (for testing no-reload)
    window.__NEXT_INITIALIZED__ = Date.now();

    ReactDOM.createRoot(document.getElementById('__next')).render(
      React.createElement(React.StrictMode, null, React.createElement(Router))
    );
  </script>
</body>
</html>`;
}

/**
 * Generate HTML shell for a Pages Router page
 */
export async function generatePageHtml(
  ctx: HtmlGeneratorContext,
  pageFile: string,
  pathname: string
): Promise<string> {
  // Use virtual server prefix for all file imports so the service worker can intercept them
  // Without this, /pages/index.jsx would go to localhost:5173/pages/index.jsx
  // instead of /__virtual__/3001/pages/index.jsx
  const virtualPrefix = `/__virtual__/${ctx.port}`;
  const pageModulePath = virtualPrefix + pageFile; // pageFile already starts with /

  // Check for global CSS files
  const globalCssLinks: string[] = [];
  const cssLocations = ['/styles/globals.css', '/styles/global.css', '/app/globals.css'];
  for (const cssPath of cssLocations) {
    if (ctx.exists(cssPath)) {
      globalCssLinks.push(`<link rel="stylesheet" href="${virtualPrefix}${cssPath}">`);
    }
  }

  // Generate env script for NEXT_PUBLIC_* variables
  const envScript = ctx.generateEnvScript();

  // Load Tailwind config if available (must be injected BEFORE CDN script)
  const tailwindConfigScript = await ctx.loadTailwindConfigIfNeeded();

  // Build additional import map entries from context
  const pagesAdditionalEntries = ctx.additionalImportMap
    ? Object.entries(ctx.additionalImportMap)
        .map(([key, value]) => `\n      "${key}": "${value}",`)
        .join('')
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="${virtualPrefix}/">
  <title>Next.js App</title>
  ${envScript}
  ${TAILWIND_CDN_SCRIPT}
  ${tailwindConfigScript}
  ${CORS_PROXY_SCRIPT}
  ${globalCssLinks.join('\n  ')}
  <script type="importmap">
  {
    "imports": {
      "react": "${REACT_CDN}?dev",
      "react/": "${REACT_CDN}&dev/",
      "react-dom": "${REACT_DOM_CDN}?dev",
      "react-dom/": "${REACT_DOM_CDN}&dev/",
      "react-dom/client": "${REACT_DOM_CDN}/client?dev",${pagesAdditionalEntries}
      "next/link": "${virtualPrefix}/_next/shims/link.js",
      "next/router": "${virtualPrefix}/_next/shims/router.js",
      "next/head": "${virtualPrefix}/_next/shims/head.js",
      "next/navigation": "${virtualPrefix}/_next/shims/navigation.js",
      "next/image": "${virtualPrefix}/_next/shims/image.js",
      "next/dynamic": "${virtualPrefix}/_next/shims/dynamic.js",
      "next/script": "${virtualPrefix}/_next/shims/script.js",
      "next/font/google": "${virtualPrefix}/_next/shims/font/google.js",
      "next/font/local": "${virtualPrefix}/_next/shims/font/local.js"
    }
  }
  </script>
  ${REACT_REFRESH_PREAMBLE}
  ${HMR_CLIENT_SCRIPT}
</head>
<body>
  <div id="__next"></div>
  <script type="module">
    import React from 'react';
    import ReactDOM from 'react-dom/client';

    const virtualBase = '${virtualPrefix}';

    // Convert URL path to page module path
    function getPageModulePath(pathname) {
      let route = pathname;
      if (route.startsWith(virtualBase)) {
        route = route.slice(virtualBase.length);
      }
      route = route.replace(/^\\/+/, '/') || '/';
      const modulePath = route === '/' ? '/index' : route;
      return virtualBase + '/_next/pages' + modulePath + '.js';
    }

    // Dynamic page loader
    async function loadPage(pathname) {
      const modulePath = getPageModulePath(pathname);
      try {
        const module = await import(/* @vite-ignore */ modulePath);
        return module.default;
      } catch (e) {
        console.error('[Navigation] Failed to load:', modulePath, e);
        return null;
      }
    }

    // Router component
    function Router() {
      const [Page, setPage] = React.useState(null);
      const [path, setPath] = React.useState(window.location.pathname);

      React.useEffect(() => {
        loadPage(path).then(C => C && setPage(() => C));
      }, []);

      React.useEffect(() => {
        const handleNavigation = async () => {
          const newPath = window.location.pathname;
          if (newPath !== path) {
            setPath(newPath);
            const C = await loadPage(newPath);
            if (C) setPage(() => C);
          }
        };
        window.addEventListener('popstate', handleNavigation);
        return () => window.removeEventListener('popstate', handleNavigation);
      }, [path]);

      if (!Page) return null;
      return React.createElement(Page);
    }

    // Mark that we've initialized (for testing no-reload)
    window.__NEXT_INITIALIZED__ = Date.now();

    ReactDOM.createRoot(document.getElementById('__next')).render(
      React.createElement(React.StrictMode, null, React.createElement(Router))
    );
  </script>
</body>
</html>`;
}

/**
 * Serve a basic 404 page
 */
export function serve404Page(port: number): ResponseData {
  const virtualPrefix = `/__virtual__/${port}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="${virtualPrefix}/">
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
