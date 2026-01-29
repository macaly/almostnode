# just-node

**Node.js in your browser. Just like that.**

A lightweight, browser-native Node.js runtime environment. Run Node.js code, install npm packages, and develop with Vite or Next.js - all without a server.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

---

## Features

- **Virtual File System** - Full in-memory filesystem with Node.js-compatible API
- **Node.js API Shims** - 40+ shimmed modules (`fs`, `path`, `http`, `events`, and more)
- **npm Package Installation** - Install and run real npm packages in the browser
- **Dev Servers** - Built-in Vite and Next.js development servers
- **Hot Module Replacement** - React Refresh support for instant updates
- **TypeScript Support** - First-class TypeScript/TSX transformation via esbuild-wasm
- **Service Worker Architecture** - Intercepts requests for seamless dev experience

---

## Quick Start

### Installation

```bash
npm install just-node
```

### Basic Usage

```typescript
import { createContainer } from 'just-node';

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

### Working with Virtual File System

```typescript
import { createContainer } from 'just-node';

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
import { createContainer } from 'just-node';

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
import { VirtualFS, NextDevServer, getServerBridge } from 'just-node';

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

## Comparison with WebContainers

| Feature | just-node | WebContainers |
|---------|-----------|---------------|
| **Bundle Size** | ~50KB | ~2MB |
| **Startup Time** | Instant | 2-5 seconds |
| **Execution Model** | Browser main thread | Web Worker isolates |
| **Shell** | `just-bash` (POSIX subset) | Full Linux kernel |
| **Native Modules** | Stubs only | Full support |
| **Networking** | Virtual ports | Real TCP/IP |
| **Use Case** | Lightweight playgrounds, demos | Full development environments |

### When to use just-node

- Building code playgrounds or tutorials
- Creating interactive documentation
- Prototyping without server setup
- Educational tools
- Lightweight sandboxed execution

### Example: Code Playground

```typescript
import { createContainer } from 'just-node';

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
import { VirtualFS, ViteDevServer, getServerBridge } from 'just-node';

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

just-node includes built-in Hot Module Replacement support for instant updates during development. When you edit files, changes appear immediately in the preview without a full page reload.

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
- `allow-same-origin` - Required for the service worker to intercept requests
- `allow-forms` - If your app uses forms
- `allow-popups` - If your app opens new windows/tabs

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
git clone https://github.com/user/just-node.git
cd just-node
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

Open `http://localhost:5173/next-demo.html` to see the Next.js demo.

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [esbuild-wasm](https://github.com/evanw/esbuild) - Lightning-fast JavaScript/TypeScript transformation
- [just-bash](https://github.com/user/just-bash) - POSIX shell in WebAssembly
- [React Refresh](https://github.com/facebook/react/tree/main/packages/react-refresh) - Hot module replacement for React

---

<p align="center">
  Made with care for the browser
</p>
