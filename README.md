# almostnode

**Node.js in your browser. Just like that.**

A lightweight, browser-native Node.js runtime environment. Run Node.js code, install npm packages, and develop with Vite or Next.js - all without a server.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

Built by the creators of [Macaly.com](https://macaly.com) — a tool that lets anyone build websites and web apps, even without coding experience. Think Claude Code for non-developers.

> **Warning:** This project is experimental and may contain bugs. Use with caution in production environments.

---

## Features

- **Virtual File System** - Full in-memory filesystem with Node.js-compatible API
- **Node.js API Shims** - 40+ shimmed modules (`fs`, `path`, `http`, `events`, and more)
- **npm Package Installation** - Install and run real npm packages in the browser
- **Dev Servers** - Built-in Vite and Next.js development servers
- **Hot Module Replacement** - React Refresh support for instant updates
- **TypeScript Support** - First-class TypeScript/TSX transformation via esbuild-wasm
- **Service Worker Architecture** - Intercepts requests for seamless dev experience
- **Optional Web Worker Support** - Offload code execution to a Web Worker for improved UI responsiveness
- **Secure by Default** - Cross-origin sandbox support for running untrusted code safely

---

## Requirements

- **Node.js 20+** - Required for development and building
- **Modern browser** - Chrome, Firefox, Safari, or Edge with ES2020+ support

> **Note:** almostnode runs in the browser and emulates Node.js 20 APIs. The Node.js requirement is only for development tooling (Vite, Vitest, TypeScript).

---

## Quick Start

### Installation

```bash
npm install almostnode
```

### Basic Usage

```typescript
import { createContainer } from 'almostnode';

// Create a Node.js container in the browser
const container = createContainer();

// Execute JavaScript code directly
const result = container.execute(`
  const path = require('path');
  const fs = require('fs');

  // Use Node.js APIs in the browser!
  fs.writeFileSync('/hello.txt', 'Hello from the browser!');
  module.exports = fs.readFileSync('/hello.txt', 'utf8');
`);

console.log(result.exports); // "Hello from the browser!"
```

> **⚠️ Security Warning:** The example above runs code on the main thread with full access to your page. **Do not use `createContainer()` or `container.execute()` with untrusted code.** For untrusted code, use `createRuntime()` with a cross-origin sandbox - see [Sandbox Setup](#sandbox-setup).

### Running Untrusted Code Securely

```typescript
import { createRuntime, VirtualFS } from 'almostnode';

const vfs = new VirtualFS();

// Create a secure runtime with cross-origin isolation
const runtime = await createRuntime(vfs, {
  sandbox: 'https://your-sandbox.vercel.app', // Deploy with generateSandboxFiles()
});

// Now it's safe to run untrusted code
const result = await runtime.execute(untrustedCode);
```

See [Sandbox Setup](#sandbox-setup) for deployment instructions.

### Working with Virtual File System

```typescript
import { createContainer } from 'almostnode';

const container = createContainer();
const { vfs } = container;

// Pre-populate the virtual filesystem
vfs.writeFileSync('/src/index.js', `
  const data = require('./data.json');
  console.log('Users:', data.users.length);
  module.exports = data;
`);

vfs.writeFileSync('/src/data.json', JSON.stringify({
  users: [{ name: 'Alice' }, { name: 'Bob' }]
}));

// Run from the virtual filesystem
const result = container.runFile('/src/index.js');
```

### With npm Packages

```typescript
import { createContainer } from 'almostnode';

const container = createContainer();

// Install a package
await container.npm.install('lodash');

// Use it in your code
container.execute(`
  const _ = require('lodash');
  console.log(_.capitalize('hello world'));
`);
// Output: Hello world
```

### With Next.js Dev Server

```typescript
import { VirtualFS, NextDevServer, getServerBridge } from 'almostnode';

const vfs = new VirtualFS();

// Create a Next.js page
vfs.mkdirSync('/pages', { recursive: true });
vfs.writeFileSync('/pages/index.jsx', `
  import { useState } from 'react';

  export default function Home() {
    const [count, setCount] = useState(0);
    return (
      <div>
        <h1>Count: {count}</h1>
        <button onClick={() => setCount(c => c + 1)}>+</button>
      </div>
    );
  }
`);

// Start the dev server
const server = new NextDevServer(vfs, { port: 3000 });
const bridge = getServerBridge();
await bridge.initServiceWorker();
bridge.registerServer(server, 3000);

// Access at: /__virtual__/3000/
```

---

## Service Worker Setup

almostnode uses a Service Worker to intercept HTTP requests and route them to virtual dev servers (e.g., `ViteDevServer`, `NextDevServer`).

> **Note:** The service worker is only needed if you're using dev servers with URL access (e.g., `/__virtual__/3000/`). If you're only executing code with `runtime.execute()`, you don't need the service worker.

### Which Setup Do I Need?

| Use Case | Setup Required |
|----------|----------------|
| Cross-origin sandbox (recommended for untrusted code) | `generateSandboxFiles()` - includes everything |
| Same-origin with Vite | `almostnodePlugin` from `almostnode/vite` |
| Same-origin with Next.js | `getServiceWorkerContent` from `almostnode/next` |
| Same-origin with other frameworks | Manual copy to public directory |

---

### Option 1: Cross-Origin Sandbox (Recommended)

When using `createRuntime()` with a cross-origin `sandbox` URL, the service worker must be deployed **with the sandbox**, not your main app.

The `generateSandboxFiles()` helper generates all required files:

```typescript
import { generateSandboxFiles } from 'almostnode';
import fs from 'fs';

const files = generateSandboxFiles();

// Creates: index.html, vercel.json, __sw__.js
fs.mkdirSync('sandbox', { recursive: true });
for (const [filename, content] of Object.entries(files)) {
  fs.writeFileSync(`sandbox/${filename}`, content);
}

// Deploy to a different origin:
// cd sandbox && vercel --prod
```

**Generated files:**
| File | Purpose |
|------|---------|
| `index.html` | Sandbox page that loads almostnode and registers the service worker |
| `vercel.json` | CORS headers for cross-origin iframe embedding |
| `__sw__.js` | Service worker for intercepting dev server requests |

See [Sandbox Setup](#sandbox-setup) for full deployment instructions.

---

### Option 2: Same-Origin with Vite

For trusted code using `dangerouslyAllowSameOrigin: true`:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { almostnodePlugin } from 'almostnode/vite';

export default defineConfig({
  plugins: [almostnodePlugin()]
});
```

The plugin serves `/__sw__.js` automatically during development.

**Custom path:**

```typescript
// vite.config.ts
almostnodePlugin({ swPath: '/custom/__sw__.js' })

// Then in your app:
await bridge.initServiceWorker({ swUrl: '/custom/__sw__.js' });
```

---

### Option 3: Same-Origin with Next.js

For trusted code using `dangerouslyAllowSameOrigin: true`:

**App Router:**

```typescript
// app/__sw__.js/route.ts
import { getServiceWorkerContent } from 'almostnode/next';

export async function GET() {
  return new Response(getServiceWorkerContent(), {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-cache',
    },
  });
}
```

**Pages Router:**

```typescript
// pages/api/__sw__.ts
import { getServiceWorkerContent } from 'almostnode/next';
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(getServiceWorkerContent());
}
```

**Initialize with the correct path:**

```typescript
// App Router (file-based route)
await bridge.initServiceWorker({ swUrl: '/__sw__.js' });

// Pages Router (API route)
await bridge.initServiceWorker({ swUrl: '/api/__sw__' });
```

**Available exports from `almostnode/next`:**

| Export | Description |
|--------|-------------|
| `getServiceWorkerContent()` | Returns the service worker file content as a string |
| `getServiceWorkerPath()` | Returns the absolute path to the service worker file |

---

### Option 4: Manual Setup (Other Frameworks)

Copy the service worker to your public directory:

```bash
cp node_modules/almostnode/dist/__sw__.js ./public/
```

Or programmatically:

```typescript
import { getServiceWorkerPath } from 'almostnode/next';
import fs from 'fs';

fs.copyFileSync(getServiceWorkerPath(), './public/__sw__.js');
```

---

## Comparison with WebContainers

| Feature | almostnode | WebContainers |
|---------|-----------|---------------|
| **Bundle Size** | ~250KB gzipped | ~2MB |
| **Startup Time** | Instant | 2-5 seconds |
| **Execution Model** | Main thread or Web Worker (configurable) | Web Worker isolates |
| **Shell** | `just-bash` (POSIX subset) | Full Linux kernel |
| **Native Modules** | Stubs only | Full support |
| **Networking** | Virtual ports | Real TCP/IP |
| **Use Case** | Lightweight playgrounds, demos | Full development environments |

### When to use almostnode

- Building code playgrounds or tutorials
- Creating interactive documentation
- Prototyping without server setup
- Educational tools
- Lightweight sandboxed execution

### Example: Code Playground

```typescript
import { createContainer } from 'almostnode';

function createPlayground() {
  const container = createContainer();

  return {
    run: (code: string) => {
      try {
        const result = container.execute(code);
        return { success: true, result: result.exports };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    reset: () => container.runtime.clearCache(),
  };
}

// Usage
const playground = createPlayground();
const output = playground.run(`
  const crypto = require('crypto');
  module.exports = crypto.randomUUID();
`);
console.log(output); // { success: true, result: "550e8400-e29b-..." }
```

### When to use WebContainers

- Full-fidelity Node.js development
- Running native modules
- Complex build pipelines
- Production-like environments

---

## API Reference

### `createContainer(options?)`

Creates a new container with all components initialized.

```typescript
interface ContainerOptions {
  cwd?: string;           // Working directory (default: '/')
  env?: Record<string, string>;  // Environment variables
  onConsole?: (method: string, args: any[]) => void;  // Console hook
}

const container = createContainer({
  cwd: '/app',
  env: { NODE_ENV: 'development' },
  onConsole: (method, args) => console.log(`[${method}]`, ...args),
});
```

Returns:
- `container.vfs` - VirtualFS instance
- `container.runtime` - Runtime instance
- `container.npm` - PackageManager instance
- `container.serverBridge` - ServerBridge instance

### VirtualFS

Node.js-compatible filesystem API.

```typescript
// Synchronous operations
vfs.writeFileSync(path, content);
vfs.readFileSync(path, encoding?);
vfs.mkdirSync(path, { recursive: true });
vfs.readdirSync(path);
vfs.statSync(path);
vfs.unlinkSync(path);
vfs.rmdirSync(path);
vfs.existsSync(path);
vfs.renameSync(oldPath, newPath);

// Async operations
await vfs.readFile(path, encoding?);
await vfs.stat(path);

// File watching
vfs.watch(path, { recursive: true }, (event, filename) => {
  console.log(`${event}: ${filename}`);
});
```

### Runtime

Execute JavaScript/TypeScript code.

```typescript
// Execute code string
runtime.execute('console.log("Hello")');

// Run a file from VirtualFS
runtime.runFile('/path/to/file.js');

// Require a module
const module = runtime.require('/path/to/module.js');
```

### createRuntime (Async Runtime Factory)

For advanced use cases, use `createRuntime` to create a runtime with security options:

```typescript
import { createRuntime, VirtualFS } from 'almostnode';

const vfs = new VirtualFS();

// RECOMMENDED: Cross-origin sandbox (fully isolated)
const secureRuntime = await createRuntime(vfs, {
  sandbox: 'https://your-sandbox.vercel.app',
});

// For demos/trusted code: Same-origin with explicit opt-in
const demoRuntime = await createRuntime(vfs, {
  dangerouslyAllowSameOrigin: true,
  useWorker: true,  // Optional: run in Web Worker
  cwd: '/project',
  env: { NODE_ENV: 'development' },
});

// Both modes use the same async API
const result = await secureRuntime.execute('module.exports = 1 + 1;');
console.log(result.exports); // 2
```

#### Security Modes

| Mode | Option | Security Level | Use Case |
|------|--------|----------------|----------|
| **Cross-origin sandbox** | `sandbox: 'https://...'` | Highest | Production, untrusted code |
| **Same-origin Worker** | `dangerouslyAllowSameOrigin: true, useWorker: true` | Medium | Demos with trusted code |
| **Same-origin main thread** | `dangerouslyAllowSameOrigin: true` | Lowest | Trusted code only |

**Security by default:** `createRuntime()` throws an error if neither `sandbox` nor `dangerouslyAllowSameOrigin` is provided.

---

## Sandbox Setup

For running untrusted code securely, deploy a cross-origin sandbox. The key requirement is that the sandbox must be served from a **different origin** (different domain, subdomain, or port).

### Quick Setup (Vercel)

```typescript
import { generateSandboxFiles } from 'almostnode';
import fs from 'fs';

const files = generateSandboxFiles();
// Generates: index.html, vercel.json, __sw__.js

fs.mkdirSync('sandbox', { recursive: true });
for (const [filename, content] of Object.entries(files)) {
  fs.writeFileSync(`sandbox/${filename}`, content);
}

// Deploy: cd sandbox && vercel --prod
```

The generated files include:
- `index.html` - Sandbox page with service worker registration
- `vercel.json` - CORS headers for cross-origin iframe embedding
- `__sw__.js` - Service worker for dev server URL access

### Manual Setup (Any Platform)

The sandbox requires two things:

#### 1. The sandbox HTML page

Create an `index.html` that loads almostnode and handles postMessage:

```html
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
<script type="module">
  import { VirtualFS, Runtime } from 'https://unpkg.com/almostnode/dist/index.js';

  let vfs = null;
  let runtime = null;

  window.addEventListener('message', async (event) => {
    const { type, id, code, filename, vfsSnapshot, options, path, content } = event.data;

    try {
      switch (type) {
        case 'init':
          vfs = VirtualFS.fromSnapshot(vfsSnapshot);
          runtime = new Runtime(vfs, {
            cwd: options?.cwd,
            env: options?.env,
            onConsole: (method, args) => {
              parent.postMessage({ type: 'console', consoleMethod: method, consoleArgs: args }, '*');
            },
          });
          break;
        case 'execute':
          const result = runtime.execute(code, filename);
          parent.postMessage({ type: 'result', id, result }, '*');
          break;
        case 'runFile':
          const runResult = runtime.runFile(filename);
          parent.postMessage({ type: 'result', id, result: runResult }, '*');
          break;
        case 'syncFile':
          if (content === null) { try { vfs.unlinkSync(path); } catch {} }
          else { vfs.writeFileSync(path, content); }
          break;
        case 'clearCache':
          runtime?.clearCache();
          break;
      }
    } catch (error) {
      if (id) parent.postMessage({ type: 'error', id, error: error.message }, '*');
    }
  });

  parent.postMessage({ type: 'ready' }, '*');
</script>
</body>
</html>
```

#### 2. Required HTTP headers

The sandbox server must include these headers:

```
Access-Control-Allow-Origin: *
Cross-Origin-Resource-Policy: cross-origin
```

**Example configurations:**

<details>
<summary>Nginx</summary>

```nginx
server {
    listen 3002;
    root /path/to/sandbox;

    location / {
        add_header Access-Control-Allow-Origin *;
        add_header Cross-Origin-Resource-Policy cross-origin;
    }
}
```
</details>

<details>
<summary>Apache (.htaccess)</summary>

```apache
Header set Access-Control-Allow-Origin "*"
Header set Cross-Origin-Resource-Policy "cross-origin"
```
</details>

<details>
<summary>Express.js</summary>

```javascript
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
app.use(express.static('sandbox'));
app.listen(3002);
```
</details>

<details>
<summary>Python (http.server)</summary>

```python
from http.server import HTTPServer, SimpleHTTPRequestHandler

class CORSHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cross-Origin-Resource-Policy', 'cross-origin')
        super().end_headers()

HTTPServer(('', 3002), CORSHandler).serve_forever()
```
</details>

### Use in your app

```typescript
const runtime = await createRuntime(vfs, {
  sandbox: 'https://sandbox.yourdomain.com',  // Must be different origin!
});

// Code runs in isolated cross-origin iframe
const result = await runtime.execute(untrustedCode);
```

### Local Development

For local testing, run the sandbox on a different port:

```bash
# Terminal 1: Main app on port 5173
npm run dev

# Terminal 2: Sandbox on port 3002
npm run sandbox
```

Then use `sandbox: 'http://localhost:3002/sandbox/'` in your app.

### What cross-origin sandbox protects

| Threat | Status |
|--------|--------|
| Cookies | Blocked (different origin) |
| localStorage | Blocked (different origin) |
| IndexedDB | Blocked (different origin) |
| DOM access | Blocked (cross-origin iframe) |

**Note:** Network requests from the sandbox are still possible. Add CSP headers for additional protection.

### PackageManager

Install npm packages.

```typescript
// Install a package
await npm.install('react');
await npm.install('lodash@4.17.21');

// Install multiple packages
await npm.install(['react', 'react-dom']);
```

---

## Supported Node.js APIs

**967 compatibility tests** verify our Node.js API coverage.

### Fully Shimmed Modules

| Module | Tests | Coverage | Notes |
|--------|-------|----------|-------|
| `path` | 219 | High | POSIX paths (no Windows) |
| `buffer` | 95 | High | All common operations |
| `fs` | 76 | High | Sync + promises API |
| `url` | 67 | High | WHATWG URL + legacy parser |
| `util` | 77 | High | format, inspect, promisify |
| `process` | 60 | High | env, cwd, hrtime, EventEmitter |
| `events` | 50 | High | Full EventEmitter API |
| `os` | 58 | High | Platform info (simulated) |
| `crypto` | 57 | High | Hash, HMAC, random, sign/verify |
| `querystring` | 52 | High | parse, stringify, escape |
| `stream` | 44 | Medium | Readable, Writable, Transform |
| `zlib` | 39 | High | gzip, deflate, brotli |
| `tty` | 40 | High | ReadStream, WriteStream |
| `perf_hooks` | 33 | High | Performance API |

### Stubbed Modules

These modules export empty objects or no-op functions:
- `net`, `tls`, `dns`, `dgram`
- `cluster`, `worker_threads`
- `vm`, `v8`, `inspector`
- `async_hooks`

---

## Framework Support

### Vite

```typescript
import { VirtualFS, ViteDevServer, getServerBridge } from 'almostnode';

const vfs = new VirtualFS();

// Create a React app
vfs.writeFileSync('/index.html', `
  <!DOCTYPE html>
  <html>
    <body>
      <div id="root"></div>
      <script type="module" src="/src/main.jsx"></script>
    </body>
  </html>
`);

vfs.mkdirSync('/src', { recursive: true });
vfs.writeFileSync('/src/main.jsx', `
  import React from 'react';
  import ReactDOM from 'react-dom/client';

  function App() {
    return <h1>Hello Vite!</h1>;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
`);

// Start Vite dev server
const server = new ViteDevServer(vfs, { port: 5173 });
```

### Next.js

Supports both **Pages Router** and **App Router**:

#### Pages Router

```
/pages
  /index.jsx      → /
  /about.jsx      → /about
  /users/[id].jsx → /users/:id
  /api/hello.js   → /api/hello
```

#### App Router

```
/app
  /layout.jsx           → Root layout
  /page.jsx             → /
  /about/page.jsx       → /about
  /users/[id]/page.jsx  → /users/:id
```

---

## Hot Module Replacement (HMR)

almostnode includes built-in Hot Module Replacement support for instant updates during development. When you edit files, changes appear immediately in the preview without a full page reload.

### How It Works

HMR is automatically enabled when using `NextDevServer` or `ViteDevServer`. The system uses:

1. **VirtualFS file watching** - Detects file changes via `vfs.watch()`
2. **postMessage API** - Communicates updates between the main page and preview iframe
3. **React Refresh** - Preserves React component state during updates

```typescript
// HMR works automatically - just edit files and save
vfs.writeFileSync('/app/page.tsx', updatedContent);
// The preview iframe will automatically refresh with the new content
```

### Setup Requirements

For security, the preview iframe should be sandboxed. HMR uses `postMessage` for communication, which works correctly with sandboxed iframes:

```typescript
// Create sandboxed iframe for security
const iframe = document.createElement('iframe');
iframe.src = '/__virtual__/3000/';
// Sandbox restricts the iframe's capabilities - add only what you need
iframe.sandbox = 'allow-forms allow-scripts allow-same-origin allow-popups';
container.appendChild(iframe);

// Register the iframe as HMR target after it loads
iframe.onload = () => {
  if (iframe.contentWindow) {
    devServer.setHMRTarget(iframe.contentWindow);
  }
};
```

**Recommended sandbox permissions:**
- `allow-scripts` - Required for JavaScript execution
- `allow-same-origin` - Allows the iframe to access cookies, localStorage, and IndexedDB (only add if your app needs these; omit for better isolation)
- `allow-forms` - If your app uses forms
- `allow-popups` - If your app opens new windows/tabs

> **Note:** The service worker intercepts `/__virtual__/` requests at the origin level, not the iframe level. The `allow-same-origin` attribute does NOT affect service worker functionality. For maximum security isolation, consider using **cross-origin sandbox mode** (see below) which doesn't use `allow-same-origin`.

### Manual HMR Triggering

If you need to manually trigger HMR updates (e.g., after programmatic file changes):

```typescript
function triggerHMR(path: string, iframe: HTMLIFrameElement): void {
  if (iframe.contentWindow) {
    iframe.contentWindow.postMessage({
      type: 'update',
      path,
      timestamp: Date.now(),
      channel: 'next-hmr', // Use 'vite-hmr' for Vite
    }, '*');
  }
}

// After writing a file
vfs.writeFileSync('/app/page.tsx', newContent);
triggerHMR('/app/page.tsx', iframe);
```

### Supported File Types

| File Type | HMR Behavior |
|-----------|--------------|
| `.jsx`, `.tsx` | React Refresh (preserves state) |
| `.js`, `.ts` | Full module reload |
| `.css` | Style injection (no reload) |
| `.json` | Full page reload |

---

## Development

### Setup

```bash
git clone https://github.com/macaly/almostnode.git
cd almostnode
npm install
```

### Run Tests

```bash
# Unit tests
npm test

# E2E tests (requires Playwright)
npm run test:e2e
```

### Development Server

```bash
npm run dev
```

Open `http://localhost:5173/examples/next-demo.html` to see the Next.js demo.

---

## Contributing

We welcome contributions! Whether you're fixing bugs, adding Node.js API shims, improving documentation, or building new features, your help is appreciated.

Check out our **[Contributing Guide](CONTRIBUTING.md)** to get started.

Before contributing:
1. Read the [Contributing Guide](CONTRIBUTING.md)
2. Check existing [issues](https://github.com/macaly/almostnode/issues) and [discussions](https://github.com/macaly/almostnode/discussions)
3. Follow the code style and conventions
4. Add tests for new features
5. Update documentation as needed

**Quick links:**
- [Report a bug](https://github.com/macaly/almostnode/issues/new?template=bug_report.yml)
- [Request a feature](https://github.com/macaly/almostnode/issues/new?template=feature_request.yml)
- [View discussions](https://github.com/macaly/almostnode/discussions)

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [esbuild-wasm](https://github.com/evanw/esbuild) - Lightning-fast JavaScript/TypeScript transformation
- [just-bash](https://github.com/user/just-bash) - POSIX shell in WebAssembly
- [React Refresh](https://github.com/facebook/react/tree/main/packages/react-refresh) - Hot module replacement for React
- [Comlink](https://github.com/GoogleChromeLabs/comlink) - Web Worker communication made simple

---

<p align="center">
  Built by the creators of <a href="https://macaly.com">Macaly.com</a>
</p>
