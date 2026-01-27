import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import { DevServer, ResponseData } from '../src/dev-server';
import { ViteDevServer } from '../src/frameworks/vite-dev-server';
import { Buffer } from '../src/shims/stream';

/**
 * Concrete implementation of DevServer for testing base class functionality
 */
class TestDevServer extends DevServer {
  async handleRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: Buffer
  ): Promise<ResponseData> {
    const pathname = new URL(url, 'http://localhost').pathname;
    const filePath = this.resolvePath(pathname);

    if (!this.exists(filePath)) {
      return this.notFound(pathname);
    }

    return this.serveFile(filePath);
  }

  startWatching(): void {
    // No-op for test implementation
  }

  // Expose protected methods for testing
  public testResolvePath(path: string): string {
    return this.resolvePath(path);
  }

  public testGetMimeType(path: string): string {
    return this.getMimeType(path);
  }

  public testExists(path: string): boolean {
    return this.exists(path);
  }

  public testIsDirectory(path: string): boolean {
    return this.isDirectory(path);
  }

  public testNotFound(path: string): ResponseData {
    return this.notFound(path);
  }

  public testServerError(error: unknown): ResponseData {
    return this.serverError(error);
  }

  public testRedirect(location: string): ResponseData {
    return this.redirect(location);
  }
}

describe('DevServer', () => {
  let vfs: VirtualFS;
  let server: TestDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();
    server = new TestDevServer(vfs, { port: 3000 });
  });

  afterEach(() => {
    server.stop();
  });

  describe('MIME type detection', () => {
    it('should detect HTML files', () => {
      expect(server.testGetMimeType('/index.html')).toBe('text/html; charset=utf-8');
      expect(server.testGetMimeType('/page.htm')).toBe('text/html; charset=utf-8');
    });

    it('should detect JavaScript files', () => {
      expect(server.testGetMimeType('/app.js')).toBe('application/javascript; charset=utf-8');
      expect(server.testGetMimeType('/module.mjs')).toBe('application/javascript; charset=utf-8');
      expect(server.testGetMimeType('/module.cjs')).toBe('application/javascript; charset=utf-8');
    });

    it('should detect JSX/TSX files', () => {
      expect(server.testGetMimeType('/App.jsx')).toBe('application/javascript; charset=utf-8');
      expect(server.testGetMimeType('/App.tsx')).toBe('application/javascript; charset=utf-8');
      expect(server.testGetMimeType('/types.ts')).toBe('application/javascript; charset=utf-8');
    });

    it('should detect CSS files', () => {
      expect(server.testGetMimeType('/styles.css')).toBe('text/css; charset=utf-8');
    });

    it('should detect JSON files', () => {
      expect(server.testGetMimeType('/data.json')).toBe('application/json; charset=utf-8');
    });

    it('should detect image files', () => {
      expect(server.testGetMimeType('/logo.png')).toBe('image/png');
      expect(server.testGetMimeType('/photo.jpg')).toBe('image/jpeg');
      expect(server.testGetMimeType('/photo.jpeg')).toBe('image/jpeg');
      expect(server.testGetMimeType('/icon.gif')).toBe('image/gif');
      expect(server.testGetMimeType('/icon.svg')).toBe('image/svg+xml');
      expect(server.testGetMimeType('/icon.webp')).toBe('image/webp');
    });

    it('should detect font files', () => {
      expect(server.testGetMimeType('/font.woff')).toBe('font/woff');
      expect(server.testGetMimeType('/font.woff2')).toBe('font/woff2');
      expect(server.testGetMimeType('/font.ttf')).toBe('font/ttf');
    });

    it('should fallback to octet-stream for unknown types', () => {
      expect(server.testGetMimeType('/file.xyz')).toBe('application/octet-stream');
      expect(server.testGetMimeType('/file')).toBe('application/octet-stream');
    });
  });

  describe('path resolution', () => {
    it('should handle root paths', () => {
      expect(server.testResolvePath('/')).toBe('/');
      expect(server.testResolvePath('/index.html')).toBe('/index.html');
    });

    it('should handle nested paths', () => {
      expect(server.testResolvePath('/src/App.jsx')).toBe('/src/App.jsx');
      expect(server.testResolvePath('/assets/images/logo.png')).toBe('/assets/images/logo.png');
    });

    it('should strip query strings', () => {
      expect(server.testResolvePath('/index.html?v=123')).toBe('/index.html');
      expect(server.testResolvePath('/app.js?t=456&debug=true')).toBe('/app.js');
    });

    it('should strip hash fragments', () => {
      expect(server.testResolvePath('/index.html#section')).toBe('/index.html');
    });

    it('should add leading slash if missing', () => {
      expect(server.testResolvePath('index.html')).toBe('/index.html');
    });
  });

  describe('file existence checks', () => {
    beforeEach(() => {
      vfs.mkdirSync('/src', { recursive: true });
      vfs.writeFileSync('/index.html', '<html></html>');
      vfs.writeFileSync('/src/app.js', 'console.log("hi")');
    });

    it('should return true for existing files', () => {
      expect(server.testExists('/index.html')).toBe(true);
      expect(server.testExists('/src/app.js')).toBe(true);
    });

    it('should return false for non-existing files', () => {
      expect(server.testExists('/missing.html')).toBe(false);
      expect(server.testExists('/src/missing.js')).toBe(false);
    });

    it('should detect directories', () => {
      expect(server.testIsDirectory('/src')).toBe(true);
      expect(server.testIsDirectory('/index.html')).toBe(false);
      expect(server.testIsDirectory('/missing')).toBe(false);
    });
  });

  describe('error responses', () => {
    it('should create 404 response', () => {
      const response = server.testNotFound('/missing.html');

      expect(response.statusCode).toBe(404);
      expect(response.statusMessage).toBe('Not Found');
      expect(response.headers['Content-Type']).toBe('text/plain; charset=utf-8');
      expect(response.body.toString()).toContain('Not found: /missing.html');
    });

    it('should create 500 response from Error', () => {
      const response = server.testServerError(new Error('Something broke'));

      expect(response.statusCode).toBe(500);
      expect(response.statusMessage).toBe('Internal Server Error');
      expect(response.body.toString()).toContain('Something broke');
    });

    it('should create 500 response from string', () => {
      const response = server.testServerError('Unknown error');

      expect(response.statusCode).toBe(500);
      expect(response.body.toString()).toContain('Internal Server Error');
    });

    it('should create redirect response', () => {
      const response = server.testRedirect('/new-location');

      expect(response.statusCode).toBe(302);
      expect(response.statusMessage).toBe('Found');
      expect(response.headers['Location']).toBe('/new-location');
    });
  });

  describe('static file serving', () => {
    beforeEach(() => {
      vfs.mkdirSync('/src', { recursive: true });
      vfs.writeFileSync('/index.html', '<!DOCTYPE html><html><body>Hello</body></html>');
      vfs.writeFileSync('/src/app.js', 'console.log("hello");');
      vfs.writeFileSync('/styles.css', 'body { margin: 0; }');
      vfs.writeFileSync('/data.json', '{"key": "value"}');
    });

    it('should serve HTML files', async () => {
      const response = await server.handleRequest('GET', '/index.html', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('text/html; charset=utf-8');
      expect(response.body.toString()).toContain('<!DOCTYPE html>');
    });

    it('should serve JavaScript files', async () => {
      const response = await server.handleRequest('GET', '/src/app.js', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
      expect(response.body.toString()).toContain('console.log');
    });

    it('should serve CSS files', async () => {
      const response = await server.handleRequest('GET', '/styles.css', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('text/css; charset=utf-8');
      expect(response.body.toString()).toContain('body');
    });

    it('should serve JSON files', async () => {
      const response = await server.handleRequest('GET', '/data.json', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/json; charset=utf-8');
      expect(response.body.toString()).toContain('"key"');
    });

    it('should return 404 for missing files', async () => {
      const response = await server.handleRequest('GET', '/missing.html', {});

      expect(response.statusCode).toBe(404);
      expect(response.body.toString()).toContain('Not found');
    });

    it('should include Content-Length header', async () => {
      const response = await server.handleRequest('GET', '/index.html', {});

      expect(response.headers['Content-Length']).toBeDefined();
      expect(parseInt(response.headers['Content-Length'])).toBeGreaterThan(0);
    });

    it('should include Cache-Control header', async () => {
      const response = await server.handleRequest('GET', '/index.html', {});

      expect(response.headers['Cache-Control']).toBe('no-cache');
    });
  });

  describe('server lifecycle', () => {
    it('should start and stop', () => {
      expect(server.isRunning()).toBe(false);

      server.start();
      expect(server.isRunning()).toBe(true);

      server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('should emit listening event on start', () => {
      const listener = vi.fn();
      server.on('listening', listener);

      server.start();

      expect(listener).toHaveBeenCalledWith(3000);
    });

    it('should emit close event on stop', () => {
      const listener = vi.fn();
      server.on('close', listener);

      server.start();
      server.stop();

      expect(listener).toHaveBeenCalled();
    });

    it('should return port', () => {
      expect(server.getPort()).toBe(3000);
    });
  });
});

describe('ViteDevServer', () => {
  let vfs: VirtualFS;
  let server: ViteDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();

    // Create a minimal React project structure
    vfs.mkdirSync('/src', { recursive: true });

    vfs.writeFileSync(
      '/index.html',
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>`
    );

    vfs.writeFileSync(
      '/src/main.jsx',
      `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);`
    );

    vfs.writeFileSync(
      '/src/App.jsx',
      `import React, { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <h1>Hello World</h1>
      <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
    </div>
  );
}

export default App;`
    );

    vfs.writeFileSync(
      '/src/style.css',
      `body {
  margin: 0;
  font-family: sans-serif;
}

h1 {
  color: blue;
}`
    );

    server = new ViteDevServer(vfs, { port: 3000 });
  });

  afterEach(() => {
    server.stop();
  });

  describe('static file serving', () => {
    it('should serve index.html for root path', async () => {
      const response = await server.handleRequest('GET', '/', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('text/html; charset=utf-8');
      expect(response.body.toString()).toContain('<!DOCTYPE html>');
      expect(response.body.toString()).toContain('<div id="root">');
    });

    it('should serve CSS files', async () => {
      const response = await server.handleRequest('GET', '/src/style.css', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('text/css; charset=utf-8');
      expect(response.body.toString()).toContain('font-family');
    });

    it('should return 404 for missing files', async () => {
      const response = await server.handleRequest('GET', '/missing.html', {});

      expect(response.statusCode).toBe(404);
    });
  });

  describe('HMR client injection', () => {
    it('should inject HMR client script into HTML', async () => {
      const response = await server.handleRequest('GET', '/', {});

      expect(response.statusCode).toBe(200);
      const body = response.body.toString();

      // Should contain the HMR client script
      expect(body).toContain('BroadcastChannel');
      expect(body).toContain('vite-hmr');
      expect(body).toContain('[HMR] Client ready with React Refresh support');
    });

    it('should inject script before </head>', async () => {
      const response = await server.handleRequest('GET', '/', {});
      const body = response.body.toString();

      // HMR script should be before </head>
      const hmrIndex = body.indexOf('BroadcastChannel');
      const headCloseIndex = body.indexOf('</head>');

      expect(hmrIndex).toBeLessThan(headCloseIndex);
    });
  });

  describe('JSX/TS transformation', () => {
    // Note: In Node.js test environment, esbuild-wasm is not available
    // So these tests verify the request handling without actual transformation

    it('should handle JSX files', async () => {
      const response = await server.handleRequest('GET', '/src/App.jsx', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
    });

    it('should handle main.jsx', async () => {
      const response = await server.handleRequest('GET', '/src/main.jsx', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
    });

    it('should handle TypeScript files', async () => {
      vfs.writeFileSync('/src/utils.ts', 'export const add = (a: number, b: number): number => a + b;');

      const response = await server.handleRequest('GET', '/src/utils.ts', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
    });

    it('should handle TSX files', async () => {
      vfs.writeFileSync(
        '/src/Button.tsx',
        `import React from 'react';
interface Props { label: string; }
const Button: React.FC<Props> = ({ label }) => <button>{label}</button>;
export default Button;`
      );

      const response = await server.handleRequest('GET', '/src/Button.tsx', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
    });
  });

  describe('directory handling', () => {
    it('should serve index.html from directories', async () => {
      vfs.mkdirSync('/about', { recursive: true });
      vfs.writeFileSync('/about/index.html', '<html><body>About page</body></html>');

      const response = await server.handleRequest('GET', '/about/', {});

      expect(response.statusCode).toBe(200);
      expect(response.body.toString()).toContain('About page');
    });

    it('should return 404 for empty directories', async () => {
      vfs.mkdirSync('/empty', { recursive: true });

      const response = await server.handleRequest('GET', '/empty/', {});

      expect(response.statusCode).toBe(404);
    });
  });

  describe('query string handling', () => {
    it('should serve files with query strings', async () => {
      const response = await server.handleRequest('GET', '/src/style.css?v=123', {});

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('text/css; charset=utf-8');
    });

    it('should serve JSX with cache-busting query', async () => {
      const response = await server.handleRequest('GET', '/src/App.jsx?t=1234567890', {});

      expect(response.statusCode).toBe(200);
    });
  });

  describe('HMR events', () => {
    it('should emit hmr-update on file change', async () => {
      const listener = vi.fn();
      server.on('hmr-update', listener);

      server.start();

      // Simulate file change by writing to VFS
      vfs.writeFileSync('/src/App.jsx', '// Updated content');

      // Wait for the watcher to trigger
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(listener).toHaveBeenCalled();
      const update = listener.mock.calls[0][0];
      expect(update).toHaveProperty('type');
      expect(update).toHaveProperty('path');
      expect(update).toHaveProperty('timestamp');
    });

    it('should emit CSS update type for CSS files', async () => {
      const listener = vi.fn();
      server.on('hmr-update', listener);

      server.start();

      vfs.writeFileSync('/src/style.css', 'body { color: red; }');

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
  });
});

describe('ViteDevServer with ServerBridge integration', () => {
  let vfs: VirtualFS;
  let server: ViteDevServer;

  beforeEach(() => {
    vfs = new VirtualFS();

    vfs.mkdirSync('/src', { recursive: true });
    vfs.writeFileSync('/index.html', '<!DOCTYPE html><html><body>Test</body></html>');
    vfs.writeFileSync('/src/app.js', 'console.log("test");');

    server = new ViteDevServer(vfs, { port: 3000 });
  });

  afterEach(() => {
    server.stop();
  });

  it('should handle request/response cycle like http.Server', async () => {
    // Simulate how ServerBridge would call the server
    const response = await server.handleRequest('GET', '/index.html', {
      'accept': 'text/html',
      'host': 'localhost:3000',
    });

    expect(response.statusCode).toBe(200);
    expect(response.statusMessage).toBe('OK');
    expect(response.headers).toBeDefined();
    expect(response.body).toBeInstanceOf(Buffer);
  });

  it('should handle multiple concurrent requests', async () => {
    const requests = [
      server.handleRequest('GET', '/', {}),
      server.handleRequest('GET', '/src/app.js', {}),
      server.handleRequest('GET', '/missing.html', {}),
    ];

    const responses = await Promise.all(requests);

    expect(responses[0].statusCode).toBe(200); // index.html
    expect(responses[1].statusCode).toBe(200); // app.js
    expect(responses[2].statusCode).toBe(404); // missing
  });

  it('should return consistent response format', async () => {
    const response = await server.handleRequest('GET', '/', {});

    // Verify response matches the expected interface
    expect(typeof response.statusCode).toBe('number');
    expect(typeof response.statusMessage).toBe('string');
    expect(typeof response.headers).toBe('object');
    expect(response.body).toBeInstanceOf(Buffer);

    // Verify headers are strings
    for (const [key, value] of Object.entries(response.headers)) {
      expect(typeof key).toBe('string');
      expect(typeof value).toBe('string');
    }
  });
});
