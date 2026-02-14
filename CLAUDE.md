# almostnode

## What This Is

almostnode is a **real competitor to WebContainers (StackBlitz)**. It runs Node.js natively in the browser — virtual filesystem, npm package installation, dev servers, the works.

## Core Principle

**Never write library-specific shim code. Fix the platform instead.**

When a package doesn't work, the fix goes into the generic shims (fs, path, crypto, etc.), not into a package-specific adapter. Every demo should use real npm packages installed via `PackageManager`, served via `/_npm/` bundling, and running through the standard runtime. No CDN shortcuts, no manual protocol reimplementations, no fake adapters.

## Architecture

- **Runtime** (`src/runtime.ts`) — JS execution engine with `require()`, ESM-to-CJS transforms, 43 built-in module shims
- **VirtualFS** (`src/virtual-fs.ts`) — In-memory filesystem, exposed as `require('fs')`
- **PackageManager** (`src/npm/`) — Real npm packages downloaded, extracted, ESM-to-CJS transformed via esbuild-wasm
- **Service Worker** — Network interception for HTTP servers (`/__virtual__/{port}/`)
- **Dev Servers** — `NextDevServer` (Pages + App Router), `ViteDevServer` (React + HMR)
- **just-bash** — Bash emulator with custom commands (`node`, `npm`, `convex`)
- **Code Transforms** (`src/frameworks/code-transforms.ts`) — CSS Modules (css-tree AST), ESM-to-CJS (acorn AST), React Refresh, npm import redirect

### Next.js Dev Server (split across files)

- `src/frameworks/next-dev-server.ts` — Orchestrator (~1360 lines)
- `src/frameworks/next-route-resolver.ts` — Route resolution (~600 lines)
- `src/frameworks/next-api-handler.ts` — API route handlers (~350 lines)
- `src/frameworks/next-shims.ts` — Shim string constants (~1040 lines)
- `src/frameworks/next-html-generator.ts` — HTML page generation (~560 lines)
- `src/frameworks/next-config-parser.ts` — next.config.js parsing (AST + regex fallback)

## Commands

```bash
npm run dev          # Vite dev server (port 5173)
npm run test:run     # Unit tests (vitest, ~2250 tests, ~10s)
npm run test:e2e     # E2E tests (playwright, ~105 tests)
npm run build        # Build for production
```

## Testing

- Unit tests: `tests/` directory, run with `npm run test:run`
- E2E tests: `e2e/` directory, run with `npx playwright test e2e/`
- Run a single E2E file: `npx playwright test e2e/vite-demo.spec.ts`
- Test harnesses live in `examples/` (HTML files with VFS setup)

## Key Technical Details

- **`/_npm/` endpoint**: Bundles npm packages from VFS as ESM for browser consumption via esbuild
- **`/_next/route-info`**: Server endpoint returning resolved route info (page, layouts, params) — used by client-side navigation
- **Virtual prefix**: `/__virtual__/{port}/` — all imports go through this for service worker interception
- **`isBrowser` flag**: In test env (jsdom), `isBrowser=false` — transforms run differently
- **ESM-to-CJS**: Happens both at install time (esbuild-wasm) and at runtime (in `loadModule()`)
- **Route groups**: `(groupName)` directories are transparent in URLs, resolved server-side

## Where to Find More Context

- **`README.md`** — Public API docs, usage examples, comparison with WebContainers, sandbox setup
- **`CHANGELOG.md`** — Version history and what changed
- **`examples/`** — Working demo HTML files (next-demo, vite-demo, express-demo, etc.) — read these to understand how the platform is used end-to-end
- **`e2e/`** — Playwright E2E tests that exercise each demo — read these to understand what each demo should do

When working on a specific demo or feature, read the corresponding example HTML and E2E test first.

## Release Process

Always bump version in `package.json` and update `CHANGELOG.md` before pushing. Follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format, Semantic Versioning.
