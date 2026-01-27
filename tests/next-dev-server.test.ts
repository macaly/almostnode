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
      expect(response.body.toString()).toContain('./pages/about.jsx');
    });

    it('should resolve /users/123 to pages/users/[id].jsx', async () => {
      const response = await server.handleRequest('GET', '/users/123', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('text/html; charset=utf-8');
      expect(response.body.toString()).toContain('./pages/users/[id].jsx');
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
      expect(response.body.toString()).toContain('./pages/typescript.tsx');
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
      expect(response.body.toString()).toContain('./pages/blog/index.jsx');
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

      expect(html).toContain('BroadcastChannel');
      expect(html).toContain('next-hmr');
      expect(html).toContain('__vite_hot_context__');
    });

    it('should set correct page module path', async () => {
      const response = await server.handleRequest('GET', '/about', {});
      const html = response.body.toString();

      expect(html).toContain('./pages/about.jsx');
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
      // Should use custom 404 page, not the default
      expect(response.body.toString()).toContain('./pages/404.jsx');
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
