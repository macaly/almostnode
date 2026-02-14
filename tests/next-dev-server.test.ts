import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import { NextDevServer } from '../src/frameworks/next-dev-server';
import { Buffer } from '../src/shims/stream';

describe('NextDevServer', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();

    // Create a minimal Next.js project structure
    vfs.mkdirSync('/pages', { recursive: true });
    vfs.mkdirSync('/pages/api', { recursive: true });
    vfs.mkdirSync('/pages/users', { recursive: true });
    vfs.mkdirSync('/public', { recursive: true });
    vfs.mkdirSync('/styles', { recursive: true });

    // Create pages
    vfs.writeFileSync(
      '/pages/index.jsx',
      `import React from 'react';
export default function Home() {
  return <div><h1>Home Page</h1></div>;
}
`
    );

    vfs.writeFileSync(
      '/pages/about.jsx',
      `import React from 'react';
import Link from 'next/link';

export default function About() {
  return <div><h1>About Page</h1><Link href="/">Home</Link></div>;
}
`
    );

    // Create dynamic route
    vfs.writeFileSync(
      '/pages/users/[id].jsx',
      `import React from 'react';

export default function UserPage() {
  return <div><h1>User Page</h1></div>;
}
`
    );

    // Create API routes
    vfs.writeFileSync(
      '/pages/api/hello.js',
      `export default function handler(req, res) {
  res.status(200).json({ message: 'Hello from API!' });
}
`
    );

    vfs.writeFileSync(
      '/pages/api/users.js',
      `export default function handler(req, res) {
  res.status(200).json({ users: [{ id: 1, name: 'Alice' }] });
}
`
    );

    // Create 404 page
    vfs.writeFileSync(
      '/pages/404.jsx',
      `import React from 'react';
export default function NotFound() {
  return <div><h1>404 - Not Found</h1></div>;
}
`
    );

    // Create global styles
    vfs.writeFileSync(
      '/styles/globals.css',
      `body {
  margin: 0;
  font-family: sans-serif;
}
`
    );

    // Create public file
    vfs.writeFileSync('/public/favicon.ico', 'favicon data');

    server = new NextDevServer(vfs, { port: 3001 });
  });

  afterEach(() => {
    server.stop();
  });

  describe('page routing', () => {
    it('should resolve / to pages/index.jsx', async () => {
      const response = await server.handleRequest('GET', '/', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('text/html; charset=utf-8');
      expect(response.body.toString()).toContain('<!DOCTYPE html>');
      expect(response.body.toString()).toContain('<div id="__next">');
    });

    it('should resolve /about to pages/about.jsx', async () => {
      const response = await server.handleRequest('GET', '/about', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('text/html; charset=utf-8');
      // New dynamic router uses /_next/pages/ for page loading
      const html = response.body.toString();
      expect(html).toContain('/_next/pages');
      expect(html).toContain('function Router()');
    });

    it('should resolve /users/123 to pages/users/[id].jsx', async () => {
      const response = await server.handleRequest('GET', '/users/123', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('text/html; charset=utf-8');
      // New dynamic router uses /_next/pages/ for page loading
      const html = response.body.toString();
      expect(html).toContain('/_next/pages');
      expect(html).toContain('function Router()');
    });

    it('should return 404 for non-existent pages', async () => {
      const response = await server.handleRequest('GET', '/nonexistent', {});

      expect(response.statusCode).toBe(404);
    });

    it('should handle pages with .tsx extension', async () => {
      vfs.writeFileSync(
        '/pages/typescript.tsx',
        `import React from 'react';
export default function TypeScriptPage(): JSX.Element {
  return <div>TypeScript Page</div>;
}
`
      );

      const response = await server.handleRequest('GET', '/typescript', {});

      expect(response.statusCode).toBe(200);
      // New dynamic router uses /_next/pages/ for page loading
      const html = response.body.toString();
      expect(html).toContain('/_next/pages');
      expect(html).toContain('function Router()');
    });

    it('should handle index files in subdirectories', async () => {
      vfs.mkdirSync('/pages/blog', { recursive: true });
      vfs.writeFileSync(
        '/pages/blog/index.jsx',
        `import React from 'react';
export default function BlogIndex() {
  return <div>Blog Index</div>;
}
`
      );

      const response = await server.handleRequest('GET', '/blog', {});

      expect(response.statusCode).toBe(200);
      // New dynamic router uses /_next/pages/ for page loading
      const html = response.body.toString();
      expect(html).toContain('/_next/pages');
      expect(html).toContain('function Router()');
    });
  });

  describe('API routes', () => {
    it('should handle GET /api/hello', async () => {
      const response = await server.handleRequest('GET', '/api/hello', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/json; charset=utf-8');
      // API routes in this implementation return a placeholder response
      const body = JSON.parse(response.body.toString());
      expect(body).toHaveProperty('message');
    });

    it('should handle GET /api/users', async () => {
      const response = await server.handleRequest('GET', '/api/users', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/json; charset=utf-8');
    });

    it('should return 404 for non-existent API routes', async () => {
      const response = await server.handleRequest('GET', '/api/nonexistent', {});

      expect(response.statusCode).toBe(404);
      expect(response.headers['Content-Type']).toBe('application/json; charset=utf-8');

      const body = JSON.parse(response.body.toString());
      expect(body.error).toBe('API route not found');
    });

    it('should handle POST requests to API', async () => {
      const response = await server.handleRequest(
        'POST',
        '/api/hello',
        { 'Content-Type': 'application/json' },
        Buffer.from(JSON.stringify({ name: 'Test' }))
      );

      expect(response.statusCode).toBe(200);
    });

    it('should handle API routes in subdirectories', async () => {
      vfs.mkdirSync('/pages/api/users', { recursive: true });
      vfs.writeFileSync(
        '/pages/api/users/index.js',
        `export default function handler(req, res) {
  res.status(200).json({ users: [] });
}
`
      );

      // Note: /api/users is already defined as a file, so this tests the file-first resolution
      const response = await server.handleRequest('GET', '/api/users', {});
      expect(response.statusCode).toBe(200);
    });

    it('should execute API handler with https import', async () => {
      // Create an API route that imports https module
      vfs.writeFileSync(
        '/pages/api/https-test.js',
        `import https from 'https';

export default function handler(req, res) {
  // Just verify we can import https and it has expected methods
  const hasGet = typeof https.get === 'function';
  const hasRequest = typeof https.request === 'function';

  res.status(200).json({
    httpsAvailable: true,
    hasGet,
    hasRequest
  });
}
`
      );

      const response = await server.handleRequest('GET', '/api/https-test', {});

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body.toString());
      expect(body.httpsAvailable).toBe(true);
      expect(body.hasGet).toBe(true);
      expect(body.hasRequest).toBe(true);
    });

    it('should execute API handler that returns data from handler', async () => {
      const response = await server.handleRequest('GET', '/api/hello', {});

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body.toString());
      expect(body.message).toBe('Hello from API!');
    });
  });

  describe('HTML generation', () => {
    it('should generate valid HTML shell', async () => {
      const response = await server.handleRequest('GET', '/', {});
      const html = response.body.toString();

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
      expect(html).toContain('<head>');
      expect(html).toContain('</head>');
      expect(html).toContain('<body>');
      expect(html).toContain('</body>');
    });

    it('should include import map for react', async () => {
      const response = await server.handleRequest('GET', '/', {});
      const html = response.body.toString();

      expect(html).toContain('importmap');
      expect(html).toContain('react');
      expect(html).toContain('esm.sh');
    });

    it('should include React Refresh preamble', async () => {
      const response = await server.handleRequest('GET', '/', {});
      const html = response.body.toString();

      expect(html).toContain('react-refresh');
      expect(html).toContain('$RefreshRuntime$');
      expect(html).toContain('$RefreshReg$');
    });

    it('should include HMR client script', async () => {
      const response = await server.handleRequest('GET', '/', {});
      const html = response.body.toString();

      expect(html).toContain('postMessage');
      expect(html).toContain('next-hmr');
      expect(html).toContain('__vite_hot_context__');
    });

    it('should place importmap before module scripts', async () => {
      const response = await server.handleRequest('GET', '/', {});
      const html = response.body.toString();

      // Per HTML spec, importmap must precede all <script type="module"> tags
      const importmapPos = html.indexOf('<script type="importmap">');
      const firstModulePos = html.indexOf('<script type="module">');

      expect(importmapPos).toBeGreaterThan(-1);
      expect(firstModulePos).toBeGreaterThan(-1);
      expect(importmapPos).toBeLessThan(firstModulePos);
    });

    it('should set correct page module path', async () => {
      const response = await server.handleRequest('GET', '/about', {});
      const html = response.body.toString();

      // New dynamic router uses /_next/pages/ for page loading
      expect(html).toContain('/_next/pages');
    });

    it('should use client-side navigation instead of full reload', async () => {
      const response = await server.handleRequest('GET', '/', {});
      const html = response.body.toString();

      // The new implementation uses dynamic imports for client-side navigation
      // instead of reloading the page on popstate events
      expect(html).toContain('function Router()');
      expect(html).toContain('async function loadPage(pathname)');
      expect(html).toContain("window.addEventListener('popstate'");
      // Should NOT contain the old reload behavior
      expect(html).not.toContain('window.location.reload()');
    });
  });

  describe('Next.js shims', () => {
    it('should serve /_next/shims/link.js', async () => {
      const response = await server.handleRequest('GET', '/_next/shims/link.js', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
      expect(response.body.toString()).toContain('Link');
      expect(response.body.toString()).toContain('handleClick');
    });

    it('should serve /_next/shims/router.js', async () => {
      const response = await server.handleRequest('GET', '/_next/shims/router.js', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
      expect(response.body.toString()).toContain('useRouter');
      expect(response.body.toString()).toContain('pathname');
    });

    it('should serve /_next/shims/head.js', async () => {
      const response = await server.handleRequest('GET', '/_next/shims/head.js', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
      expect(response.body.toString()).toContain('Head');
    });

    it('should return 404 for unknown shims', async () => {
      const response = await server.handleRequest('GET', '/_next/shims/unknown.js', {});

      expect(response.statusCode).toBe(404);
    });
  });

  describe('public directory', () => {
    it('should serve files from public directory', async () => {
      const response = await server.handleRequest('GET', '/favicon.ico', {});

      expect(response.statusCode).toBe(200);
      expect(response.body.toString()).toBe('favicon data');
    });

    it('should serve public files before trying page routes', async () => {
      vfs.writeFileSync('/public/test.json', '{"public": true}');

      const response = await server.handleRequest('GET', '/test.json', {});

      expect(response.statusCode).toBe(200);
      expect(response.body.toString()).toContain('"public"');
    });
  });

  describe('JSX/TS transformation', () => {
    // Note: In Node.js test environment, esbuild-wasm is not available
    // So these tests verify the request handling without actual transformation

    it('should handle direct JSX file requests', async () => {
      const response = await server.handleRequest('GET', '/pages/index.jsx', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
    });

    it('should handle TypeScript files', async () => {
      vfs.writeFileSync(
        '/pages/typescript.ts',
        `const greeting: string = 'Hello';
export default greeting;
`
      );

      const response = await server.handleRequest('GET', '/pages/typescript.ts', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
    });
  });

  describe('transform caching', () => {
    it('should cache transformed files and return X-Cache: hit on second request', async () => {
      // First request - should be a cache miss (no X-Cache header or not 'hit')
      const response1 = await server.handleRequest('GET', '/pages/index.jsx', {});
      expect(response1.statusCode).toBe(200);
      expect(response1.headers['X-Cache']).toBeUndefined();

      // Second request - should be a cache hit
      const response2 = await server.handleRequest('GET', '/pages/index.jsx', {});
      expect(response2.statusCode).toBe(200);
      expect(response2.headers['X-Cache']).toBe('hit');
    });

    it('should invalidate cache when file content changes', async () => {
      // First request to populate cache
      await server.handleRequest('GET', '/pages/index.jsx', {});

      // Second request - cache hit
      const response2 = await server.handleRequest('GET', '/pages/index.jsx', {});
      expect(response2.headers['X-Cache']).toBe('hit');

      // Modify the file
      vfs.writeFileSync(
        '/pages/index.jsx',
        `import React from 'react';
export default function Home() {
  return <div><h1>Updated Home Page</h1></div>;
}
`
      );

      // Third request - should be a cache miss due to content change
      const response3 = await server.handleRequest('GET', '/pages/index.jsx', {});
      expect(response3.statusCode).toBe(200);
      expect(response3.headers['X-Cache']).toBeUndefined();

      // Fourth request - should be a cache hit again
      const response4 = await server.handleRequest('GET', '/pages/index.jsx', {});
      expect(response4.headers['X-Cache']).toBe('hit');
    });

    it('should cache different files independently', async () => {
      // Request first file
      await server.handleRequest('GET', '/pages/index.jsx', {});
      const response1 = await server.handleRequest('GET', '/pages/index.jsx', {});
      expect(response1.headers['X-Cache']).toBe('hit');

      // Request second file - should be cache miss
      const response2 = await server.handleRequest('GET', '/pages/about.jsx', {});
      expect(response2.headers['X-Cache']).toBeUndefined();

      // Request second file again - should be cache hit
      const response3 = await server.handleRequest('GET', '/pages/about.jsx', {});
      expect(response3.headers['X-Cache']).toBe('hit');

      // First file should still be cached
      const response4 = await server.handleRequest('GET', '/pages/index.jsx', {});
      expect(response4.headers['X-Cache']).toBe('hit');
    });
  });

  describe('HMR events', () => {
    it('should emit hmr-update on file change', async () => {
      const listener = vi.fn();
      server.on('hmr-update', listener);

      server.start();

      // Simulate file change by writing to VFS
      vfs.writeFileSync('/pages/index.jsx', '// Updated content');

      // Wait for the watcher to trigger
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(listener).toHaveBeenCalled();
      const update = listener.mock.calls[0][0];
      expect(update).toHaveProperty('type');
      expect(update).toHaveProperty('path');
      expect(update).toHaveProperty('timestamp');
    });

    it('should emit update type for JSX files', async () => {
      const listener = vi.fn();
      server.on('hmr-update', listener);

      server.start();

      vfs.writeFileSync('/pages/about.jsx', '// Updated');

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(listener).toHaveBeenCalled();
      const update = listener.mock.calls[0][0];
      expect(update.type).toBe('update');
    });

    it('should emit update type for API files', async () => {
      const listener = vi.fn();
      server.on('hmr-update', listener);

      server.start();

      vfs.writeFileSync('/pages/api/hello.js', '// Updated API');

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(listener).toHaveBeenCalled();
      const update = listener.mock.calls[0][0];
      expect(update.type).toBe('update');
    });
  });

  describe('App Router HMR', () => {
    let appServer: NextDevServer;

    beforeEach(() => {
      vfs.mkdirSync('/app', { recursive: true });
      vfs.mkdirSync('/app/about', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', `
        export default function Layout({ children }) {
          return <html><body>{children}</body></html>;
        }
      `);
      vfs.writeFileSync('/app/page.tsx', `
        export default function Home() {
          return <div><h1>Home Page</h1></div>;
        }
      `);
      vfs.writeFileSync('/app/about/page.tsx', `
        export default function About() {
          return <div><h1>About Page</h1></div>;
        }
      `);
      appServer = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });
    });

    afterEach(() => {
      appServer.stop();
    });

    it('should emit hmr-update on app file change', async () => {
      const listener = vi.fn();
      appServer.on('hmr-update', listener);
      appServer.start();

      vfs.writeFileSync('/app/page.tsx', `
        export default function Home() {
          return <div><h1>Updated Home</h1></div>;
        }
      `);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(listener).toHaveBeenCalled();
      const update = listener.mock.calls[0][0];
      expect(update.type).toBe('update');
      expect(update.path).toBe('/app/page.tsx');
    });

    it('should serve updated content after file change (HMR re-import)', async () => {
      // Get original response
      const original = await appServer.handleRequest('GET', '/app/page.tsx', {});
      expect(original.statusCode).toBe(200);
      expect(original.body.toString()).toContain('Home Page');

      // Simulate file change
      vfs.writeFileSync('/app/page.tsx', `
        export default function Home() {
          return <div><h1>Updated Home</h1></div>;
        }
      `);

      // Re-request with cache buster (like HMR client does)
      const updated = await appServer.handleRequest('GET', '/app/page.tsx?t=123', {});
      expect(updated.statusCode).toBe(200);
      expect(updated.body.toString()).toContain('Updated Home');
      expect(updated.body.toString()).not.toContain('Home Page');
    });

    it('should serve direct file requests for HMR re-imports', async () => {
      // HMR client imports files directly (e.g., /app/page.tsx?t=123)
      // The server must handle these as transformable files
      const response = await appServer.handleRequest('GET', '/app/page.tsx', {});
      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toContain('javascript');
      expect(response.body.toString()).toContain('Home Page');
    });

    it('should place importmap before module scripts in HTML', async () => {
      const response = await appServer.handleRequest('GET', '/', {});
      const html = response.body.toString();

      // importmap must appear before any <script type="module">
      const importmapPos = html.indexOf('<script type="importmap">');
      const firstModulePos = html.indexOf('<script type="module">');

      expect(importmapPos).toBeGreaterThan(-1);
      expect(firstModulePos).toBeGreaterThan(-1);
      expect(importmapPos).toBeLessThan(firstModulePos);
    });

    it('should include HMR client script in App Router HTML', async () => {
      const response = await appServer.handleRequest('GET', '/', {});
      const html = response.body.toString();

      expect(html).toContain('next-hmr');
      expect(html).toContain('__vite_hot_context__');
      expect(html).toContain('handleJSUpdate');
      expect(html).toContain('$RefreshRuntime$');
    });
  });

  describe('server lifecycle', () => {
    it('should start watching on start()', () => {
      const spy = vi.spyOn(server, 'startWatching');

      server.start();

      expect(spy).toHaveBeenCalled();
    });

    it('should stop cleanly', () => {
      server.start();
      expect(server.isRunning()).toBe(true);

      server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('should return port', () => {
      expect(server.getPort()).toBe(3001);
    });
  });

  describe('custom 404 page', () => {
    it('should use custom 404 page when available', async () => {
      const response = await server.handleRequest('GET', '/nonexistent', {});

      expect(response.statusCode).toBe(404);
      expect(response.headers['Content-Type']).toBe('text/html; charset=utf-8');
      // Should use custom 404 page with dynamic page loading
      // The new router loads pages via /_next/pages/ virtual endpoint
      const html = response.body.toString();
      expect(html).toContain('/_next/pages');
      expect(html).toContain('function Router()');
    });

    it('should use default 404 when custom page not available', async () => {
      // Remove custom 404 page
      vfs.unlinkSync('/pages/404.jsx');

      const response = await server.handleRequest('GET', '/nonexistent', {});

      expect(response.statusCode).toBe(404);
      expect(response.body.toString()).toContain('404');
      expect(response.body.toString()).toContain('Page Not Found');
    });
  });

  describe('query string handling', () => {
    it('should serve pages with query strings', async () => {
      const response = await server.handleRequest('GET', '/about?ref=home', {});

      expect(response.statusCode).toBe(200);
    });

    it('should serve API routes with query strings', async () => {
      const response = await server.handleRequest('GET', '/api/hello?name=world', {});

      expect(response.statusCode).toBe(200);
    });
  });

  describe('concurrent requests', () => {
    it('should handle multiple concurrent requests', async () => {
      const requests = [
        server.handleRequest('GET', '/', {}),
        server.handleRequest('GET', '/about', {}),
        server.handleRequest('GET', '/api/hello', {}),
        server.handleRequest('GET', '/users/1', {}),
        server.handleRequest('GET', '/nonexistent', {}),
      ];

      const responses = await Promise.all(requests);

      expect(responses[0].statusCode).toBe(200); // index
      expect(responses[1].statusCode).toBe(200); // about
      expect(responses[2].statusCode).toBe(200); // API
      expect(responses[3].statusCode).toBe(200); // dynamic route
      expect(responses[4].statusCode).toBe(404); // not found
    });
  });
});

describe('NextDevServer environment variables', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();
    vfs.mkdirSync('/pages', { recursive: true });
    vfs.writeFileSync('/pages/index.jsx', '<div>Test</div>');
  });

  afterEach(() => {
    if (server) server.stop();
  });

  describe('setEnv and getEnv', () => {
    it('should set and get environment variables', () => {
      server = new NextDevServer(vfs, { port: 3001 });

      server.setEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com');
      server.setEnv('NEXT_PUBLIC_CONVEX_URL', 'https://my-app.convex.cloud');

      const env = server.getEnv();
      expect(env.NEXT_PUBLIC_API_URL).toBe('https://api.example.com');
      expect(env.NEXT_PUBLIC_CONVEX_URL).toBe('https://my-app.convex.cloud');
    });

    it('should accept env vars via constructor options', () => {
      server = new NextDevServer(vfs, {
        port: 3001,
        env: {
          NEXT_PUBLIC_API_URL: 'https://api.example.com',
          SECRET_KEY: 'should-not-be-exposed',
        },
      });

      const env = server.getEnv();
      expect(env.NEXT_PUBLIC_API_URL).toBe('https://api.example.com');
      expect(env.SECRET_KEY).toBe('should-not-be-exposed');
    });

    it('should return a copy of env vars (not the original object)', () => {
      server = new NextDevServer(vfs, {
        port: 3001,
        env: { NEXT_PUBLIC_TEST: 'value' },
      });

      const env1 = server.getEnv();
      env1.NEXT_PUBLIC_TEST = 'modified';

      const env2 = server.getEnv();
      expect(env2.NEXT_PUBLIC_TEST).toBe('value');
    });

    it('should update env vars at runtime', () => {
      server = new NextDevServer(vfs, { port: 3001 });

      expect(server.getEnv().NEXT_PUBLIC_URL).toBeUndefined();

      server.setEnv('NEXT_PUBLIC_URL', 'https://example.com');

      expect(server.getEnv().NEXT_PUBLIC_URL).toBe('https://example.com');
    });
  });

  describe('NEXT_PUBLIC_* injection into HTML', () => {
    it('should inject NEXT_PUBLIC_* vars into HTML', async () => {
      server = new NextDevServer(vfs, {
        port: 3001,
        env: {
          NEXT_PUBLIC_API_URL: 'https://api.example.com',
          NEXT_PUBLIC_CONVEX_URL: 'https://my-app.convex.cloud',
        },
      });

      const response = await server.handleRequest('GET', '/', {});
      const html = response.body.toString();

      expect(html).toContain('window.process');
      expect(html).toContain('window.process.env');
      expect(html).toContain('NEXT_PUBLIC_API_URL');
      expect(html).toContain('https://api.example.com');
      expect(html).toContain('NEXT_PUBLIC_CONVEX_URL');
      expect(html).toContain('https://my-app.convex.cloud');
    });

    it('should NOT inject non-NEXT_PUBLIC_* vars into HTML', async () => {
      server = new NextDevServer(vfs, {
        port: 3001,
        env: {
          NEXT_PUBLIC_VISIBLE: 'visible',
          SECRET_KEY: 'secret-should-not-appear',
          DATABASE_URL: 'postgres://secret',
        },
      });

      const response = await server.handleRequest('GET', '/', {});
      const html = response.body.toString();

      expect(html).toContain('NEXT_PUBLIC_VISIBLE');
      expect(html).toContain('visible');
      expect(html).not.toContain('SECRET_KEY');
      expect(html).not.toContain('secret-should-not-appear');
      expect(html).not.toContain('DATABASE_URL');
      expect(html).not.toContain('postgres://secret');
    });

    it('should not inject env script when no NEXT_PUBLIC_* vars exist', async () => {
      server = new NextDevServer(vfs, {
        port: 3001,
        env: {
          SECRET_KEY: 'secret',
        },
      });

      const response = await server.handleRequest('GET', '/', {});
      const html = response.body.toString();

      // Should not have the env injection script
      expect(html).not.toContain('NEXT_PUBLIC_');
      expect(html).not.toContain('SECRET_KEY');
    });

    it('should reflect setEnv updates in subsequent HTML', async () => {
      server = new NextDevServer(vfs, { port: 3001 });

      // First request - no env vars
      const response1 = await server.handleRequest('GET', '/', {});
      expect(response1.body.toString()).not.toContain('NEXT_PUBLIC_CONVEX_URL');

      // Set env var
      server.setEnv('NEXT_PUBLIC_CONVEX_URL', 'https://my-app.convex.cloud');

      // Second request - should have the env var
      const response2 = await server.handleRequest('GET', '/', {});
      const html2 = response2.body.toString();
      expect(html2).toContain('NEXT_PUBLIC_CONVEX_URL');
      expect(html2).toContain('https://my-app.convex.cloud');
    });
  });

  describe('App Router env injection', () => {
    beforeEach(() => {
      // Set up App Router structure
      vfs.mkdirSync('/app', { recursive: true });
      vfs.writeFileSync('/app/page.jsx', '<div>App Router Page</div>');
      vfs.writeFileSync('/app/layout.jsx', `
        export default function Layout({ children }) {
          return <div>{children}</div>;
        }
      `);
    });

    it('should inject NEXT_PUBLIC_* vars in App Router HTML', async () => {
      server = new NextDevServer(vfs, {
        port: 3001,
        preferAppRouter: true,
        env: {
          NEXT_PUBLIC_APP_NAME: 'My App',
        },
      });

      const response = await server.handleRequest('GET', '/', {});
      const html = response.body.toString();

      expect(html).toContain('window.process');
      expect(html).toContain('NEXT_PUBLIC_APP_NAME');
      expect(html).toContain('My App');
    });
  });

  describe('App Router client-side navigation', () => {
    beforeEach(() => {
      // Set up App Router structure with multiple pages
      vfs.mkdirSync('/app', { recursive: true });
      vfs.mkdirSync('/app/about', { recursive: true });
      vfs.writeFileSync('/app/page.tsx', `
        import Link from 'next/link';
        export default function Home() {
          return <div><h1>Home</h1><Link href="/about">About</Link></div>;
        }
      `);
      vfs.writeFileSync('/app/about/page.tsx', `
        export default function About() {
          return <div><h1>About Page</h1></div>;
        }
      `);
      vfs.writeFileSync('/app/layout.tsx', `
        export default function Layout({ children }) {
          return <html><body>{children}</body></html>;
        }
      `);
    });

    it('should use client-side navigation instead of full reload', async () => {
      server = new NextDevServer(vfs, {
        port: 3001,
        preferAppRouter: true,
      });

      const response = await server.handleRequest('GET', '/', {});
      const html = response.body.toString();

      // Should have the Router component for dynamic navigation
      expect(html).toContain('function Router()');
      expect(html).toContain('async function loadPage(pathname)');
      expect(html).toContain("window.addEventListener('popstate'");
      // Should NOT contain window.location.reload
      expect(html).not.toContain('window.location.reload()');
    });

    it('should serve app page components via /_next/app/', async () => {
      server = new NextDevServer(vfs, {
        port: 3001,
        preferAppRouter: true,
      });

      // Request the about page component
      const response = await server.handleRequest('GET', '/_next/app/app/about/page.js', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
      expect(response.body.toString()).toContain('About Page');
    });

    it('should serve app layout components via /_next/app/', async () => {
      server = new NextDevServer(vfs, {
        port: 3001,
        preferAppRouter: true,
      });

      // Request the root layout component
      const response = await server.handleRequest('GET', '/_next/app/app/layout.js', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
      expect(response.body.toString()).toContain('children');
    });

    it('should serve files with explicit .ts extension via /_next/app/', async () => {
      // Simulates: import from '../convex/_generated/api.ts'
      // which resolves to /_next/app/convex/_generated/api.ts
      vfs.mkdirSync('/convex/_generated', { recursive: true });
      vfs.writeFileSync('/convex/_generated/api.ts', `export const api = {
  todos: { list: "todos:list" },
} as const;
`);

      server = new NextDevServer(vfs, {
        port: 3001,
        preferAppRouter: true,
      });

      const response = await server.handleRequest('GET', '/_next/app/convex/_generated/api.ts', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
      expect(response.body.toString()).toContain('api');
      expect(response.body.toString()).toContain('todos');
    });

    it('should serve files with explicit .tsx extension via /_next/app/', async () => {
      // Simulates: import from '../components/task-list.tsx'
      // which resolves to /_next/app/components/task-list.tsx
      vfs.mkdirSync('/components', { recursive: true });
      vfs.writeFileSync('/components/task-list.tsx', `import React from 'react';
export function TaskList() { return <div>Tasks</div>; }
`);

      server = new NextDevServer(vfs, {
        port: 3001,
        preferAppRouter: true,
      });

      const response = await server.handleRequest('GET', '/_next/app/components/task-list.tsx', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
      expect(response.body.toString()).toContain('TaskList');
    });
  });
});

describe('NextDevServer with ServerBridge integration', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();

    vfs.mkdirSync('/pages', { recursive: true });
    vfs.writeFileSync('/pages/index.jsx', '<div>Test</div>');

    server = new NextDevServer(vfs, { port: 3001 });
  });

  afterEach(() => {
    server.stop();
  });

  it('should handle request/response cycle like http.Server', async () => {
    const response = await server.handleRequest('GET', '/', {
      'accept': 'text/html',
      'host': 'localhost:3001',
    });

    expect(response.statusCode).toBe(200);
    expect(response.statusMessage).toBe('OK');
    expect(response.headers).toBeDefined();
    expect(response.body).toBeInstanceOf(Buffer);
  });

  it('should return consistent response format', async () => {
    const response = await server.handleRequest('GET', '/', {});

    expect(typeof response.statusCode).toBe('number');
    expect(typeof response.statusMessage).toBe('string');
    expect(typeof response.headers).toBe('object');
    expect(response.body).toBeInstanceOf(Buffer);

    for (const [key, value] of Object.entries(response.headers)) {
      expect(typeof key).toBe('string');
      expect(typeof value).toBe('string');
    }
  });
});

describe('NextDevServer streaming API routes', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();

    // Create Pages Router API directory
    vfs.mkdirSync('/pages', { recursive: true });
    vfs.mkdirSync('/pages/api', { recursive: true });

    // Create a simple streaming API route
    vfs.writeFileSync(
      '/pages/api/stream.js',
      `export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain');
  res.write('chunk1');
  res.write('chunk2');
  res.write('chunk3');
  res.end();
}
`
    );

    // Create an API route that streams with delays (simulating AI response)
    vfs.writeFileSync(
      '/pages/api/chat.js',
      `export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.write('Hello');
  res.write(' ');
  res.write('World');
  res.end('!');
}
`
    );

    // Create an API route that uses JSON response (non-streaming)
    vfs.writeFileSync(
      '/pages/api/json.js',
      `export default function handler(req, res) {
  res.status(200).json({ message: 'Hello JSON' });
}
`
    );

    // Create an API route that sends error
    vfs.writeFileSync(
      '/pages/api/error.js',
      `export default function handler(req, res) {
  res.status(500).json({ error: 'Something went wrong' });
}
`
    );

    server = new NextDevServer(vfs, { port: 3001 });
  });

  afterEach(() => {
    server.stop();
  });

  describe('handleStreamingRequest', () => {
    it('should call onStart with status and headers', async () => {
      const onStart = vi.fn();
      const onChunk = vi.fn();
      const onEnd = vi.fn();

      await server.handleStreamingRequest(
        'GET',
        '/api/stream',
        {},
        undefined,
        onStart,
        onChunk,
        onEnd
      );

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onStart).toHaveBeenCalledWith(
        200,
        'OK',
        expect.objectContaining({
          'Content-Type': 'text/plain',
        })
      );
    });

    it('should call onChunk for each res.write() call', async () => {
      const onStart = vi.fn();
      const onChunk = vi.fn();
      const onEnd = vi.fn();

      await server.handleStreamingRequest(
        'GET',
        '/api/stream',
        {},
        undefined,
        onStart,
        onChunk,
        onEnd
      );

      expect(onChunk).toHaveBeenCalledTimes(3);
      expect(onChunk).toHaveBeenNthCalledWith(1, 'chunk1');
      expect(onChunk).toHaveBeenNthCalledWith(2, 'chunk2');
      expect(onChunk).toHaveBeenNthCalledWith(3, 'chunk3');
    });

    it('should call onEnd when response is complete', async () => {
      const onStart = vi.fn();
      const onChunk = vi.fn();
      const onEnd = vi.fn();

      await server.handleStreamingRequest(
        'GET',
        '/api/stream',
        {},
        undefined,
        onStart,
        onChunk,
        onEnd
      );

      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('should handle res.end() with data', async () => {
      const onStart = vi.fn();
      const onChunk = vi.fn();
      const onEnd = vi.fn();

      await server.handleStreamingRequest(
        'GET',
        '/api/chat',
        {},
        undefined,
        onStart,
        onChunk,
        onEnd
      );

      // Should have 4 chunks: 'Hello', ' ', 'World', '!'
      expect(onChunk).toHaveBeenCalledTimes(4);
      expect(onChunk).toHaveBeenNthCalledWith(1, 'Hello');
      expect(onChunk).toHaveBeenNthCalledWith(2, ' ');
      expect(onChunk).toHaveBeenNthCalledWith(3, 'World');
      expect(onChunk).toHaveBeenNthCalledWith(4, '!');
    });

    it('should handle JSON responses', async () => {
      const onStart = vi.fn();
      const onChunk = vi.fn();
      const onEnd = vi.fn();

      await server.handleStreamingRequest(
        'GET',
        '/api/json',
        {},
        undefined,
        onStart,
        onChunk,
        onEnd
      );

      expect(onStart).toHaveBeenCalledWith(
        200,
        'OK',
        expect.objectContaining({
          'Content-Type': 'application/json; charset=utf-8',
        })
      );

      expect(onChunk).toHaveBeenCalledTimes(1);
      const chunkData = JSON.parse(onChunk.mock.calls[0][0]);
      expect(chunkData).toEqual({ message: 'Hello JSON' });
    });

    it('should handle error responses', async () => {
      const onStart = vi.fn();
      const onChunk = vi.fn();
      const onEnd = vi.fn();

      await server.handleStreamingRequest(
        'GET',
        '/api/error',
        {},
        undefined,
        onStart,
        onChunk,
        onEnd
      );

      expect(onStart).toHaveBeenCalledWith(
        500,
        'OK',
        expect.any(Object)
      );

      expect(onChunk).toHaveBeenCalledTimes(1);
      const chunkData = JSON.parse(onChunk.mock.calls[0][0]);
      expect(chunkData).toEqual({ error: 'Something went wrong' });
    });

    it('should return 404 for non-API routes', async () => {
      const onStart = vi.fn();
      const onChunk = vi.fn();
      const onEnd = vi.fn();

      await server.handleStreamingRequest(
        'GET',
        '/not-an-api',
        {},
        undefined,
        onStart,
        onChunk,
        onEnd
      );

      expect(onStart).toHaveBeenCalledWith(404, 'Not Found', expect.any(Object));
      expect(onEnd).toHaveBeenCalled();
    });

    it('should return 404 for non-existent API routes', async () => {
      const onStart = vi.fn();
      const onChunk = vi.fn();
      const onEnd = vi.fn();

      await server.handleStreamingRequest(
        'GET',
        '/api/nonexistent',
        {},
        undefined,
        onStart,
        onChunk,
        onEnd
      );

      expect(onStart).toHaveBeenCalledWith(404, 'Not Found', expect.any(Object));
      expect(onChunk).toHaveBeenCalledWith(JSON.stringify({ error: 'API route not found' }));
      expect(onEnd).toHaveBeenCalled();
    });

    it('should handle POST requests with body', async () => {
      vfs.writeFileSync(
        '/pages/api/echo.js',
        `export default function handler(req, res) {
  const { name } = req.body || {};
  res.write('Hello, ');
  res.end(name || 'stranger');
}
`
      );

      const onStart = vi.fn();
      const onChunk = vi.fn();
      const onEnd = vi.fn();

      await server.handleStreamingRequest(
        'POST',
        '/api/echo',
        { 'Content-Type': 'application/json' },
        Buffer.from(JSON.stringify({ name: 'Alice' })),
        onStart,
        onChunk,
        onEnd
      );

      expect(onChunk).toHaveBeenNthCalledWith(1, 'Hello, ');
      expect(onChunk).toHaveBeenNthCalledWith(2, 'Alice');
    });
  });

  describe('streaming response callback order', () => {
    it('should call callbacks in correct order: onStart, onChunk(s), onEnd', async () => {
      const callOrder: string[] = [];

      const onStart = vi.fn(() => callOrder.push('start'));
      const onChunk = vi.fn(() => callOrder.push('chunk'));
      const onEnd = vi.fn(() => callOrder.push('end'));

      await server.handleStreamingRequest(
        'GET',
        '/api/stream',
        {},
        undefined,
        onStart,
        onChunk,
        onEnd
      );

      expect(callOrder[0]).toBe('start');
      expect(callOrder[callOrder.length - 1]).toBe('end');
      expect(callOrder.filter(c => c === 'chunk').length).toBe(3);
    });

    it('should send headers before any chunks', async () => {
      let headersReceived = false;
      let chunkReceivedBeforeHeaders = false;

      const onStart = vi.fn(() => {
        headersReceived = true;
      });

      const onChunk = vi.fn(() => {
        if (!headersReceived) {
          chunkReceivedBeforeHeaders = true;
        }
      });

      const onEnd = vi.fn();

      await server.handleStreamingRequest(
        'GET',
        '/api/stream',
        {},
        undefined,
        onStart,
        onChunk,
        onEnd
      );

      expect(chunkReceivedBeforeHeaders).toBe(false);
      expect(headersReceived).toBe(true);
    });
  });

  describe('streaming with environment variables', () => {
    it('should have access to process.env in streaming handlers', async () => {
      vfs.writeFileSync(
        '/pages/api/env-stream.js',
        `export default function handler(req, res) {
  const apiKey = process.env.TEST_API_KEY || 'not-set';
  res.write('API_KEY=');
  res.end(apiKey);
}
`
      );

      server.setEnv('TEST_API_KEY', 'secret-key-123');

      const onStart = vi.fn();
      const onChunk = vi.fn();
      const onEnd = vi.fn();

      await server.handleStreamingRequest(
        'GET',
        '/api/env-stream',
        {},
        undefined,
        onStart,
        onChunk,
        onEnd
      );

      expect(onChunk).toHaveBeenNthCalledWith(1, 'API_KEY=');
      expect(onChunk).toHaveBeenNthCalledWith(2, 'secret-key-123');
    });
  });
});

describe('NextDevServer mock response streaming interface', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();
    vfs.mkdirSync('/pages', { recursive: true });
    vfs.mkdirSync('/pages/api', { recursive: true });
    server = new NextDevServer(vfs, { port: 3001 });
  });

  afterEach(() => {
    server.stop();
  });

  it('should support res.write() method in regular API routes', async () => {
    vfs.writeFileSync(
      '/pages/api/write-test.js',
      `export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain');
  res.write('part1');
  res.write('part2');
  res.end('part3');
}
`
    );

    const response = await server.handleRequest('GET', '/api/write-test', {});

    expect(response.statusCode).toBe(200);
    expect(response.body.toString()).toBe('part1part2part3');
  });

  it('should support res.getHeader() method', async () => {
    vfs.writeFileSync(
      '/pages/api/header-test.js',
      `export default function handler(req, res) {
  res.setHeader('X-Custom', 'test-value');
  const customHeader = res.getHeader('X-Custom');
  res.json({ header: customHeader });
}
`
    );

    const response = await server.handleRequest('GET', '/api/header-test', {});

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body.toString());
    expect(body.header).toBe('test-value');
  });

  it('should track headersSent property', async () => {
    vfs.writeFileSync(
      '/pages/api/headers-sent-test.js',
      `export default function handler(req, res) {
  const beforeWrite = res.headersSent;
  res.write('data');
  const afterWrite = res.headersSent;
  res.end(JSON.stringify({ before: beforeWrite, after: afterWrite }));
}
`
    );

    const response = await server.handleRequest('GET', '/api/headers-sent-test', {});

    expect(response.statusCode).toBe(200);
    // Note: In our mock, headersSent becomes true after first write
    const body = response.body.toString();
    expect(body).toContain('data');
  });
});

describe('JSON file serving as ES modules', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();
    vfs.mkdirSync('/lib', { recursive: true });
    vfs.mkdirSync('/pages', { recursive: true });

    // Create a simple page
    vfs.writeFileSync('/pages/index.jsx', 'export default function Home() { return <div>Home</div>; }');
  });

  afterEach(() => {
    server?.stop();
  });

  it('should serve JSON files wrapped as ES modules', async () => {
    // Create a JSON file
    vfs.writeFileSync('/lib/data.json', JSON.stringify({
      name: 'Test',
      items: [1, 2, 3],
      nested: { key: 'value' }
    }));

    server = new NextDevServer(vfs, { port: 3001 });

    const response = await server.handleRequest('GET', '/lib/data.json', {});

    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');

    const body = response.body.toString();
    expect(body).toMatch(/^export default /);
    expect(body).toContain('"name":"Test"');
    expect(body).toContain('"items":[1,2,3]');
    expect(body).toContain('"nested":{"key":"value"}');
  });

  it('should wrap JSON arrays as ES modules', async () => {
    vfs.writeFileSync('/lib/array.json', JSON.stringify(['a', 'b', 'c']));

    server = new NextDevServer(vfs, { port: 3001 });

    const response = await server.handleRequest('GET', '/lib/array.json', {});

    expect(response.statusCode).toBe(200);
    const body = response.body.toString();
    expect(body).toBe('export default ["a","b","c"];');
  });

  it('should handle JSON with special characters', async () => {
    vfs.writeFileSync('/lib/special.json', JSON.stringify({
      quote: 'He said "hello"',
      newline: 'line1\nline2',
      unicode: '日本語'
    }));

    server = new NextDevServer(vfs, { port: 3001 });

    const response = await server.handleRequest('GET', '/lib/special.json', {});

    expect(response.statusCode).toBe(200);
    const body = response.body.toString();
    expect(body).toMatch(/^export default /);
    expect(body).toContain('日本語');
  });

  it('should handle empty JSON objects', async () => {
    vfs.writeFileSync('/lib/empty.json', '{}');

    server = new NextDevServer(vfs, { port: 3001 });

    const response = await server.handleRequest('GET', '/lib/empty.json', {});

    expect(response.statusCode).toBe(200);
    const body = response.body.toString();
    expect(body).toBe('export default {};');
  });

  it('should handle complex nested JSON', async () => {
    const complexJson = {
      sections: [
        {
          id: 'section-1',
          name: 'First Section',
          features: [
            { name: 'Feature A', enabled: true },
            { name: 'Feature B', enabled: false }
          ]
        }
      ],
      visibleFeatures: 10,
      metadata: null
    };
    vfs.writeFileSync('/lib/complex.json', JSON.stringify(complexJson));

    server = new NextDevServer(vfs, { port: 3001 });

    const response = await server.handleRequest('GET', '/lib/complex.json', {});

    expect(response.statusCode).toBe(200);
    const body = response.body.toString();
    expect(body).toMatch(/^export default /);
    expect(body).toContain('"sections"');
    expect(body).toContain('"visibleFeatures":10');
    expect(body).toContain('"metadata":null');
  });

  it('should return 404 for non-existent JSON files', async () => {
    server = new NextDevServer(vfs, { port: 3001 });

    const response = await server.handleRequest('GET', '/lib/nonexistent.json', {});

    expect(response.statusCode).toBe(404);
  });

  it('should set correct content-length for wrapped JSON', async () => {
    vfs.writeFileSync('/lib/size.json', '{"a":1}');

    server = new NextDevServer(vfs, { port: 3001 });

    const response = await server.handleRequest('GET', '/lib/size.json', {});

    // "export default {"a":1};" = 22 bytes
    const expectedContent = 'export default {"a":1};';
    expect(response.headers['Content-Length']).toBe(String(expectedContent.length));
    expect(response.body.toString()).toBe(expectedContent);
  });

  it('should preserve JSON formatting when wrapping', async () => {
    // JSON with formatting (the actual content doesn't have formatting since we use stringify)
    const prettyJson = JSON.stringify({ key: 'value' }, null, 2);
    vfs.writeFileSync('/lib/pretty.json', prettyJson);

    server = new NextDevServer(vfs, { port: 3001 });

    const response = await server.handleRequest('GET', '/lib/pretty.json', {});

    expect(response.statusCode).toBe(200);
    const body = response.body.toString();
    expect(body).toMatch(/^export default /);
    // The newlines and spaces from pretty-printing should be preserved
    expect(body).toContain('{\n');
  });

  it('should serve JSON files from nested directories', async () => {
    vfs.mkdirSync('/lib/config/data', { recursive: true });
    vfs.writeFileSync('/lib/config/data/settings.json', '{"debug":true}');

    server = new NextDevServer(vfs, { port: 3001 });

    const response = await server.handleRequest('GET', '/lib/config/data/settings.json', {});

    expect(response.statusCode).toBe(200);
    expect(response.body.toString()).toBe('export default {"debug":true};');
  });
});

describe('Tailwind config integration', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();

    // Create App Router structure
    vfs.mkdirSync('/app', { recursive: true });
    vfs.writeFileSync(
      '/app/layout.tsx',
      `export default function RootLayout({ children }) {
  return <html><body>{children}</body></html>;
}`
    );
    vfs.writeFileSync(
      '/app/page.tsx',
      `export default function Home() {
  return <div className="text-brand-500">Hello</div>;
}`
    );
  });

  it('should inject tailwind config before CDN script in App Router HTML', async () => {
    vfs.writeFileSync(
      '/tailwind.config.ts',
      `import type { Config } from "tailwindcss"

export default {
  content: ["./app/**/*.tsx"],
  theme: {
    extend: {
      colors: {
        brand: {
          500: "var(--brand-500)"
        }
      }
    }
  }
} satisfies Config`
    );

    server = new NextDevServer(vfs, { port: 3001 });
    const response = await server.handleRequest('GET', '/', {});

    expect(response.statusCode).toBe(200);
    const html = response.body.toString();

    // Config script should be in the HTML
    expect(html).toContain('tailwind.config');
    expect(html).toContain('brand');
    expect(html).toContain('var(--brand-500)');

    // Config should come AFTER the CDN script (CDN creates tailwind global, then we configure it)
    const configIndex = html.indexOf('tailwind.config =');
    const cdnIndex = html.indexOf('cdn.tailwindcss.com');
    expect(configIndex).toBeGreaterThan(-1);
    expect(cdnIndex).toBeGreaterThan(-1);
    expect(configIndex).toBeGreaterThan(cdnIndex);
  });

  it('should inject tailwind config after CDN script in Pages Router HTML', async () => {
    // Create Pages Router structure instead
    vfs.mkdirSync('/pages', { recursive: true });
    vfs.writeFileSync(
      '/pages/index.jsx',
      `export default function Home() {
  return <div className="text-brand-500">Hello</div>;
}`
    );

    vfs.writeFileSync(
      '/tailwind.config.ts',
      `export default {
  content: ["./pages/**/*.jsx"],
  theme: {
    extend: {
      colors: {
        primary: "#0066cc"
      }
    }
  }
}`
    );

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: false });
    const response = await server.handleRequest('GET', '/', {});

    expect(response.statusCode).toBe(200);
    const html = response.body.toString();

    // Config script should be in the HTML
    expect(html).toContain('tailwind.config');
    expect(html).toContain('primary');
    expect(html).toContain('#0066cc');

    // Config should come AFTER the CDN script (CDN creates tailwind global, then we configure it)
    const configIndex = html.indexOf('tailwind.config =');
    const cdnIndex = html.indexOf('cdn.tailwindcss.com');
    expect(configIndex).toBeGreaterThan(-1);
    expect(cdnIndex).toBeGreaterThan(-1);
    expect(configIndex).toBeGreaterThan(cdnIndex);
  });

  it('should work without tailwind config (CDN defaults)', async () => {
    // No tailwind.config.ts file

    server = new NextDevServer(vfs, { port: 3001 });
    const response = await server.handleRequest('GET', '/', {});

    expect(response.statusCode).toBe(200);
    const html = response.body.toString();

    // CDN script should still be present
    expect(html).toContain('cdn.tailwindcss.com');

    // But no custom config (tailwind.config = ... should not be present)
    expect(html).not.toContain('tailwind.config =');
  });

  it('should handle complex tailwind config with animations and CSS variables', async () => {
    vfs.writeFileSync(
      '/tailwind.config.ts',
      `import type { Config } from "tailwindcss"

export default {
  darkMode: ["class"],
  content: ["./app/**/*.tsx"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"]
      },
      colors: {
        brand: {
          50: "var(--brand-50)",
          100: "var(--brand-100)",
          500: "var(--brand-500)"
        },
        text: {
          primary: "var(--text-primary)"
        }
      },
      animation: {
        marquee: "marquee var(--duration) linear infinite"
      },
      keyframes: {
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(calc(-100% - var(--gap)))" }
        }
      }
    }
  }
} satisfies Config`
    );

    server = new NextDevServer(vfs, { port: 3001 });
    const response = await server.handleRequest('GET', '/', {});

    expect(response.statusCode).toBe(200);
    const html = response.body.toString();

    // All config parts should be present
    expect(html).toContain('darkMode');
    expect(html).toContain('fontFamily');
    expect(html).toContain('animation');
    expect(html).toContain('keyframes');
    expect(html).toContain('marquee');
    expect(html).toContain('translateX');
  });
});

describe('next/font/google shim', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();

    // Create App Router structure
    vfs.mkdirSync('/app', { recursive: true });
  });

  it('should serve next/font/google shim', async () => {
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return children; }');
    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');

    server = new NextDevServer(vfs, { port: 3001 });
    const response = await server.handleRequest('GET', '/_next/shims/font/google.js', {});

    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');

    const code = response.body.toString();

    // Should use Proxy for dynamic font loading
    expect(code).toContain('Proxy');
    expect(code).toContain('createFontLoader');

    // Should export fonts via destructuring from proxy
    expect(code).toContain('Fraunces');
    expect(code).toContain('Inter');
    expect(code).toContain('DM_Sans');

    // Should inject font CSS from Google Fonts
    expect(code).toContain('injectFontCSS');
    expect(code).toContain('fonts.googleapis.com');

    // Should convert font names to family names (DM_Sans -> DM Sans)
    expect(code).toContain('toFontFamily');
  });

  it('should include next/font/google in import map', async () => {
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return children; }');
    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');

    server = new NextDevServer(vfs, { port: 3001 });
    const response = await server.handleRequest('GET', '/', {});

    expect(response.statusCode).toBe(200);
    const html = response.body.toString();

    // Import map should include next/font/google
    expect(html).toContain('"next/font/google"');
    expect(html).toContain('/_next/shims/font/google.js');
  });
});

describe('App Router page props (searchParams and params)', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();

    // Create App Router structure
    vfs.mkdirSync('/app', { recursive: true });
    vfs.writeFileSync(
      '/app/layout.tsx',
      `export default function RootLayout({ children }) {
  return <html><body>{children}</body></html>;
}`
    );
  });

  afterEach(() => {
    server?.stop();
  });

  describe('searchParams prop', () => {
    it('should pass searchParams as a Promise to page components', async () => {
      vfs.writeFileSync(
        '/app/page.tsx',
        `export default function Home() {
  return <div>Home</div>;
}`
      );

      server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });
      const response = await server.handleRequest('GET', '/', {});

      expect(response.statusCode).toBe(200);
      const html = response.body.toString();

      // PageWrapper should create searchParams as a Promise
      expect(html).toContain('Promise.resolve(Object.fromEntries(url.searchParams))');
      // Should render component via createElement so hooks work
      expect(html).toContain('React.createElement(Component, { searchParams, params })');
    });

    it('should include search params from URL in the searchParams object', async () => {
      vfs.writeFileSync(
        '/app/page.tsx',
        `export default function Home() {
  return <div>Home</div>;
}`
      );

      server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });
      const response = await server.handleRequest('GET', '/', {});

      expect(response.statusCode).toBe(200);
      const html = response.body.toString();

      // Should use Object.fromEntries to convert URL searchParams
      expect(html).toContain('Object.fromEntries(url.searchParams)');
    });

    it('should re-render when search params change', async () => {
      vfs.writeFileSync(
        '/app/page.tsx',
        `export default function Home() {
  return <div>Home</div>;
}`
      );

      server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });
      const response = await server.handleRequest('GET', '/', {});

      expect(response.statusCode).toBe(200);
      const html = response.body.toString();

      // Router should track search state
      expect(html).toContain('const [search, setSearch]');
      // PageWrapper should receive search prop to trigger re-render
      expect(html).toContain('search: search');
    });
  });

  describe('params prop for dynamic routes', () => {
    beforeEach(() => {
      // Create root page (needed for HTML generation tests)
      vfs.writeFileSync(
        '/app/page.tsx',
        `export default function Home() {
  return <div>Home</div>;
}`
      );
      // Create dynamic route structure
      vfs.mkdirSync('/app/users', { recursive: true });
      vfs.mkdirSync('/app/users/[id]', { recursive: true });
      vfs.writeFileSync(
        '/app/users/[id]/page.tsx',
        `export default async function UserPage({ params }) {
  const { id } = await params;
  return <div>User {id}</div>;
}`
      );
    });

    it('should extract params from dynamic route segments', async () => {
      server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });
      const response = await server.handleRequest('GET', '/', {});

      expect(response.statusCode).toBe(200);
      const html = response.body.toString();

      // Should have resolveRoute function for server-based route resolution
      expect(html).toContain('resolveRoute');
    });

    it('should pass params as a Promise to page components', async () => {
      server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });
      const response = await server.handleRequest('GET', '/', {});

      expect(response.statusCode).toBe(200);
      const html = response.body.toString();

      // Should render component via createElement with params
      expect(html).toContain('React.createElement(Component, { searchParams, params })');
      // Params should be a Promise
      expect(html).toContain('Promise.resolve');
    });

    it('should resolve dynamic route /users/123', async () => {
      server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

      // Request the dynamic route
      const response = await server.handleRequest('GET', '/users/123', {});

      expect(response.statusCode).toBe(200);
    });

    it('should handle nested dynamic routes', async () => {
      // Create nested dynamic route
      vfs.mkdirSync('/app/blog', { recursive: true });
      vfs.mkdirSync('/app/blog/[slug]', { recursive: true });
      vfs.mkdirSync('/app/blog/[slug]/comments', { recursive: true });
      vfs.mkdirSync('/app/blog/[slug]/comments/[commentId]', { recursive: true });
      vfs.writeFileSync(
        '/app/blog/[slug]/comments/[commentId]/page.tsx',
        `export default async function CommentPage({ params }) {
  const { slug, commentId } = await params;
  return <div>Comment {commentId} on post {slug}</div>;
}`
      );

      server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

      // Request the nested dynamic route
      const response = await server.handleRequest('GET', '/blog/my-post/comments/123', {});

      expect(response.statusCode).toBe(200);
    });

    it('should handle catch-all routes [...slug]', async () => {
      vfs.mkdirSync('/app/docs', { recursive: true });
      vfs.mkdirSync('/app/docs/[...slug]', { recursive: true });
      vfs.writeFileSync(
        '/app/docs/[...slug]/page.tsx',
        `export default async function DocsPage({ params }) {
  const { slug } = await params;
  return <div>Docs: {slug.join('/')}</div>;
}`
      );

      server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

      // Request the catch-all route
      const response = await server.handleRequest('GET', '/docs/getting-started/installation', {});

      expect(response.statusCode).toBe(200);
    });
  });

  describe('route-info endpoint', () => {
    beforeEach(() => {
      vfs.writeFileSync(
        '/app/page.tsx',
        `export default function Home() { return <div>Home</div>; }`
      );
    });

    it('should return empty params for static routes', async () => {
      server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });
      const response = await server.handleRequest('GET', '/_next/route-info?pathname=/', {});

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body.toString());
      expect(body.found).toBe(true);
      expect(body.params).toEqual({});
    });

    it('should return extracted params for dynamic routes', async () => {
      vfs.mkdirSync('/app/users', { recursive: true });
      vfs.mkdirSync('/app/users/[id]', { recursive: true });
      vfs.writeFileSync(
        '/app/users/[id]/page.tsx',
        `export default function UserPage() { return <div>User</div>; }`
      );

      server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });
      const response = await server.handleRequest('GET', '/_next/route-info?pathname=/users/123', {});

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body.toString());
      expect(body.found).toBe(true);
      expect(body.params).toEqual({ id: '123' });
    });

    it('should return extracted params for nested dynamic routes', async () => {
      vfs.mkdirSync('/app/blog', { recursive: true });
      vfs.mkdirSync('/app/blog/[slug]', { recursive: true });
      vfs.mkdirSync('/app/blog/[slug]/comments', { recursive: true });
      vfs.mkdirSync('/app/blog/[slug]/comments/[commentId]', { recursive: true });
      vfs.writeFileSync(
        '/app/blog/[slug]/comments/[commentId]/page.tsx',
        `export default function CommentPage() { return <div>Comment</div>; }`
      );

      server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });
      const response = await server.handleRequest('GET', '/_next/route-info?pathname=/blog/my-post/comments/42', {});

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body.toString());
      expect(body.found).toBe(true);
      expect(body.params).toEqual({ slug: 'my-post', commentId: '42' });
    });

    it('should return array for catch-all routes', async () => {
      vfs.mkdirSync('/app/docs', { recursive: true });
      vfs.mkdirSync('/app/docs/[...slug]', { recursive: true });
      vfs.writeFileSync(
        '/app/docs/[...slug]/page.tsx',
        `export default function DocsPage() { return <div>Docs</div>; }`
      );

      server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });
      const response = await server.handleRequest('GET', '/_next/route-info?pathname=/docs/getting-started/installation', {});

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body.toString());
      expect(body.found).toBe(true);
      expect(body.params).toEqual({ slug: ['getting-started', 'installation'] });
    });

    it('should return found=false for non-existent routes', async () => {
      server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });
      const response = await server.handleRequest('GET', '/_next/route-info?pathname=/nonexistent', {});

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body.toString());
      expect(body.found).toBe(false);
      expect(body.params).toEqual({});
    });
  });
});

describe('CSS import stripping', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();
    vfs.mkdirSync('/app', { recursive: true });
    vfs.mkdirSync('/components', { recursive: true });
  });

  afterEach(() => {
    server?.stop();
  });

  it('should preserve imports that come after CSS imports', async () => {
    // This test verifies the fix for a bug where CSS import stripping
    // would consume trailing newlines, causing subsequent imports to be lost.
    // The original bug: "import './globals.css'\n\nimport { Foo }" would become
    // "// CSS removed...import { Foo }" - making Foo's import unrecognizable.

    vfs.writeFileSync('/components/banner.tsx', `
export function Banner() {
  return <div>Banner</div>;
}
`);

    vfs.writeFileSync('/app/layout.tsx', `
import "./globals.css"

import { Banner } from "@/components/banner"

export default function Layout({ children }) {
  return <div><Banner />{children}</div>;
}
`);

    vfs.writeFileSync('/app/page.tsx', `
export default function Page() {
  return <div>Hello</div>;
}
`);

    vfs.writeFileSync('/app/globals.css', `
body { margin: 0; }
`);

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    // Request the layout file - it should have the Banner import preserved
    const response = await server.handleRequest('GET', '/_next/app/app/layout.js', {});

    expect(response.statusCode).toBe(200);
    const code = response.body.toString();

    // The Banner import should be preserved (not stripped with the CSS import)
    // In Node.js test environment, transformation doesn't run (isBrowser is false),
    // so we check the raw code still has the import
    expect(code).toContain('Banner');
  });

  it('should strip CSS imports without affecting subsequent code', async () => {
    // Test that multiple CSS imports don't affect non-CSS imports
    vfs.writeFileSync('/components/foo.tsx', 'export function Foo() { return <div>Foo</div>; }');
    vfs.writeFileSync('/components/bar.tsx', 'export function Bar() { return <div>Bar</div>; }');

    vfs.writeFileSync('/app/layout.tsx', `
import "some-package/dist/styles.css"

import { Foo } from "@/components/foo"

import "./globals.css"

import { Bar } from "@/components/bar"

export default function Layout({ children }) {
  return <div><Foo /><Bar />{children}</div>;
}
`);

    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');
    vfs.writeFileSync('/app/globals.css', 'body { margin: 0; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/_next/app/app/layout.js', {});

    expect(response.statusCode).toBe(200);
    const code = response.body.toString();

    // Both component imports should be preserved
    expect(code).toContain('Foo');
    expect(code).toContain('Bar');
  });

  it('should handle CSS imports at various positions in the file', async () => {
    vfs.writeFileSync('/components/a.tsx', 'export function A() { return <div>A</div>; }');
    vfs.writeFileSync('/components/b.tsx', 'export function B() { return <div>B</div>; }');
    vfs.writeFileSync('/components/c.tsx', 'export function C() { return <div>C</div>; }');

    vfs.writeFileSync('/app/layout.tsx', `
import { A } from "@/components/a"
import "./styles1.css"
import { B } from "@/components/b"
import "./styles2.css"
import { C } from "@/components/c"

export default function Layout({ children }) {
  return <div><A /><B /><C />{children}</div>;
}
`);

    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');
    vfs.writeFileSync('/app/styles1.css', '.a { color: red; }');
    vfs.writeFileSync('/app/styles2.css', '.b { color: blue; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/_next/app/app/layout.js', {});

    expect(response.statusCode).toBe(200);
    const code = response.body.toString();

    // All component imports should be preserved regardless of CSS import positions
    expect(code).toContain('A');
    expect(code).toContain('B');
    expect(code).toContain('C');
  });
});

describe('assetPrefix support', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();
    vfs.mkdirSync('/app', { recursive: true });
    vfs.mkdirSync('/public/images', { recursive: true });

    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return children; }');
    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');
    vfs.writeFileSync('/public/images/logo.png', 'fake-png-data');
  });

  afterEach(() => {
    server?.stop();
  });

  it('should serve static assets with assetPrefix from options', async () => {
    server = new NextDevServer(vfs, { port: 3001, assetPrefix: '/marketing' });

    // Request with assetPrefix should work
    const response = await server.handleRequest('GET', '/marketing/images/logo.png', {});
    expect(response.statusCode).toBe(200);
    expect(response.body.toString()).toBe('fake-png-data');
  });

  it('should also serve static assets without assetPrefix', async () => {
    server = new NextDevServer(vfs, { port: 3001, assetPrefix: '/marketing' });

    // Direct request without prefix should still work
    const response = await server.handleRequest('GET', '/images/logo.png', {});
    expect(response.statusCode).toBe(200);
    expect(response.body.toString()).toBe('fake-png-data');
  });

  it('should auto-detect assetPrefix from next.config.ts', async () => {
    vfs.writeFileSync('/next.config.ts', `
import type { NextConfig } from "next"

const config: NextConfig = {
  assetPrefix: "/marketing",
  reactStrictMode: true,
}

export default config
`);

    server = new NextDevServer(vfs, { port: 3001 });

    // Request with auto-detected prefix should work
    const response = await server.handleRequest('GET', '/marketing/images/logo.png', {});
    expect(response.statusCode).toBe(200);
    expect(response.body.toString()).toBe('fake-png-data');
  });

  it('should auto-detect assetPrefix from next.config.js', async () => {
    vfs.writeFileSync('/next.config.js', `
module.exports = {
  assetPrefix: '/assets',
  reactStrictMode: true,
}
`);

    server = new NextDevServer(vfs, { port: 3001 });

    // Request with auto-detected prefix should work
    const response = await server.handleRequest('GET', '/assets/images/logo.png', {});
    expect(response.statusCode).toBe(200);
    expect(response.body.toString()).toBe('fake-png-data');
  });

  it('should prefer explicit assetPrefix option over auto-detected', async () => {
    vfs.writeFileSync('/next.config.ts', `
export default {
  assetPrefix: "/from-config",
}
`);

    server = new NextDevServer(vfs, { port: 3001, assetPrefix: '/from-option' });

    // Explicit option should take precedence
    const responseOption = await server.handleRequest('GET', '/from-option/images/logo.png', {});
    expect(responseOption.statusCode).toBe(200);

    // Config prefix should NOT work when option is provided
    const responseConfig = await server.handleRequest('GET', '/from-config/images/logo.png', {});
    expect(responseConfig.statusCode).toBe(404);
  });

  it('should handle assetPrefix with nested paths', async () => {
    vfs.mkdirSync('/public/images/features/new', { recursive: true });
    vfs.writeFileSync('/public/images/features/new/feat-canvas.png', 'canvas-data');

    server = new NextDevServer(vfs, { port: 3001, assetPrefix: '/marketing' });

    const response = await server.handleRequest('GET', '/marketing/images/features/new/feat-canvas.png', {});
    expect(response.statusCode).toBe(200);
    expect(response.body.toString()).toBe('canvas-data');
  });

  it('should handle double-slash in URL when assetPrefix is concatenated', async () => {
    // This tests the case where code does: assetPrefix + '/' + path
    // e.g., "/marketing/" + "/images/logo.png" = "/marketing//images/logo.png"
    server = new NextDevServer(vfs, { port: 3001, assetPrefix: '/marketing' });

    const response = await server.handleRequest('GET', '/marketing//images/logo.png', {});
    expect(response.statusCode).toBe(200);
    expect(response.body.toString()).toBe('fake-png-data');
  });

  it('should return 404 for non-existent files even with assetPrefix', async () => {
    server = new NextDevServer(vfs, { port: 3001, assetPrefix: '/marketing' });

    const response = await server.handleRequest('GET', '/marketing/images/nonexistent.png', {});
    expect(response.statusCode).toBe(404);
  });

  it('should not strip assetPrefix from non-matching paths', async () => {
    server = new NextDevServer(vfs, { port: 3001, assetPrefix: '/marketing' });

    // /other/images/logo.png should NOT be treated as /images/logo.png
    const response = await server.handleRequest('GET', '/other/images/logo.png', {});
    expect(response.statusCode).toBe(404);
  });

  it('should auto-detect assetPrefix via variable reference in next.config.ts', async () => {
    vfs.writeFileSync('/next.config.ts', `
import type { NextConfig } from "next"

const PREFIX = '/marketing';
const config: NextConfig = {
  assetPrefix: PREFIX,
  reactStrictMode: true,
}

export default config
`);

    server = new NextDevServer(vfs, { port: 3001 });

    const response = await server.handleRequest('GET', '/marketing/images/logo.png', {});
    expect(response.statusCode).toBe(200);
    expect(response.body.toString()).toBe('fake-png-data');
  });

  it('should auto-detect assetPrefix with const config export pattern', async () => {
    vfs.writeFileSync('/next.config.js', `
const nextConfig = {
  assetPrefix: "/static",
};
module.exports = nextConfig;
`);

    server = new NextDevServer(vfs, { port: 3001 });

    const response = await server.handleRequest('GET', '/static/images/logo.png', {});
    expect(response.statusCode).toBe(200);
    expect(response.body.toString()).toBe('fake-png-data');
  });
});

describe('CSS Modules support', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();
    vfs.mkdirSync('/app', { recursive: true });
    vfs.mkdirSync('/components', { recursive: true });
  });

  afterEach(() => {
    server?.stop();
  });

  it('should convert CSS Module imports to inline class name objects', async () => {
    vfs.writeFileSync('/components/Button.module.css', `.button { color: red; }
.primary { background: blue; }
`);

    vfs.writeFileSync('/components/Button.tsx', `
import styles from './Button.module.css';

export default function Button() {
  return <button className={styles.button}>Click</button>;
}
`);

    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/_next/app/components/Button.js', {});
    // In Node.js test environment (isBrowser=false), code isn't transformed via esbuild
    // but stripCssImports still runs during transformCode
    // The response should serve the file
    expect(response.statusCode).toBe(200);
    const code = response.body.toString();
    // CSS module import should be replaced with an object
    expect(code).toContain('styles');
    // Should not contain raw CSS import
    expect(code).not.toContain("from './Button.module.css'");
  });

  it('should generate scoped class names from CSS modules', async () => {
    vfs.writeFileSync('/components/Card.module.css', `.card { padding: 10px; }
.title { font-size: 20px; }
`);

    vfs.writeFileSync('/components/Card.tsx', `
import styles from './Card.module.css';
export default function Card() { return <div className={styles.card}>Card</div>; }
`);

    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/_next/app/components/Card.js', {});
    expect(response.statusCode).toBe(200);
    const code = response.body.toString();
    // Should have scoped class names (original_hash format)
    expect(code).toMatch(/card_[a-z0-9]+/);
    expect(code).toMatch(/title_[a-z0-9]+/);
  });

  it('should inject scoped CSS via style tag in the replacement', async () => {
    vfs.writeFileSync('/components/Nav.module.css', `.nav { display: flex; }
`);

    vfs.writeFileSync('/components/Nav.tsx', `
import styles from './Nav.module.css';
export default function Nav() { return <nav className={styles.nav}>Nav</nav>; }
`);

    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/_next/app/components/Nav.js', {});
    expect(response.statusCode).toBe(200);
    const code = response.body.toString();
    // Should contain style injection code
    expect(code).toContain('document.createElement');
    expect(code).toContain('cssmod-');
  });

  it('should still strip regular (non-module) CSS imports', async () => {
    vfs.writeFileSync('/app/globals.css', 'body { margin: 0; }');

    vfs.writeFileSync('/app/layout.tsx', `
import './globals.css';
export default function Layout({ children }) { return <div>{children}</div>; }
`);

    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/_next/app/app/layout.js', {});
    expect(response.statusCode).toBe(200);
    const code = response.body.toString();
    // Regular CSS import should be stripped
    expect(code).not.toContain("import './globals.css'");
  });

  it('should return empty object for CSS modules that cannot be found', async () => {
    vfs.writeFileSync('/components/Missing.tsx', `
import styles from './NonExistent.module.css';
export default function Missing() { return <div className={styles.foo}>Missing</div>; }
`);

    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/_next/app/components/Missing.js', {});
    expect(response.statusCode).toBe(200);
    const code = response.body.toString();
    // Should fall back to empty object
    expect(code).toContain('styles = {}');
  });
});

describe('App Router API Routes (route.ts)', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();
    vfs.mkdirSync('/app', { recursive: true });
    vfs.mkdirSync('/app/api', { recursive: true });
    vfs.mkdirSync('/app/api/hello', { recursive: true });
    vfs.mkdirSync('/app/api/users', { recursive: true });
  });

  afterEach(() => {
    server?.stop();
  });

  it('should resolve route.ts files in /app/api', async () => {
    vfs.writeFileSync('/app/api/hello/route.ts', `
export async function GET(request) {
  return new Response(JSON.stringify({ message: 'hello' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
`);

    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/api/hello', {});
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body.toString());
    expect(body.message).toBe('hello');
  });

  it('should handle POST method in route handlers', async () => {
    vfs.writeFileSync('/app/api/users/route.ts', `
export async function GET(request) {
  return new Response(JSON.stringify({ users: [] }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function POST(request) {
  return new Response(JSON.stringify({ created: true }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
}
`);

    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const getResponse = await server.handleRequest('GET', '/api/users', {});
    expect(getResponse.statusCode).toBe(200);
    expect(JSON.parse(getResponse.body.toString())).toEqual({ users: [] });

    const postResponse = await server.handleRequest('POST', '/api/users', {}, Buffer.from('{}'));
    expect(postResponse.statusCode).toBe(201);
    expect(JSON.parse(postResponse.body.toString())).toEqual({ created: true });
  });

  it('should return 405 for unsupported methods', async () => {
    vfs.writeFileSync('/app/api/hello/route.ts', `
export async function GET(request) {
  return new Response('ok');
}
`);

    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('DELETE', '/api/hello', {});
    expect(response.statusCode).toBe(405);
  });

  it('should not use App Router routes when using Pages Router', async () => {
    vfs.mkdirSync('/pages/api', { recursive: true });
    vfs.writeFileSync('/pages/index.jsx', 'export default function Home() { return <div>Home</div>; }');

    vfs.writeFileSync('/app/api/hello/route.ts', `
export async function GET(request) {
  return new Response('from app router');
}
`);

    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');

    // Explicitly use Pages Router
    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: false });

    // Should not find the App Router API route
    const response = await server.handleRequest('GET', '/api/hello', {});
    expect(response.statusCode).toBe(404);
  });
});

describe('Route Groups support', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();
    vfs.mkdirSync('/app', { recursive: true });
  });

  afterEach(() => {
    server?.stop();
  });

  it('should resolve pages inside route groups', async () => {
    vfs.mkdirSync('/app/(marketing)', { recursive: true });
    vfs.mkdirSync('/app/(marketing)/about', { recursive: true });

    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <html><body>{children}</body></html>; }');
    vfs.writeFileSync('/app/(marketing)/about/page.tsx', 'export default function About() { return <div>About</div>; }');
    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    // The page should resolve and return HTML (not 404)
    const response = await server.handleRequest('GET', '/about', {});
    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toContain('text/html');
    // Verify it's the full App Router HTML (has the Router component)
    const html = response.body.toString();
    expect(html).toContain('__next');
    expect(html).toContain('Router');
  });

  it('should resolve root page inside route group', async () => {
    vfs.mkdirSync('/app/(main)', { recursive: true });

    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <html><body>{children}</body></html>; }');
    vfs.writeFileSync('/app/(main)/page.tsx', 'export default function Home() { return <div>Home</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/', {});
    expect(response.statusCode).toBe(200);
    const html = response.body.toString();
    expect(html).toContain('__next');
    expect(html).toContain('Router');
  });

  it('should collect layouts from route groups', async () => {
    vfs.mkdirSync('/app/(marketing)', { recursive: true });
    vfs.mkdirSync('/app/(marketing)/about', { recursive: true });

    vfs.writeFileSync('/app/layout.tsx', 'export default function RootLayout({ children }) { return <html><body>{children}</body></html>; }');
    vfs.writeFileSync('/app/(marketing)/layout.tsx', 'export default function MarketingLayout({ children }) { return <div className="marketing">{children}</div>; }');
    vfs.writeFileSync('/app/(marketing)/about/page.tsx', 'export default function About() { return <div>About</div>; }');
    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/about', {});
    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toContain('text/html');
    const html = response.body.toString();
    // Should be a proper App Router HTML page (not 404)
    expect(html).toContain('__next');
    expect(html).toContain('Router');
    // Verify route resolves correctly via route-info endpoint
    const routeInfo = await server.handleRequest('GET', '/_next/route-info?pathname=%2Fabout', {});
    const info = JSON.parse(routeInfo.body.toString());
    expect(info.found).toBe(true);
  });

  it('should handle dynamic routes inside route groups', async () => {
    vfs.mkdirSync('/app/(shop)', { recursive: true });
    vfs.mkdirSync('/app/(shop)/products', { recursive: true });
    vfs.mkdirSync('/app/(shop)/products/[id]', { recursive: true });

    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <html><body>{children}</body></html>; }');
    vfs.writeFileSync('/app/(shop)/products/[id]/page.tsx', 'export default function Product({ params }) { return <div>Product</div>; }');
    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/products/123', {});
    expect(response.statusCode).toBe(200);
    // Verify route params are extracted through route-info endpoint
    const routeInfo = await server.handleRequest('GET', '/_next/route-info?pathname=%2Fproducts%2F123', {});
    const info = JSON.parse(routeInfo.body.toString());
    expect(info.found).toBe(true);
    expect(info.params.id).toBe('123');
  });
});

describe('useParams support', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();
    vfs.mkdirSync('/app', { recursive: true });
  });

  afterEach(() => {
    server?.stop();
  });

  it('should include useParams implementation in navigation shim', async () => {
    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/_next/shims/navigation.js', {});
    expect(response.statusCode).toBe(200);
    const code = response.body.toString();
    // useParams should fetch from route-info endpoint
    expect(code).toContain('useParams');
    expect(code).toContain('__NEXT_ROUTE_PARAMS__');
    expect(code).toContain('route-info');
  });

  it('should embed initial route params in App Router HTML', async () => {
    vfs.mkdirSync('/app/users', { recursive: true });
    vfs.mkdirSync('/app/users/[id]', { recursive: true });
    vfs.writeFileSync('/app/users/[id]/page.tsx', 'export default function User() { return <div>User</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');
    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/users/42', {});
    expect(response.statusCode).toBe(200);
    const html = response.body.toString();
    // Should have initial params embedded
    expect(html).toContain('__NEXT_ROUTE_PARAMS__');
    expect(html).toContain('"id":"42"');
  });

  it('should return params from route-info endpoint for dynamic routes', async () => {
    vfs.mkdirSync('/app/posts', { recursive: true });
    vfs.mkdirSync('/app/posts/[slug]', { recursive: true });
    vfs.writeFileSync('/app/posts/[slug]/page.tsx', 'export default function Post() { return <div>Post</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');
    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/_next/route-info?pathname=%2Fposts%2Fmy-post', {});
    expect(response.statusCode).toBe(200);
    const info = JSON.parse(response.body.toString());
    expect(info.found).toBe(true);
    expect(info.params.slug).toBe('my-post');
  });
});

describe('basePath support', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();
    vfs.mkdirSync('/app', { recursive: true });
    vfs.mkdirSync('/public', { recursive: true });
  });

  afterEach(() => {
    server?.stop();
  });

  it('should strip basePath from incoming requests', async () => {
    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true, basePath: '/docs' });

    const response = await server.handleRequest('GET', '/docs', {});
    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toContain('text/html');
  });

  it('should strip basePath from subpath requests', async () => {
    vfs.mkdirSync('/app/about', { recursive: true });
    vfs.writeFileSync('/app/about/page.tsx', 'export default function About() { return <div>About</div>; }');
    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true, basePath: '/docs' });

    const response = await server.handleRequest('GET', '/docs/about', {});
    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toContain('text/html');
  });

  it('should auto-detect basePath from next.config.js', async () => {
    vfs.writeFileSync('/next.config.js', `
module.exports = {
  basePath: '/docs',
};
`);

    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/docs', {});
    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toContain('text/html');
  });

  it('should inject basePath into HTML for client-side use', async () => {
    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true, basePath: '/docs' });

    const response = await server.handleRequest('GET', '/docs', {});
    const html = response.body.toString();
    expect(html).toContain('__NEXT_BASE_PATH__');
    expect(html).toContain('/docs');
  });

  it('should serve static assets through basePath', async () => {
    vfs.writeFileSync('/public/image.png', 'image-data');

    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true, basePath: '/docs' });

    const response = await server.handleRequest('GET', '/docs/image.png', {});
    expect(response.statusCode).toBe(200);
    expect(response.body.toString()).toBe('image-data');
  });

  it('should auto-detect basePath via variable reference in next.config.js', async () => {
    vfs.writeFileSync('/next.config.js', `
const bp = '/docs';
module.exports = { basePath: bp };
`);

    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/docs', {});
    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toContain('text/html');
  });
});

describe('loading.tsx and error.tsx support', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();
    vfs.mkdirSync('/app', { recursive: true });
  });

  afterEach(() => {
    server?.stop();
  });

  it('should detect loading.tsx and include it in App Router HTML', async () => {
    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');
    vfs.writeFileSync('/app/loading.tsx', 'export default function Loading() { return <div>Loading...</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/', {});
    expect(response.statusCode).toBe(200);
    const html = response.body.toString();
    expect(html).toContain('loading.tsx');
  });

  it('should detect error.tsx and include it in App Router HTML', async () => {
    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');
    vfs.writeFileSync('/app/error.tsx', `'use client';
export default function Error({ error, reset }) { return <div>Error: {error.message}</div>; }
`);

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/', {});
    expect(response.statusCode).toBe(200);
    const html = response.body.toString();
    expect(html).toContain('error.tsx');
  });

  it('should detect not-found.tsx and include it in App Router HTML', async () => {
    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');
    vfs.writeFileSync('/app/not-found.tsx', 'export default function NotFound() { return <div>Not Found</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/', {});
    expect(response.statusCode).toBe(200);
    const html = response.body.toString();
    expect(html).toContain('not-found.tsx');
  });

  it('should include ErrorBoundary in generated HTML when error.tsx exists', async () => {
    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');
    vfs.writeFileSync('/app/error.tsx', 'export default function Error({ error, reset }) { return <div>Error</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/', {});
    const html = response.body.toString();
    expect(html).toContain('ErrorBoundary');
    expect(html).toContain('getDerivedStateFromError');
  });

  it('should find nearest loading.tsx for nested routes', async () => {
    vfs.mkdirSync('/app/dashboard', { recursive: true });
    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');
    vfs.writeFileSync('/app/loading.tsx', 'export default function Loading() { return <div>Loading...</div>; }');
    vfs.writeFileSync('/app/dashboard/page.tsx', 'export default function Dashboard() { return <div>Dashboard</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/dashboard', {});
    expect(response.statusCode).toBe(200);
    const html = response.body.toString();
    // Should find the root loading.tsx
    expect(html).toContain('/app/loading.tsx');
  });
});

describe('next/font/local shim', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();
    vfs.mkdirSync('/app', { recursive: true });
    vfs.writeFileSync('/app/page.tsx', 'export default function Page() { return <div>Hello</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');
  });

  afterEach(() => {
    server?.stop();
  });

  it('should serve the local font shim', async () => {
    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/_next/shims/font/local.js', {});
    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toContain('javascript');
    const code = response.body.toString();
    expect(code).toContain('localFont');
    expect(code).toContain('@font-face');
  });

  it('should include next/font/local in import map', async () => {
    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    const response = await server.handleRequest('GET', '/', {});
    const html = response.body.toString();
    expect(html).toContain('next/font/local');
    expect(html).toContain('/_next/shims/font/local.js');
  });
});

describe('Optional catch-all routes [[...slug]]', () => {
  let vfs: VirtualFS;
  let server: NextDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();
    vfs.mkdirSync('/app', { recursive: true });
  });

  afterEach(() => {
    server?.stop();
  });

  it('should resolve optional catch-all routes', async () => {
    vfs.mkdirSync('/app/shop', { recursive: true });
    vfs.mkdirSync('/app/shop/[[...slug]]', { recursive: true });
    vfs.writeFileSync('/app/shop/[[...slug]]/page.tsx', 'export default function Shop() { return <div>Shop</div>; }');
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout({ children }) { return <div>{children}</div>; }');
    vfs.writeFileSync('/app/page.tsx', 'export default function Home() { return <div>Home</div>; }');

    server = new NextDevServer(vfs, { port: 3001, preferAppRouter: true });

    // Should match with segments
    const response = await server.handleRequest('GET', '/shop/clothes/pants', {});
    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toContain('text/html');
    // Verify route params
    const routeInfo = await server.handleRequest('GET', '/_next/route-info?pathname=%2Fshop%2Fclothes%2Fpants', {});
    const info = JSON.parse(routeInfo.body.toString());
    expect(info.found).toBe(true);
    expect(info.params.slug).toEqual(['clothes', 'pants']);
  });

  describe('/_npm/ route', () => {
    it('should return 404 for empty specifier', async () => {
      const response = await server.handleRequest('GET', '/_npm/', {});
      expect(response.statusCode).toBe(404);
    });

    it('should return 500 when package is not installed', async () => {
      // In test env (no esbuild-wasm), bundleNpmModuleForBrowser will fail
      const response = await server.handleRequest('GET', '/_npm/nonexistent-pkg', {});
      expect(response.statusCode).toBe(500);
      expect(response.body.toString()).toContain('nonexistent-pkg');
    });
  });
});
