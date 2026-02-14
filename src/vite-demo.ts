/**
 * Vite Demo - Running Vite in the browser using our Node.js shims
 */

import { VirtualFS } from './virtual-fs';
import { Runtime } from './runtime';
import { PackageManager } from './npm';
import { ViteDevServer } from './frameworks/vite-dev-server';
import { getServerBridge } from './server-bridge';
import { Buffer } from './shims/stream';

// Create a simple Vite project in the virtual filesystem
export function createViteProject(vfs: VirtualFS): void {
  // Create package.json
  vfs.writeFileSync(
    '/package.json',
    JSON.stringify(
      {
        name: 'react-vite-browser-demo',
        version: '1.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
        },
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
        },
        devDependencies: {
          vite: '^5.0.0',
          '@vitejs/plugin-react': '^4.2.0',
        },
      },
      null,
      2
    )
  );

  // Create vite.config.js with React plugin
  vfs.writeFileSync(
    '/vite.config.js',
    `
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: '/',
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
});
`
  );

  // Create index.html for React app
  // Note: Use relative paths (./src/) so they work with /__virtual__/port/ URLs
  // ViteDevServer automatically injects a React import map if none is present
  vfs.writeFileSync(
    '/index.html',
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>React + Vite Browser Demo</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./src/main.jsx"></script>
</body>
</html>
`
  );

  // Create src directory and main.jsx
  vfs.mkdirSync('/src', { recursive: true });
  vfs.writeFileSync(
    '/src/main.jsx',
    `
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './style.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`
  );

  // Create App.jsx
  vfs.writeFileSync(
    '/src/App.jsx',
    `
import React, { useState } from 'react';
import Counter from './Counter.jsx';

function App() {
  const [theme, setTheme] = useState('light');

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <div className={\`app \${theme}\`}>
      <header>
        <h1>⚡ React + Vite in Browser</h1>
        <p>Running with shimmed Node.js APIs</p>
      </header>

      <main>
        <Counter />

        <div className="theme-toggle">
          <button onClick={toggleTheme}>
            {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
          </button>
        </div>

        <div className="info-card">
          <h3>How it works</h3>
          <ul>
            <li>VirtualFS stores all files in memory</li>
            <li>Node.js APIs are shimmed for the browser</li>
            <li>Edit files on the left to see HMR updates</li>
          </ul>
        </div>
      </main>

      <footer>
        Made with 💜 WebContainers
      </footer>
    </div>
  );
}

export default App;
`
  );

  // Create Counter.jsx
  vfs.writeFileSync(
    '/src/Counter.jsx',
    `
import React, { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className="counter-card">
      <h2>Interactive Counter</h2>
      <div className="counter-display">{count}</div>
      <div className="counter-buttons">
        <button onClick={() => setCount(c => c - 1)}>➖</button>
        <button onClick={() => setCount(0)}>Reset</button>
        <button onClick={() => setCount(c => c + 1)}>➕</button>
      </div>
    </div>
  );
}

export default Counter;
`
  );

  // Create style.css for React app
  vfs.writeFileSync(
    '/src/style.css',
    `
* {
  box-sizing: border-box;
}

:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
}

body {
  margin: 0;
  min-height: 100vh;
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
}

.app.light {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.app.dark {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: #eee;
}

header {
  text-align: center;
  padding: 2rem;
}

header h1 {
  font-size: 2.5rem;
  margin: 0 0 0.5rem 0;
}

header p {
  opacity: 0.8;
  margin: 0;
}

main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 1rem;
}

.counter-card {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 2rem;
  text-align: center;
  min-width: 280px;
}

.counter-card h2 {
  margin: 0 0 1rem 0;
}

.counter-display {
  font-size: 4rem;
  font-weight: bold;
  margin: 1rem 0;
}

.counter-buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

button {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  font-weight: 500;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.2);
  color: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
}

button:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

button:active {
  transform: translateY(0);
}

.theme-toggle button {
  background: rgba(0, 0, 0, 0.2);
}

.info-card {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1.5rem;
  max-width: 400px;
}

.info-card h3 {
  margin: 0 0 1rem 0;
}

.info-card ul {
  margin: 0;
  padding-left: 1.5rem;
}

.info-card li {
  margin: 0.5rem 0;
  opacity: 0.9;
}

footer {
  text-align: center;
  padding: 1.5rem;
  opacity: 0.7;
}
`
  );
}

// Initialize the demo
export async function initViteDemo(
  outputElement: HTMLElement,
  iframeElement: HTMLIFrameElement | null
): Promise<{ vfs: VirtualFS; runtime: Runtime; npm: PackageManager }> {
  const log = (message: string) => {
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    outputElement.appendChild(line);
    outputElement.scrollTop = outputElement.scrollHeight;
  };

  log('Creating virtual file system...');
  const vfs = new VirtualFS();

  log('Creating Vite project structure...');
  createViteProject(vfs);

  log('Initializing runtime...');
  const runtime = new Runtime(vfs, {
    cwd: '/',
    env: {
      NODE_ENV: 'development',
    },
    onConsole: (method, args) => {
      const prefix = method === 'error' ? '[ERROR]' : method === 'warn' ? '[WARN]' : '';
      log(`${prefix} ${args.map((a) => String(a)).join(' ')}`);
    },
  });

  // Initialize package manager
  const npm = new PackageManager(vfs, { cwd: '/' });

  // Set up file watcher demo
  log('Setting up file watcher...');
  vfs.watch('/src', { recursive: true }, (eventType, filename) => {
    log(`File ${eventType}: ${filename}`);
  });

  log('Vite demo initialized!');
  log('');
  log('Virtual FS contents:');
  listFiles(vfs, '/', log, '  ');

  return { vfs, runtime, npm };
}

/**
 * Install Vite into the virtual file system
 */
export async function installVite(
  npm: PackageManager,
  log: (message: string) => void
): Promise<void> {
  log('');
  log('=== Installing Vite ===');
  log('This will download Vite and its dependencies from npm...');

  try {
    const result = await npm.install('vite@5.0.12', {
      onProgress: (msg) => log(`  ${msg}`),
    });

    log(`Installed ${result.added.length} packages`);
    log('Vite installation complete!');
  } catch (error) {
    log(`ERROR installing Vite: ${error}`);
    throw error;
  }
}

/**
 * Try to run Vite's createServer
 */
export async function runVite(
  runtime: Runtime,
  log: (message: string) => void
): Promise<unknown> {
  log('');
  log('=== Starting Vite ===');

  try {
    // ESM packages are pre-transformed to CJS during npm install
    // Try to require vite
    log('Loading Vite module...');

    const code = `
const vite = require('vite');
console.log('Vite loaded:', typeof vite);
console.log('Vite exports:', Object.keys(vite));

// Try to call createServer
async function start() {
  try {
    console.log('Creating Vite dev server...');
    const server = await vite.createServer({
      root: '/',
      configFile: false,
      server: {
        port: 3000,
        strictPort: true,
        hmr: false, // Disable HMR for initial test
      },
      logLevel: 'info',
    });
    console.log('Vite server created!');
    return server;
  } catch (err) {
    console.error('Failed to create Vite server:', err.message);
    console.error(err.stack);
    throw err;
  }
}

module.exports = { start };
`;

    const { exports } = runtime.execute(code, '/run-vite.js');
    const { start } = exports as { start: () => Promise<unknown> };

    log('Executing Vite createServer...');
    const server = await start();
    log('Vite server started successfully!');

    return server;
  } catch (error) {
    log(`ERROR running Vite: ${error}`);
    if (error instanceof Error) {
      log(`Stack: ${error.stack}`);
    }
    throw error;
  }
}

function listFiles(
  vfs: VirtualFS,
  path: string,
  log: (msg: string) => void,
  indent: string
): void {
  try {
    const entries = vfs.readdirSync(path);
    for (const entry of entries) {
      const fullPath = path === '/' ? '/' + entry : path + '/' + entry;
      const stats = vfs.statSync(fullPath);
      if (stats.isDirectory()) {
        log(`${indent}📁 ${entry}/`);
        listFiles(vfs, fullPath, log, indent + '  ');
      } else {
        log(`${indent}📄 ${entry}`);
      }
    }
  } catch (e) {
    log(`${indent}Error: ${e}`);
  }
}

/**
 * Start the dev server using Service Worker approach
 * This is the recommended way to run the preview - no npm install required!
 */
export async function startDevServer(
  vfs: VirtualFS,
  options: {
    port?: number;
    log?: (message: string) => void;
  } = {}
): Promise<{
  server: ViteDevServer;
  url: string;
  stop: () => void;
}> {
  const port = options.port || 3000;
  const log = options.log || console.log;

  log('Starting dev server...');

  // Create ViteDevServer
  const server = new ViteDevServer(vfs, { port, root: '/' });

  // Get the server bridge
  const bridge = getServerBridge();

  // Initialize Service Worker
  try {
    log('Initializing Service Worker...');
    await bridge.initServiceWorker();
    log('Service Worker ready');
  } catch (error) {
    log(`Warning: Service Worker failed to initialize: ${error}`);
    log('Falling back to direct request handling...');
  }

  // Register the server with the bridge
  // The bridge will route /__virtual__/{port}/* requests to this server
  bridge.on('server-ready', (p: unknown, u: unknown) => {
    log(`Server ready at ${u}`);
  });

  // Wire up the ViteDevServer to handle requests through the bridge
  // We need to make the server compatible with the bridge's http.Server interface
  const httpServer = createHttpServerWrapper(server);
  bridge.registerServer(httpServer, port);

  // Start watching for file changes
  server.start();
  log('File watcher started');

  // Set up HMR event forwarding
  server.on('hmr-update', (update: unknown) => {
    log(`HMR update: ${JSON.stringify(update)}`);
  });

  const url = bridge.getServerUrl(port);
  log(`Dev server running at: ${url}/`);

  return {
    server,
    url: url + '/',
    stop: () => {
      server.stop();
      bridge.unregisterServer(port);
    },
  };
}

/**
 * Create an http.Server-compatible wrapper around ViteDevServer
 */
function createHttpServerWrapper(devServer: ViteDevServer) {
  return {
    listening: true,
    address: () => ({ port: devServer.getPort(), address: '0.0.0.0', family: 'IPv4' }),
    async handleRequest(
      method: string,
      url: string,
      headers: Record<string, string>,
      body?: string | Buffer
    ) {
      const bodyBuffer = body
        ? typeof body === 'string'
          ? Buffer.from(body)
          : body
        : undefined;
      return devServer.handleRequest(method, url, headers, bodyBuffer);
    },
  };
}

// Export for use in the demo page
export { VirtualFS, Runtime, PackageManager, ViteDevServer };
