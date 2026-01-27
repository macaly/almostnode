/**
 * Mini WebContainer Demo
 * Demonstrates running an HTTP server in the browser
 */

import { VirtualFS } from './virtual-fs';
import { Runtime } from './runtime';
import { ServerBridge, getServerBridge, resetServerBridge } from './server-bridge';
import { PackageManager } from './npm';

// DOM elements
const editorEl = document.getElementById('editor') as HTMLTextAreaElement;
const previewEl = document.getElementById('preview') as HTMLIFrameElement;
const terminalEl = document.getElementById('terminal') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const runBtn = document.getElementById('runBtn') as HTMLButtonElement;

// State
let vfs: VirtualFS;
let runtime: Runtime;
let serverBridge: ServerBridge;
let npm: PackageManager;
let currentServerPort: number | null = null;

// Log to terminal
function log(message: string, type: 'info' | 'error' | 'success' = 'info') {
  const colors = {
    info: '#888',
    error: '#e74c3c',
    success: '#27ae60',
  };
  const time = new Date().toLocaleTimeString();
  terminalEl.innerHTML += `<span style="color: ${colors[type]}">[${time}] ${escapeHtml(message)}</span>\n`;
  terminalEl.scrollTop = terminalEl.scrollHeight;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Update status indicator
function setStatus(text: string, className: 'loading' | 'ready' | 'error') {
  statusEl.textContent = text;
  statusEl.className = 'status ' + className;
}

// Initialize the container
function initContainer() {
  vfs = new VirtualFS();
  runtime = new Runtime(vfs, {
    onConsole: (method, args) => {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      log(message, method === 'error' ? 'error' : 'info');
    },
  });

  npm = new PackageManager(vfs);

  // Reset the server bridge to get fresh callbacks
  resetServerBridge();

  serverBridge = getServerBridge({
    baseUrl: window.location.origin,
    onServerReady: (port, url) => {
      currentServerPort = port;
      log(`Server ready on port ${port}`, 'success');
      setStatus('Running', 'ready');

      // Load the preview
      loadPreview('/');
    },
  });

  log('Container initialized', 'success');
}

// Load content from virtual server into preview
async function loadPreview(path: string) {
  if (!currentServerPort) {
    log('No server running', 'error');
    return;
  }

  try {
    const response = await serverBridge.handleRequest(
      currentServerPort,
      'GET',
      path,
      {
        host: 'localhost',
        'user-agent': 'MiniWebContainer/1.0',
      }
    );

    const contentType = response.headers['content-type'] || 'text/plain';
    const body = response.body.toString();

    if (contentType.includes('text/html')) {
      // Inject script to intercept link clicks
      const htmlWithInterceptor = injectLinkInterceptor(body);
      const blob = new Blob([htmlWithInterceptor], { type: 'text/html' });
      previewEl.src = URL.createObjectURL(blob);
    } else if (contentType.includes('application/json')) {
      // Display JSON nicely
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: monospace; padding: 1rem; background: #1a1a2e; color: #0f0; }
              pre { white-space: pre-wrap; word-wrap: break-word; }
            </style>
          </head>
          <body>
            <pre>${escapeHtml(JSON.stringify(JSON.parse(body), null, 2))}</pre>
          </body>
        </html>
      `;
      const blob = new Blob([html], { type: 'text/html' });
      previewEl.src = URL.createObjectURL(blob);
    } else {
      // Display as plain text
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: monospace; padding: 1rem; background: #1a1a2e; color: #eee; }
              pre { white-space: pre-wrap; word-wrap: break-word; }
            </style>
          </head>
          <body>
            <pre>${escapeHtml(body)}</pre>
          </body>
        </html>
      `;
      const blob = new Blob([html], { type: 'text/html' });
      previewEl.src = URL.createObjectURL(blob);
    }
  } catch (error) {
    log(`Error loading preview: ${error}`, 'error');
  }
}

// Inject script to intercept link clicks in the preview
function injectLinkInterceptor(html: string): string {
  const script = `
    <script>
      document.addEventListener('click', function(e) {
        const link = e.target.closest('a');
        if (link) {
          e.preventDefault();
          // Get the href attribute directly (not the resolved href property)
          const href = link.getAttribute('href');
          if (href) {
            // Handle relative URLs directly
            if (href.startsWith('/')) {
              window.parent.postMessage({ type: 'navigate', path: href }, '*');
            } else if (href.startsWith('http')) {
              // Absolute URL - extract pathname
              try {
                const url = new URL(href);
                window.parent.postMessage({ type: 'navigate', path: url.pathname + url.search }, '*');
              } catch (e) {
                console.error('Invalid URL:', href);
              }
            } else {
              // Relative path without leading slash
              window.parent.postMessage({ type: 'navigate', path: '/' + href }, '*');
            }
          }
        }
      });
    </script>
  `;

  // Insert before </body> or at the end
  if (html.includes('</body>')) {
    return html.replace('</body>', script + '</body>');
  }
  return html + script;
}

// Check if code uses Express
function usesExpress(code: string): boolean {
  return code.includes("require('express')") || code.includes('require("express")');
}

// Check if express is installed in VFS
function isExpressInstalled(): boolean {
  return vfs.existsSync('/node_modules/express/package.json');
}

// Install dependencies
async function installDependencies() {
  setStatus('Installing...', 'loading');
  runBtn.disabled = true;

  try {
    log('Installing express (this may take a moment)...', 'info');

    await npm.install('express', {
      onProgress: (msg) => log(msg, 'info'),
    });

    log('Express installed successfully!', 'success');
  } catch (error) {
    log(`Install failed: ${error}`, 'error');
    setStatus('Install Failed', 'error');
    throw error;
  } finally {
    runBtn.disabled = false;
  }
}

// Reset runtime for a fresh execution (but keep VFS with installed packages)
function resetRuntime() {
  runtime = new Runtime(vfs, {
    onConsole: (method, args) => {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      log(message, method === 'error' ? 'error' : 'info');
    },
  });

  // Reset the server bridge to get fresh callbacks
  resetServerBridge();

  serverBridge = getServerBridge({
    baseUrl: window.location.origin,
    onServerReady: (port, url) => {
      currentServerPort = port;
      log(`Server ready on port ${port}`, 'success');
      setStatus('Running', 'ready');

      // Load the preview
      loadPreview('/');
    },
  });
}

// Run the server code
async function runServer() {
  const code = editorEl.value;

  // Reset state
  currentServerPort = null;
  setStatus('Starting...', 'loading');
  runBtn.disabled = true;

  // Clear terminal
  terminalEl.innerHTML = '';
  log('Running script...');

  // Reset runtime (keeps VFS with installed packages)
  resetRuntime();

  try {
    // Check if Express is needed and not installed
    if (usesExpress(code) && !isExpressInstalled()) {
      await installDependencies();
    }

    // Execute the code
    log('Executing code...', 'info');
    runtime.execute(code, '/server.js');
    log('Code executed successfully', 'success');

    // If no server started after a short delay, mark as completed
    setTimeout(() => {
      if (!currentServerPort) {
        setStatus('Completed', 'ready');
      }
    }, 500);
  } catch (error) {
    log(`Error: ${error}`, 'error');
    setStatus('Error', 'error');
  } finally {
    runBtn.disabled = false;
  }
}

// Handle messages from preview iframe
window.addEventListener('message', (event) => {
  if (event.data?.type === 'navigate') {
    log(`Navigating to ${event.data.path}`);
    loadPreview(event.data.path);
  }
});

// Initialize on load
runBtn.addEventListener('click', runServer);

// Initialize container
initContainer();
setStatus('Ready', 'ready');
log('Click "Run Server" to start the HTTP server');
log('Express will be auto-installed if you use require("express")');
