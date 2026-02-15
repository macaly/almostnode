# Contributing to almostnode

Thanks for your interest in contributing to almostnode! This guide will help you get started.

## Code of Conduct

Be respectful, constructive, and collaborative. We're building a tool that brings Node.js to the browser - let's make it great together.

## Ways to Contribute

- **Report bugs** - Found something broken? Let us know
- **Suggest features** - Have ideas for improvements? We'd love to hear them
- **Fix issues** - Check our [issue tracker](https://github.com/macaly/almostnode/issues)
- **Improve docs** - Documentation improvements are always welcome
- **Add tests** - Help us improve test coverage
- **Add Node.js API shims** - Help us support more Node.js modules

## Getting Started

### Prerequisites

- **Node.js 20+** - Required for development
- **npm** - Package manager
- **Modern browser** - Chrome, Firefox, Safari, or Edge

### Development Setup

1. **Fork and clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/almostnode.git
cd almostnode
```

2. **Install dependencies**

```bash
npm install
```

3. **Start development server**

```bash
npm run dev
```

4. **Open examples**

Navigate to `http://localhost:5173/examples/` to see demos

### Project Structure

```
almostnode/
├── src/
│   ├── runtime.ts              # Core runtime
│   ├── virtual-fs.ts           # Virtual filesystem
│   ├── create-runtime.ts       # Runtime factory
│   ├── index.ts                # Main exports
│   ├── shims/                  # Node.js API shims (fs, path, http, etc.)
│   ├── frameworks/             # Framework integrations (flat structure)
│   │   ├── vite-dev-server.ts
│   │   ├── next-dev-server.ts
│   │   └── ...
│   ├── npm/                    # npm package manager
│   ├── worker/                 # Web Worker support
│   ├── types/                  # TypeScript types
│   └── utils/                  # Utility functions
├── tests/                      # Unit tests
├── e2e/                        # End-to-end tests
└── examples/                   # Demo applications
```

## Development Workflow

### 1. Create a feature branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 2. Make your changes

- Write clear, focused commits
- Follow existing code style
- Add tests for new features
- Update documentation if needed

### 3. Run tests

```bash
# Unit tests
npm test

# Run tests once (no watch mode)
npm run test:run

# E2E tests (requires Playwright)
npm run test:e2e

# Type checking
npm run type-check
```

### 4. Build the project

```bash
# Build library for distribution
npm run build

# Or build with types
npm run build:publish
```

### 5. Test with examples

```bash
npm run dev
# Open http://localhost:5173/examples/
```

### 6. Commit your changes

```bash
git add .
git commit -m "Add support for X"
# or
git commit -m "Fix issue with Y"
```

Write clear, descriptive commit messages that explain what changed and why.

### 7. Push and create a Pull Request

```bash
git push origin feature/your-feature-name
```

Then open a PR on GitHub with:
- Clear description of what changed and why
- Reference any related issues (`Fixes #123`)
- Screenshots/videos for UI changes

## Common Tasks

### Core Principle: Fix the Platform, Not the Package

**The most important rule when contributing:** When a package doesn't work, the fix goes into the generic shims (fs, path, http, etc.), not into package-specific adapters.

Never write library-specific shim code. If a package fails because it needs `fs.readFileSync`, add or improve `fs.readFileSync` in `src/shims/fs.ts`. Don't create a special adapter for that package.

This keeps almostnode maintainable and ensures fixes benefit all packages, not just one.

### Adding a New Node.js API Shim

1. **Create or update the shim file** in `src/shims/`

```typescript
// src/shims/my-module.ts
export function myFunction() {
  // Implementation that works in the browser
}
```

2. **Register in runtime** (`src/runtime.ts`)

```typescript
this.builtinModules.set('my-module', () => require('./shims/my-module'));
```

3. **Add tests** in `tests/`

```typescript
// tests/my-module.test.ts
import { describe, it, expect } from 'vitest';
import { createRuntime } from '../src';
import { VirtualFS } from '../src/virtual-fs';

describe('my-module', () => {
  it('should work', async () => {
    const vfs = new VirtualFS();
    const runtime = await createRuntime(vfs);
    const result = await runtime.execute(`
      const mod = require('my-module');
      module.exports = mod.myFunction();
    `);
    expect(result.exports).toBe(expected);
  });
});
```

4. **Export from index.ts** if it's a public API

```typescript
export * as myModule from './shims/my-module';
```

### Fixing a Bug

1. **Reproduce the issue** - Verify you can reproduce it
2. **Write a failing test** - Add a test that fails with the bug
3. **Fix the bug** - Make the test pass
4. **Verify** - Run all tests to ensure no regressions

## Testing Guidelines

### Unit Tests

- Use Vitest for unit tests
- Test individual functions and modules
- Mock external dependencies
- Aim for high coverage

```bash
npm test
```

### E2E Tests

- Use Playwright for end-to-end tests
- Test real browser scenarios
- Test framework integrations (Vite, Next.js)

```bash
npm run test:e2e
```

## Pull Request Guidelines

### Before Submitting

- [ ] Code builds without errors (`npm run build`)
- [ ] All tests pass (`npm run test:run`)
- [ ] Type checking passes (`npm run type-check`)
- [ ] Documentation is updated if needed
- [ ] PR description explains what and why

### PR Title Format

Write clear, descriptive titles:
```
Add support for worker_threads module
Fix path resolution issue in virtual filesystem
Improve sandbox setup documentation
```

### Review Process

1. Maintainers will review your PR
2. Address any feedback or requested changes
3. Once approved, a maintainer will merge

## Security Considerations

### Running Untrusted Code

**Always use cross-origin sandbox** for untrusted code:

```typescript
const runtime = await createRuntime(vfs, {
  sandbox: 'https://your-sandbox.vercel.app',
});
```

**Never use** `dangerouslyAllowSameOrigin` with untrusted code.

### Reporting Security Issues

If you discover a security vulnerability, please email security@macaly.com instead of opening a public issue.

## Getting Help

- **GitHub Issues** - [Report bugs or request features](https://github.com/macaly/almostnode/issues)
- **Discussions** - [Ask questions or share ideas](https://github.com/macaly/almostnode/discussions)
- **Email** - support@macaly.com

## License

By contributing to almostnode, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to almostnode! 🚀
