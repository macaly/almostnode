# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.3] - 2025-01-31

### Fixed

- **Next.js Link navigation:** Fixed clicking `<Link>` components causing full iframe reload instead of smooth client-side navigation. Now uses dynamic page imports for proper SPA-like navigation.

## [0.2.2] - 2025-01-31

### Fixed

- **Critical:** Fixed browser bundle importing Node.js `url` module, which broke the library completely in browsers. The `sandbox-helpers.ts` now uses dynamic requires that only run in Node.js.

## [0.2.1] - 2025-01-31

### Fixed

- CI now builds library before running tests (fixes failing tests for service worker helpers)

### Changed

- Added security warning to Quick Start section in README
- Clarified that `createContainer()` should not be used with untrusted code
- Added "Running Untrusted Code Securely" example using `createRuntime()` with sandbox
- Updated repository URLs to point to Macaly/almostnode

## [0.2.0] - 2025-01-31

### Added

- **Vite plugin** (`almostnode/vite`) - Automatically serves the service worker file during development
  ```typescript
  import { almostnodePlugin } from 'almostnode/vite';
  export default defineConfig({ plugins: [almostnodePlugin()] });
  ```

- **Next.js helpers** (`almostnode/next`) - Utilities for serving the service worker in Next.js apps
  - `getServiceWorkerContent()` - Returns service worker file content
  - `getServiceWorkerPath()` - Returns path to service worker file

- **Configurable service worker URL** - `initServiceWorker()` now accepts options
  ```typescript
  await bridge.initServiceWorker({ swUrl: '/custom/__sw__.js' });
  ```

- **Service worker included in sandbox files** - `generateSandboxFiles()` now generates `__sw__.js` along with `index.html` and `vercel.json`, making cross-origin sandbox deployment self-contained

### Changed

- Updated README with comprehensive Service Worker Setup documentation covering all deployment options

## [0.1.0] - 2025-01-30

### Added

- Initial release
- Virtual file system with Node.js-compatible API
- 40+ shimmed Node.js modules
- npm package installation support
- Vite and Next.js dev servers
- Hot Module Replacement with React Refresh
- Cross-origin sandbox support for secure code execution
- Web Worker runtime option
