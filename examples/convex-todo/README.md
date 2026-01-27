# Convex Todo - Browser Runtime Demo

This demo showcases running the Convex CLI entirely in the browser using our WebContainer-like runtime.

## What This Demonstrates

- **Browser-based Convex deployment**: Edit Convex functions and deploy them directly from the browser
- **Real-time sync**: Changes to your Convex backend are reflected immediately in the React app
- **No local tooling required**: Everything runs in the browser - no need for Node.js, npm, or local CLI installation

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                             │
├─────────────────────────┬───────────────────────────────┤
│    Editor Panel         │        Preview Panel           │
│    (Edit Convex code)   │        (React Todo App)        │
├─────────────────────────┴───────────────────────────────┤
│                    Virtual Runtime                       │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ VirtualFS   │  │ PackageManager│  │ Runtime (JS)  │  │
│  │ (in-memory) │  │ (CDN fetch)   │  │ (CommonJS)    │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────────┤
│                   Convex CLI Bundle                      │
│  Runs `convex dev --once` to deploy functions           │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
                   Convex Cloud API
```

## How It Works

1. **Virtual File System**: Files are stored in-memory using VirtualFS
2. **Package Manager**: NPM packages are fetched from esm.sh/unpkg CDN
3. **Runtime**: CommonJS modules are executed in a sandboxed environment
4. **Convex CLI**: The bundled CLI runs entirely in the browser
5. **React App**: Uses the Convex React client to connect to the deployed backend

## Files

- `src/hooks/useConvexRuntime.ts` - The runtime integration hook
- `src/components/Editor.tsx` - Code editor for Convex functions
- `src/components/TodoList.tsx` - React todo list using Convex
- `src/components/DeployButton.tsx` - Deploy button with status

## Running the Demo

```bash
# From the examples/convex-todo directory
npm install
npm run dev
```

## Current Limitations

- The runtime is still in development
- Some Node.js APIs are shimmed/stubbed
- Network requests go through the browser (CORS considerations)

## Related

See the test file `tests/convex-cli.test.ts` for the working integration tests that this demo is based on.
