# Convex CLI Integration in Browser Runtime

This document explains how to run `convex dev --once` in the browser-based virtual Node.js runtime.

## Working Example

Reference implementation: `examples/convex-todo/src/hooks/useConvexRuntime.ts`

## Key Requirements

### 1. Use `runtime.execute()` with Inline Code

**DO NOT** use `just-bash` exec or spawn commands. The Convex CLI must be run via `runtime.execute()` with inline JavaScript that:

```typescript
const cliCode = `
  // Set environment for Convex CLI
  process.env.CONVEX_DEPLOY_KEY = '${deployKey}';

  // Set CLI arguments
  process.argv = ['node', 'convex', 'dev', '--once'];

  // Run the CLI - use RELATIVE path from cwd
  require('./node_modules/convex/dist/cli.bundle.cjs');
`;

const runtime = new Runtime(vfs, { cwd: '/' });
runtime.execute(cliCode, '/cli-runner.js');
```

### 2. Create BOTH `.ts` AND `.js` Config Files

The Convex CLI bundler looks for both versions. You must create:

```typescript
// convex/convex.config.ts
vfs.writeFileSync('/convex/convex.config.ts', `
import { defineApp } from "convex/server";
const app = defineApp();
export default app;
`);

// convex/convex.config.js - ALSO REQUIRED!
vfs.writeFileSync('/convex/convex.config.js', `
import { defineApp } from "convex/server";
const app = defineApp();
export default app;
`);
```

### 3. Wait for Async Operations

The CLI makes network requests asynchronously. Use smart polling instead of fixed timeouts:

```typescript
try {
  runtime.execute(cliCode, '/cli-runner.js');
} catch (cliError) {
  // Some errors are expected (process.exit, stack overflow in watcher)
  // The deployment work happens BEFORE these errors
  console.log('CLI completed with:', cliError.message);
}

// Poll for .env.local creation (indicates deployment configured)
async function waitForDeployment(vfs, maxWait = 30000, pollInterval = 500) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    if (vfs.existsSync('/project/.env.local')) return true;
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  return false;
}

// Poll for _generated directory (indicates functions were bundled)
async function waitForGenerated(vfs, maxWait = 15000, pollInterval = 500) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    if (vfs.existsSync('/project/convex/_generated')) {
      const files = vfs.readdirSync('/project/convex/_generated');
      if (files.length > 0) return true;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  return false;
}

// Wait for both .env.local AND _generated directory
await waitForDeployment(vfs);
await waitForGenerated(vfs);
```

**IMPORTANT**: The CLI creates `.env.local` first, then bundles functions asynchronously. You must wait for BOTH to complete before checking deployment success.

### 4. Check `.env.local` for Success

After deployment, the CLI creates `.env.local` with the Convex URL:

```typescript
if (vfs.existsSync('/project/.env.local')) {
  const envContent = vfs.readFileSync('/project/.env.local', 'utf8');
  const match = envContent.match(/CONVEX_URL=(.+)/);
  if (match) {
    const convexUrl = match[1].trim();
    // Deployment succeeded!
  }
}
```

### 5. Copy Generated Files to App Directory

**IMPORTANT**: The CLI generates files in `/project/convex/_generated/`, but your app reads from `/convex/_generated/`. You must copy the generated files:

```typescript
if (vfs.existsSync('/project/convex/_generated')) {
  const generated = vfs.readdirSync('/project/convex/_generated');

  // Copy to where the app expects them
  vfs.mkdirSync('/convex/_generated', { recursive: true });
  for (const file of generated) {
    const content = vfs.readFileSync(`/project/convex/_generated/${file}`, 'utf8');
    vfs.writeFileSync(`/convex/_generated/${file}`, content);
  }
}
```

The generated files include:
- `api.js` / `api.d.ts` - API references for your functions
- `server.js` / `server.d.ts` - Server-side helpers
- `dataModel.d.ts` - TypeScript types for your schema

### 5. Required Project Structure

```
/
├── package.json              # With convex dependency
├── convex.json               # { "functions": "convex/" }
├── convex/
│   ├── convex.config.ts      # REQUIRED
│   ├── convex.config.js      # ALSO REQUIRED
│   ├── schema.ts
│   └── [your functions].ts
└── node_modules/
    └── convex/
        └── dist/
            └── cli.bundle.cjs
```

## What DOESN'T Work

1. **Using `just-bash` exec/spawn** - The shell doesn't have `node` or `npx` commands
2. **Missing convex.config.js** - CLI bundler fails silently
3. **Not waiting for async** - Deployment may not complete
4. **Using absolute require path** - Must be relative: `require('./node_modules/...')`

### 6. Remove `_generated` Before CLI Runs

**CRITICAL**: The CLI checks for existing `_generated` directory and **skips the push** if it finds one with stale files. Always remove it before running the CLI:

```typescript
// CRITICAL: Remove existing _generated directories before CLI runs
const generatedPaths = ['/project/convex/_generated', '/convex/_generated'];
for (const genPath of generatedPaths) {
  if (vfs.existsSync(genPath)) {
    const files = vfs.readdirSync(genPath);
    for (const file of files) {
      vfs.unlinkSync(`${genPath}/${file}`);
    }
    vfs.rmdirSync(genPath);
  }
}
```

### 7. Copy `.js` Files as `.ts` for Next.js

The CLI generates `.js` files, but Next.js/TypeScript apps import `.ts` files. You must copy both versions:

```typescript
// Copy generated files AND create .ts versions
for (const file of generated) {
  const content = vfs.readFileSync(`/project/convex/_generated/${file}`, 'utf8');
  vfs.writeFileSync(`/convex/_generated/${file}`, content);

  // CRITICAL: Also copy .js as .ts for Next.js imports
  if (file.endsWith('.js') && !file.endsWith('.d.js')) {
    const tsPath = `/convex/_generated/${file.replace(/\.js$/, '.ts')}`;
    vfs.writeFileSync(tsPath, content);
  }
}
```

### 8. Fresh Runtime for Each Deployment

**IMPORTANT**: Create a **fresh Runtime instance** for each deployment to ensure code changes are picked up correctly:

```typescript
let cliRuntime: Runtime | null = null;

async function deployToConvex(adminKey: string): Promise<void> {
  // CRITICAL: Always create a fresh Runtime for each deployment
  // This ensures the CLI sees the latest file changes and avoids stale closures
  cliRuntime = new Runtime(vfs, { cwd: '/project' });

  // ... run CLI with cliRuntime.execute() ...
}
```

**Why fresh Runtime?** The Convex CLI captures file contents in closures during bundling. If you reuse the same Runtime instance, these closures may contain stale references to old file contents, causing re-deployments to push outdated code even when files have changed.

This pattern ensures that:
- Re-deploying after editing `convex/*.ts` files works correctly
- The CLI always sees the current state of the virtual filesystem
- Each deployment is independent and predictable

## Deploy Key Format

```
dev:deployment-name|base64token
prod:deployment-name|base64token
```

Example: `dev:my-deployment-123|eyJ2MiI6IjAwMDA...`

The deployment name is extracted to form the URL: `https://deployment-name.convex.cloud`

## Troubleshooting

### Functions Not Appearing in Dashboard

**Symptom**: Deployment completes but functions don't appear in the Convex dashboard.

**Cause**: CLI found existing `_generated` directory and skipped the push.

**Solution**: Remove `_generated` directories before running the CLI (see section 6).

### Blank Page After Deployment

**Symptom**: App shows blank page or "cannot find module" errors after deployment.

**Cause**: Next.js imports `.ts` files but CLI generates `.js` files.

**Solution**: Copy generated `.js` files as both `.js` and `.ts` versions (see section 7).

### CLI Skips Push Silently

**Symptom**: CLI completes quickly without "Preparing Convex functions" message.

**Cause**: Stale generated files exist from a previous run.

**Solution**: Always remove `_generated` directories before each CLI run.

### Re-Deployment Not Picking Up Changes

**Symptom**: You edit `convex/*.ts` files and re-deploy, but the old code is still running.

**Cause**: Reusing the same Runtime instance causes stale closures - the CLI captures file contents during bundling, and these references don't update when files change.

**Solution**: Always create a fresh Runtime instance for each deployment (see section 8). Do NOT reuse or cache the Runtime between deployments.
