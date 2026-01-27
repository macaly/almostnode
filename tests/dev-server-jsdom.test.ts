/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import { ViteDevServer } from '../src/frameworks/vite-dev-server';
import { ServerBridge, resetServerBridge } from '../src/server-bridge';
import { setServerListenCallback, setServerCloseCallback } from '../src/shims/http';
import { Buffer } from '../src/shims/stream';

describe('DevServer jsdom integration', () => {
  let vfs: VirtualFS;
  let server: ViteDevServer;
  let bridge: ServerBridge;

  beforeEach(() => {
    // Reset server bridge
    resetServerBridge();
    setServerListenCallback(null);
    setServerCloseCallback(null);

    // Create virtual filesystem with React app
    vfs = new VirtualFS();
    vfs.mkdirSync('/src', { recursive: true });

    vfs.writeFileSync(
      '/index.html',
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test React App</title>
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.2.0",
      "react-dom/client": "https://esm.sh/react-dom@18.2.0/client"
    }
  }
  </script>
  <link rel="stylesheet" href="./src/style.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./src/main.jsx"></script>
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
    <div className="app">
      <h1>Hello World</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  );
}

export default App;`
    );

    vfs.writeFileSync(
      '/src/style.css',
      `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  background: #f0f0f0;
}

.app {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

h1 {
  color: #333;
}

button {
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
}`
    );

    // Create server and bridge
    server = new ViteDevServer(vfs, { port: 3000, root: '/' });
    bridge = new ServerBridge({ baseUrl: 'http://localhost:5173' });
  });

  afterEach(() => {
    server.stop();
    resetServerBridge();
  });

  describe('DOM rendering from server responses', () => {
    it('should serve HTML that can be parsed into DOM', async () => {
      const response = await server.handleRequest('GET', '/', {});
      const html = response.body.toString();

      // Parse HTML into jsdom
      document.documentElement.innerHTML = html;

      // Verify DOM structure
      expect(document.querySelector('title')?.textContent).toBe('Test React App');
      expect(document.querySelector('#root')).toBeTruthy();
      expect(document.querySelector('script[src="./src/main.jsx"]')).toBeTruthy();
      expect(document.querySelector('link[href="./src/style.css"]')).toBeTruthy();
    });

    it('should inject HMR client that creates BroadcastChannel', async () => {
      const response = await server.handleRequest('GET', '/', {});
      const html = response.body.toString();

      document.documentElement.innerHTML = html;

      // Find the HMR script
      const scripts = document.querySelectorAll('script');
      let hmrScript: HTMLScriptElement | null = null;

      scripts.forEach((script) => {
        if (script.textContent?.includes('BroadcastChannel')) {
          hmrScript = script;
        }
      });

      expect(hmrScript).toBeTruthy();
      expect(hmrScript?.textContent).toContain("new BroadcastChannel('vite-hmr')");
      expect(hmrScript?.textContent).toContain('[HMR] Client ready with React Refresh support');
    });

    it('should serve CSS that can be applied to DOM', async () => {
      const response = await server.handleRequest('GET', '/src/style.css', {});
      const css = response.body.toString();

      // Create a style element and add to document
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);

      // Verify CSS was applied (check computed styles)
      const app = document.createElement('div');
      app.className = 'app';
      document.body.appendChild(app);

      const computedStyle = window.getComputedStyle(app);
      expect(computedStyle.maxWidth).toBe('800px');
      expect(computedStyle.padding).toBe('20px');
    });
  });

  describe('simulated fetch requests through bridge', () => {
    it('should handle requests like Service Worker would', async () => {
      // Create an http-like server wrapper
      const httpServer = {
        listening: true,
        address: () => ({ port: 3000, address: '0.0.0.0', family: 'IPv4' }),
        handleRequest: async (
          method: string,
          url: string,
          headers: Record<string, string>,
          body?: string
        ) => {
          return server.handleRequest(method, url, headers, body ? Buffer.from(body) : undefined);
        },
      };

      // Register with bridge
      bridge.registerServer(httpServer as any, 3000);

      // Simulate request through bridge (like SW would)
      const response = await bridge.handleRequest(3000, 'GET', '/', {});

      expect(response.statusCode).toBe(200);
      expect(response.body.toString()).toContain('<!DOCTYPE html>');
    });

    it('should create correct virtual URLs', () => {
      const url = bridge.getServerUrl(3000);
      expect(url).toBe('http://localhost:5173/__virtual__/3000');
    });

    it('should use fetchHandler for request simulation', async () => {
      const httpServer = {
        listening: true,
        address: () => ({ port: 3000, address: '0.0.0.0', family: 'IPv4' }),
        handleRequest: async (method: string, url: string, headers: Record<string, string>) => {
          return server.handleRequest(method, url, headers);
        },
      };

      bridge.registerServer(httpServer as any, 3000);

      const fetchHandler = bridge.createFetchHandler();

      // Simulate fetch request
      const request = new Request('http://localhost:5173/__virtual__/3000/');
      const response = await fetchHandler(request);

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('<!DOCTYPE html>');
    });
  });

  describe('HMR simulation', () => {
    it('should emit HMR events when files change', async () => {
      const hmrUpdates: any[] = [];

      server.on('hmr-update', (update) => {
        hmrUpdates.push(update);
      });

      server.start();

      // Simulate file edit
      vfs.writeFileSync(
        '/src/App.jsx',
        `import React from 'react';
function App() {
  return <div>Updated App</div>;
}
export default App;`
      );

      // Wait for watcher
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(hmrUpdates.length).toBeGreaterThan(0);
      expect(hmrUpdates[0].path).toContain('App.jsx');
    });

    it('should send CSS updates as type "update"', async () => {
      const hmrUpdates: any[] = [];

      server.on('hmr-update', (update) => {
        hmrUpdates.push(update);
      });

      server.start();

      // Simulate CSS edit
      vfs.writeFileSync('/src/style.css', 'body { background: red; }');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const cssUpdate = hmrUpdates.find((u) => u.path.includes('style.css'));
      expect(cssUpdate).toBeTruthy();
      expect(cssUpdate.type).toBe('update');
    });

    it('should send JS updates as type "update" for React Refresh HMR', async () => {
      const hmrUpdates: any[] = [];

      server.on('hmr-update', (update) => {
        hmrUpdates.push(update);
      });

      server.start();

      // Simulate JS edit
      vfs.writeFileSync('/src/main.jsx', 'console.log("updated");');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const jsUpdate = hmrUpdates.find((u) => u.path.includes('main.jsx'));
      expect(jsUpdate).toBeTruthy();
      // With React Refresh support, JS updates are sent as 'update'
      // The HMR client handles applying React Refresh or falling back to reload
      expect(jsUpdate.type).toBe('update');
    });
  });

  describe('iframe simulation', () => {
    it('should serve content suitable for iframe embedding', async () => {
      // Create an iframe
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);

      // Get the HTML from server
      const response = await server.handleRequest('GET', '/', {});
      const html = response.body.toString();

      // Write to iframe (simulating what would happen with real URL)
      const iframeDoc = iframe.contentDocument!;
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      // Verify iframe content
      expect(iframeDoc.querySelector('#root')).toBeTruthy();
      expect(iframeDoc.querySelector('title')?.textContent).toBe('Test React App');

      // Check for HMR script
      const scripts = iframeDoc.querySelectorAll('script');
      const hasHMR = Array.from(scripts).some((s) => s.textContent?.includes('BroadcastChannel'));
      expect(hasHMR).toBe(true);

      iframe.remove();
    });

    it('should serve CSS that works in iframe', async () => {
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);

      // Get HTML and CSS
      const htmlResponse = await server.handleRequest('GET', '/', {});
      const cssResponse = await server.handleRequest('GET', '/src/style.css', {});

      const iframeDoc = iframe.contentDocument!;
      iframeDoc.open();
      iframeDoc.write(htmlResponse.body.toString());
      iframeDoc.close();

      // Add CSS
      const style = iframeDoc.createElement('style');
      style.textContent = cssResponse.body.toString();
      iframeDoc.head.appendChild(style);

      // Create app element
      const root = iframeDoc.getElementById('root')!;
      root.innerHTML = '<div class="app"><h1>Test</h1></div>';

      // Verify styles are applied
      const app = iframeDoc.querySelector('.app')!;
      const computed = iframe.contentWindow!.getComputedStyle(app);
      expect(computed.maxWidth).toBe('800px');

      iframe.remove();
    });
  });

  describe('full request/response cycle', () => {
    it('should handle a complete page load simulation', async () => {
      // 1. Request index.html
      const htmlResponse = await server.handleRequest('GET', '/', {
        accept: 'text/html',
        'user-agent': 'Mozilla/5.0',
      });
      expect(htmlResponse.statusCode).toBe(200);
      expect(htmlResponse.headers['Content-Type']).toContain('text/html');

      // 2. Parse HTML and find resources
      const html = htmlResponse.body.toString();
      document.documentElement.innerHTML = html;

      const cssLink = document.querySelector('link[rel="stylesheet"]');
      const scriptSrc = document.querySelector('script[src]');

      expect(cssLink?.getAttribute('href')).toBe('./src/style.css');
      expect(scriptSrc?.getAttribute('src')).toBe('./src/main.jsx');

      // 3. Request CSS
      const cssResponse = await server.handleRequest('GET', '/src/style.css', {
        accept: 'text/css',
      });
      expect(cssResponse.statusCode).toBe(200);
      expect(cssResponse.headers['Content-Type']).toContain('text/css');

      // 4. Request main.jsx (would be transformed in browser)
      const jsResponse = await server.handleRequest('GET', '/src/main.jsx', {
        accept: 'application/javascript',
      });
      expect(jsResponse.statusCode).toBe(200);
      expect(jsResponse.headers['Content-Type']).toContain('application/javascript');

      // 5. Request App.jsx (imported by main.jsx)
      const appResponse = await server.handleRequest('GET', '/src/App.jsx', {});
      expect(appResponse.statusCode).toBe(200);
    });

    it('should handle 404 for missing resources', async () => {
      const response = await server.handleRequest('GET', '/missing-file.js', {});

      expect(response.statusCode).toBe(404);
      expect(response.body.toString()).toContain('Not found');
    });

    it('should handle multiple concurrent requests', async () => {
      const requests = [
        server.handleRequest('GET', '/', {}),
        server.handleRequest('GET', '/src/style.css', {}),
        server.handleRequest('GET', '/src/main.jsx', {}),
        server.handleRequest('GET', '/src/App.jsx', {}),
        server.handleRequest('GET', '/favicon.ico', {}), // 404
      ];

      const responses = await Promise.all(requests);

      expect(responses[0].statusCode).toBe(200); // index.html
      expect(responses[1].statusCode).toBe(200); // style.css
      expect(responses[2].statusCode).toBe(200); // main.jsx
      expect(responses[3].statusCode).toBe(200); // App.jsx
      expect(responses[4].statusCode).toBe(404); // favicon.ico
    });
  });
});

describe('BroadcastChannel HMR simulation', () => {
  it('should be able to create BroadcastChannel in jsdom', () => {
    // jsdom supports BroadcastChannel
    const channel = new BroadcastChannel('test-channel');
    expect(channel).toBeTruthy();
    channel.close();
  });

  it('should receive messages on BroadcastChannel', async () => {
    const received: any[] = [];

    const receiver = new BroadcastChannel('hmr-test');
    receiver.onmessage = (event) => {
      received.push(event.data);
    };

    const sender = new BroadcastChannel('hmr-test');
    sender.postMessage({ type: 'update', path: '/src/App.jsx' });

    // Wait for message
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received.length).toBe(1);
    expect(received[0].type).toBe('update');
    expect(received[0].path).toBe('/src/App.jsx');

    receiver.close();
    sender.close();
  });

  it('should simulate HMR update flow', async () => {
    let vfs = new VirtualFS();
    vfs.mkdirSync('/src', { recursive: true });
    vfs.writeFileSync('/index.html', '<html></html>');
    vfs.writeFileSync('/src/App.jsx', 'export default () => <div>App</div>');

    const server = new ViteDevServer(vfs, { port: 3000 });

    // Simulate iframe receiving HMR updates
    const iframeChannel = new BroadcastChannel('vite-hmr');
    const updates: any[] = [];

    iframeChannel.onmessage = (event) => {
      updates.push(event.data);
    };

    // Server sends HMR update (this is what ViteDevServer does internally)
    server.start();

    // Simulate file change
    vfs.writeFileSync('/src/App.jsx', 'export default () => <div>Updated</div>');

    // Wait for update
    await new Promise((resolve) => setTimeout(resolve, 100));

    // The server should have broadcast the update
    expect(updates.length).toBeGreaterThan(0);

    iframeChannel.close();
    server.stop();
  });
});
