# Just Node + Convex Tutorial

Build and deploy real-time Convex applications entirely in the browser using Just Node's virtual Node.js runtime.

## Table of Contents

- [Introduction](#introduction)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Complete Example: Convex Deployment](#complete-example-convex-deployment)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

---

## Introduction

**Just Node** provides a complete Node.js-compatible runtime that runs in your browser. You can:

- Create a virtual filesystem with project files
- Install npm packages (including Convex)
- Run the Convex CLI to deploy schemas and functions
- Start a Next.js dev server with hot module reload
- Use real-time Convex data sync in your app

All without any backend server - everything runs client-side.

### Key Concepts

| Component | Description |
|-----------|-------------|
| `VirtualFS` | In-memory filesystem that mimics Node.js `fs` module |
| `Runtime` | Executes JavaScript/TypeScript with Node.js-compatible APIs |
| `PackageManager` | Installs npm packages from the registry |
| `NextDevServer` | Serves Next.js apps with JSX/TS transforms and HMR |

---

## Quick Start

### Minimal Example

```typescript
import { VirtualFS, Runtime, NextDevServer, PackageManager } from 'just-node';
import { getServerBridge } from 'just-node/server-bridge';

// 1. Create virtual filesystem
const vfs = new VirtualFS();

// 2. Write project files
vfs.writeFileSync('/package.json', JSON.stringify({ name: 'my-app' }));
vfs.mkdirSync('/app', { recursive: true });
vfs.writeFileSync('/app/page.tsx', `
  export default function Home() {
    return <h1>Hello from Just Node!</h1>;
  }
`);

// 3. Create and start the dev server
const server = new NextDevServer(vfs, {
  port: 3000,
  preferAppRouter: true,
});

// 4. Register with the server bridge (enables Service Worker routing)
const bridge = getServerBridge();
await bridge.initServiceWorker();
bridge.registerServer(server, 3000);
server.start();

// 5. Navigate to the app
const url = bridge.getServerUrl(3000);
console.log(`App running at: ${url}`);
```

---

## API Reference

### VirtualFS

An in-memory filesystem implementation compatible with Node.js `fs` module.

```typescript
import { VirtualFS } from 'just-node';

const vfs = new VirtualFS();

// Write files
vfs.writeFileSync('/package.json', '{ "name": "my-app" }');
vfs.mkdirSync('/src', { recursive: true });
vfs.writeFileSync('/src/index.ts', 'export const hello = "world";');

// Read files
const content = vfs.readFileSync('/src/index.ts', 'utf8');

// Check existence
if (vfs.existsSync('/package.json')) {
  console.log('Package.json exists');
}

// List directories
const files = vfs.readdirSync('/src');

// Watch for changes
vfs.watch('/src', { recursive: true }, (event, filename) => {
  console.log(`File ${event}: ${filename}`);
});
```

### PackageManager

Install npm packages into the virtual filesystem.

```typescript
import { PackageManager } from 'just-node';

const npm = new PackageManager(vfs, { cwd: '/project' });

// Install a package
await npm.install('convex', {
  onProgress: (msg) => console.log(msg),
});

// Install multiple packages
await npm.install(['react', 'react-dom']);
```

### Runtime

Execute JavaScript/TypeScript code with Node.js-compatible globals.

```typescript
import { Runtime } from 'just-node';

const runtime = new Runtime(vfs, {
  cwd: '/project',
  env: { NODE_ENV: 'development' },
  onConsole: (method, args) => console.log(`[${method}]`, ...args),
});

// Execute inline code
runtime.execute(`
  const fs = require('fs');
  const data = fs.readFileSync('/package.json', 'utf8');
  console.log('Package:', JSON.parse(data).name);
`, '/runner.js');

// Execute a file
runtime.executeFile('/project/src/index.js');
```

### NextDevServer

A lightweight Next.js-compatible development server.

```typescript
import { NextDevServer } from 'just-node';

const server = new NextDevServer(vfs, {
  port: 3000,
  root: '/',
  preferAppRouter: true,  // Use /app directory (default: auto-detect)
  env: {
    NEXT_PUBLIC_API_URL: 'https://api.example.com',
    NEXT_PUBLIC_CONVEX_URL: 'https://my-deployment.convex.cloud',
  },
});

// Start the server
server.start();

// Set environment variables at runtime (after deployment)
server.setEnv('NEXT_PUBLIC_CONVEX_URL', 'https://new-url.convex.cloud');

// Get current env vars
const env = server.getEnv();

// Listen for HMR updates
server.on('hmr-update', (update) => {
  console.log('Hot update:', update);
});

// Stop the server
server.stop();
```

### Server Bridge

Connects virtual servers to the browser via Service Workers.

```typescript
import { getServerBridge } from 'just-node/server-bridge';

const bridge = getServerBridge();

// Initialize the Service Worker
await bridge.initServiceWorker();

// Register a server
bridge.registerServer(server, 3000);

// Get the URL to access the server
const url = bridge.getServerUrl(3000);
// Returns: "/__virtual__/3000"

// Unregister when done
bridge.unregisterServer(3000);
```

---

## Complete Example: Convex Deployment

This example shows how to:
1. Create a project structure
2. Install the Convex package
3. Deploy to Convex cloud
4. Run a real-time todo app

### Step 1: Create Project Structure

```typescript
import { VirtualFS, Runtime, NextDevServer, PackageManager } from 'just-node';

const vfs = new VirtualFS();

// Package.json
vfs.writeFileSync('/project/package.json', JSON.stringify({
  name: 'convex-todo',
  dependencies: { convex: '^1.0.0' }
}, null, 2));

// Convex configuration
vfs.writeFileSync('/project/convex.json', JSON.stringify({
  functions: 'convex/'
}, null, 2));

// Convex config files (BOTH .ts and .js required!)
const convexConfig = `import { defineApp } from "convex/server";
const app = defineApp();
export default app;
`;
vfs.mkdirSync('/project/convex', { recursive: true });
vfs.writeFileSync('/project/convex/convex.config.ts', convexConfig);
vfs.writeFileSync('/project/convex/convex.config.js', convexConfig);
```

### Step 2: Define Schema and Functions

```typescript
// Schema
vfs.writeFileSync('/project/convex/schema.ts', `
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  todos: defineTable({
    text: v.string(),
    completed: v.boolean(),
  }),
});
`);

// Functions
vfs.writeFileSync('/project/convex/todos.ts', `
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("todos").order("desc").collect();
  },
});

export const create = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("todos", {
      text: args.text,
      completed: false,
    });
  },
});

export const toggle = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, args) => {
    const todo = await ctx.db.get(args.id);
    if (todo) {
      await ctx.db.patch(args.id, { completed: !todo.completed });
    }
  },
});
`);
```

### Step 3: Install Convex Package

```typescript
const npm = new PackageManager(vfs, { cwd: '/project' });

await npm.install('convex', {
  onProgress: (msg) => console.log(`[npm] ${msg}`),
});
```

### Step 4: Deploy to Convex

```typescript
// Runtime instance for CLI (will be recreated for each deployment)
let cliRuntime: Runtime | null = null;

async function deployToConvex(deployKey: string): Promise<string> {
  // CRITICAL: Create a fresh Runtime for each deployment
  // This ensures the CLI sees the latest file changes (avoids stale closures)
  cliRuntime = new Runtime(vfs, { cwd: '/project' });

  // IMPORTANT: Remove existing _generated directories
  // (CLI skips push if it finds stale generated files)
  const genPaths = ['/project/convex/_generated', '/convex/_generated'];
  for (const path of genPaths) {
    if (vfs.existsSync(path)) {
      for (const file of vfs.readdirSync(path)) {
        vfs.unlinkSync(`${path}/${file}`);
      }
      vfs.rmdirSync(path);
    }
  }

  // Run Convex CLI
  const cliCode = `
    process.env.CONVEX_DEPLOY_KEY = '${deployKey}';
    process.argv = ['node', 'convex', 'dev', '--once'];
    require('./node_modules/convex/dist/cli.bundle.cjs');
  `;

  try {
    cliRuntime.execute(cliCode, '/project/cli-runner.js');
  } catch (error) {
    // Some errors are expected (process.exit, etc.)
    console.log('CLI completed:', error.message);
  }

  // Wait for deployment to complete
  await waitForDeployment(vfs);
  await waitForGenerated(vfs);

  // Read the deployed URL from .env.local
  const envContent = vfs.readFileSync('/project/.env.local', 'utf8');
  const match = envContent.match(/CONVEX_URL=(.+)/);
  if (!match) throw new Error('Deployment failed');

  const convexUrl = match[1].trim();

  // Copy generated files to where the app expects them
  copyGeneratedFiles(vfs);

  return convexUrl;
}

// Helper: Poll for .env.local creation
async function waitForDeployment(vfs, maxWait = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (vfs.existsSync('/project/.env.local')) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// Helper: Poll for _generated directory
async function waitForGenerated(vfs, maxWait = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (vfs.existsSync('/project/convex/_generated')) {
      const files = vfs.readdirSync('/project/convex/_generated');
      if (files.length > 0) return true;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// Helper: Copy generated files and create .ts versions
function copyGeneratedFiles(vfs) {
  const srcDir = '/project/convex/_generated';
  const destDir = '/convex/_generated';

  vfs.mkdirSync(destDir, { recursive: true });

  for (const file of vfs.readdirSync(srcDir)) {
    const content = vfs.readFileSync(`${srcDir}/${file}`, 'utf8');
    vfs.writeFileSync(`${destDir}/${file}`, content);

    // Also copy .js as .ts for Next.js imports
    if (file.endsWith('.js') && !file.endsWith('.d.js')) {
      vfs.writeFileSync(`${destDir}/${file.replace('.js', '.ts')}`, content);
    }
  }
}
```

### Step 5: Start Dev Server with Env Vars

```typescript
import { getServerBridge } from 'just-node/server-bridge';

// Deploy and get the URL
const convexUrl = await deployToConvex('dev:my-project|token...');

// Create server with env vars
const server = new NextDevServer(vfs, {
  port: 3000,
  preferAppRouter: true,
  env: {
    NEXT_PUBLIC_CONVEX_URL: convexUrl,
  },
});

// Register and start
const bridge = getServerBridge();
await bridge.initServiceWorker();
bridge.registerServer(server, 3000);
server.start();

console.log(`App running at: ${bridge.getServerUrl(3000)}`);
```

### Step 6: Re-Deploying After Code Changes

When you edit files in the `convex/` directory (schemas, functions, etc.), simply call `deployToConvex()` again:

```typescript
// User edits convex/todos.ts to add a new mutation...
vfs.writeFileSync('/project/convex/todos.ts', updatedTodosCode);

// Re-deploy - the fresh Runtime ensures changes are picked up
const newConvexUrl = await deployToConvex('dev:my-project|token...');

// The server already has NEXT_PUBLIC_CONVEX_URL set, so the app
// will automatically use the updated functions
```

**Why this works:**
1. `deployToConvex()` creates a **fresh Runtime** each time (avoiding stale closures)
2. The `_generated` directories are cleared before each run
3. The CLI bundles and pushes the current file contents
4. Your app immediately sees the updated functions

No server restart needed - the Convex client in your app will automatically sync with the new backend functions.

### Step 7: Use Convex in React Components

```tsx
// /app/page.tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function TodoApp() {
  const todos = useQuery(api.todos.list);
  const createTodo = useMutation(api.todos.create);
  const toggleTodo = useMutation(api.todos.toggle);

  return (
    <div>
      <h1>Todos</h1>
      <form onSubmit={(e) => {
        e.preventDefault();
        const input = e.target.elements.text;
        createTodo({ text: input.value });
        input.value = '';
      }}>
        <input name="text" placeholder="New todo..." />
        <button type="submit">Add</button>
      </form>

      {todos?.map((todo) => (
        <div key={todo._id}>
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={() => toggleTodo({ id: todo._id })}
          />
          <span style={{ textDecoration: todo.completed ? 'line-through' : 'none' }}>
            {todo.text}
          </span>
        </div>
      ))}
    </div>
  );
}
```

---

## Environment Variables

### Setting Environment Variables

Pass environment variables when creating the server:

```typescript
const server = new NextDevServer(vfs, {
  port: 3000,
  env: {
    NEXT_PUBLIC_API_URL: 'https://api.example.com',
    NEXT_PUBLIC_CONVEX_URL: 'https://my-deployment.convex.cloud',
  },
});
```

### Updating at Runtime

Set environment variables after the server starts:

```typescript
// After deployment completes
server.setEnv('NEXT_PUBLIC_CONVEX_URL', convexUrl);

// Refresh the iframe to pick up the new value
iframe.src = iframe.src;
```

### Using in Browser Code

`NEXT_PUBLIC_*` variables are available via `process.env`:

```typescript
// This works in browser code (Next.js pattern)
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

// The server injects this script into the HTML:
// <script>
//   window.process = window.process || {};
//   window.process.env = { NEXT_PUBLIC_CONVEX_URL: "https://..." };
// </script>
```

---

## Troubleshooting

### Functions Not Appearing in Dashboard

**Cause**: CLI found existing `_generated` directory and skipped the push.

**Solution**: Always remove `_generated` directories before running the CLI.

### Blank Page After Deployment

**Cause**: Next.js imports `.ts` files but CLI generates `.js` files.

**Solution**: Copy generated `.js` files as both `.js` and `.ts` versions.

### "Cannot find module" Errors

**Cause**: Generated API files not copied to the correct location.

**Solution**: Copy files from `/project/convex/_generated/` to `/convex/_generated/`.

### Deployment Times Out

**Cause**: Network issues or invalid deploy key.

**Solution**: Check deploy key format: `dev:deployment-name|token` or `prod:deployment-name|token`

### CLI Errors but Deployment Works

Some CLI errors are expected (like `process.exit` calls). The deployment happens before these errors. Check if `.env.local` was created to verify success.

---

## Additional Resources

- [Convex Documentation](https://docs.convex.dev)
- [Convex Dashboard](https://dashboard.convex.dev)
- [Just Node API Documentation](./API.md)
- [CLI Integration Details](./CONVEX_CLI_INTEGRATION.md)
