# Node.js API Compatibility Tests

This directory contains tests that verify our Node.js module shims behave consistently with Node.js.

## Test Source

Tests are adapted from the official Node.js test suite:
- **Source**: https://github.com/nodejs/node/tree/main/test/parallel
- **Naming Convention**: `test-[module]-[feature].js` in Node.js → `[module].test.ts` here

## Running Tests

```bash
# Run all node-compat tests
npm run test:run -- tests/node-compat/

# Run specific module tests
npm run test:run -- tests/node-compat/path.test.ts

# Run with verbose output
npm run test:run -- --reporter=verbose tests/node-compat/
```

## Test Coverage

| Module | Tests | Coverage | Notes |
|--------|-------|----------|-------|
| `path` | 219 | High | POSIX only (no Windows path support) |
| `buffer` | 95 | High | All common operations covered |
| `stream` | 44 | Medium | Readable, Writable, Duplex, Transform, PassThrough |
| `url` | 67 | High | WHATWG URL + legacy url.parse/format |
| `events` | 50 | High | Full EventEmitter API |
| `fs` | 76 | High | Sync methods, promises API, Dirent |
| `util` | 77 | High | format, inspect, promisify, type checks |
| `querystring` | 52 | High | parse, stringify, escape, unescape |
| `os` | 58 | High | All OS info APIs (simulated values) |
| `crypto` | 57 | High | Hash, HMAC, sign/verify, random |
| `zlib` | 39 | High | gzip, deflate, brotli compression |
| `process` | 60 | High | env, cwd, nextTick, hrtime, EventEmitter |
| `perf_hooks` | 33 | High | Performance API, PerformanceObserver, Histogram |
| `tty` | 40 | High | ReadStream, WriteStream, isatty |

**Total: 967 tests (961 passing, 6 skipped)**

## Known Limitations

Our shims are designed to work with common frameworks (Next.js, Express, Convex) rather than achieve 100% Node.js API compliance. These are documented limitations:

### path Module

The following edge cases differ from Node.js behavior:

1. **Trailing slashes**: `normalize('./')` returns `'.'` instead of `'./'`
2. **Double dot handling**: `extname('..')` returns `'.'` instead of `''`
3. **Join with empty trailing**: `join('foo/', '')` returns `'foo'` instead of `'foo/'`
4. **Spaces before slashes**: `join(' ', '/')` returns `' '` instead of `' /'`

These differences don't affect typical framework usage patterns.

### url Module

1. **Relative URL parsing**: Our `url.parse()` uses browser's URL API with a fallback, which may parse relative URLs differently than Node.js's legacy url parser.

### stream Module

1. **Backpressure**: Simplified backpressure handling
2. **Object mode**: Not fully implemented
3. **HighWaterMark**: Simplified buffer management

### buffer Module

1. **Memory pooling**: Not implemented (uses standard Uint8Array allocation)
2. **transcode()**: Simplified implementation (no actual transcoding)

### fs Module

1. **Callback API**: Some timing issues with VirtualFS callbacks (use fs.promises instead)
2. **Symbolic links**: Not fully supported
3. **Permissions**: Simplified (no real Unix permissions)

### util Module

1. **format()**: When first argument isn't a string, it's not included in output
2. **debuglog()**: Requires NODE_DEBUG environment variable

## Adding New Tests

1. Find the relevant Node.js test at https://github.com/nodejs/node/tree/main/test/parallel
2. Adapt the test to Vitest format (see existing tests for patterns)
3. Use the `assert` helpers from `common.ts` for Node.js assertion compatibility
4. Document any known limitations

### Test Adaptation Pattern

```typescript
// Node.js test:
const assert = require('assert');
assert.strictEqual(path.join('foo', 'bar'), 'foo/bar');

// Adapted to Vitest:
import { assert } from './common';
assert.strictEqual(path.join('foo', 'bar'), 'foo/bar');
```

## File Structure

```
tests/node-compat/
├── README.md             # This file
├── common.ts             # Shared test utilities and assert compatibility
├── path.test.ts          # path module tests (219 tests)
├── buffer.test.ts        # buffer module tests (95 tests)
├── stream.test.ts        # stream module tests (44 tests)
├── url.test.ts           # url module tests (67 tests)
├── events.test.ts        # events module tests (50 tests)
├── fs.test.ts            # fs module tests (76 tests)
├── util.test.ts          # util module tests (77 tests)
├── querystring.test.ts   # querystring module tests (52 tests)
├── os.test.ts            # os module tests (58 tests)
├── crypto.test.ts        # crypto module tests (57 tests)
├── zlib.test.ts          # zlib module tests (39 tests)
├── process.test.ts       # process module tests (60 tests)
├── perf_hooks.test.ts    # perf_hooks module tests (33 tests)
└── tty.test.ts           # tty module tests (40 tests)
```

## Contributing

When fixing a shim to pass more tests:

1. Run the relevant test file first to identify failures
2. Update the shim implementation
3. Remove any `.skip()` or known limitation documentation if the test now passes
4. Update this README if the limitation is resolved
