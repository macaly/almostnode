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
| `path` | 223 | High | POSIX only (no Windows path support) |
| `assert` | 45 | High | Core assertion APIs and error semantics |
| `buffer` | 95 | High | All common operations covered |
| `stream` | 53 | Medium | Readable, Writable, Duplex, Transform, PassThrough |
| `url` | 67 | High | WHATWG URL + legacy url.parse/format |
| `events` | 50 | High | Full EventEmitter API |
| `fs` | 76 | High | Sync methods, promises API, Dirent |
| `util` | 77 | High | format, inspect, promisify, type checks |
| `querystring` | 52 | High | parse, stringify, escape, unescape |
| `os` | 58 | High | All OS info APIs (simulated values) |
| `crypto` | 66 | High | Hash, HMAC, sign/verify, random |
| `zlib` | 39 | High | gzip, deflate, brotli compression |
| `process` | 60 | High | env, cwd, nextTick, hrtime, EventEmitter |
| `perf_hooks` | 33 | High | Performance API, PerformanceObserver, Histogram |
| `tty` | 40 | High | ReadStream, WriteStream, isatty |
| `readline` | 35 | Medium | Interface API, cursor helpers, promises API |
| `net` | 30 | Medium | Socket/Server lifecycle, IP helpers, connection flow |
| `dns` | 26 | Medium | Callback + promises APIs, lookup/resolve/reverse helpers |
| `tls` | 22 | Low | API shape, constants, helper methods |
| `module` | 16 | Medium | Builtin checks, createRequire behavior, module metadata |
| `async_hooks` | 19 | Medium | AsyncResource, AsyncLocalStorage, hook/id helpers |
| `v8` | 21 | Low | Heap/coverage/serialization API shape |
| `worker_threads` | 26 | Low | API surface compatibility, placeholder threading primitives |
| `vm` | 28 | Medium | Script API, context helpers, compileFunction, module classes |

**Total: 1257 tests (1232 passing, 25 skipped)**

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

### readline Module

1. **Real terminal I/O**: No real stdin TTY interaction in browser environment
2. **Line events from streams**: Streaming line parsing/events are not fully implemented

### net Module

1. **Real TCP sockets**: Uses virtual networking, not OS-level sockets
2. **IP validation strictness**: IPv4 segment validation is simplified

### dns Module

1. **Real DNS resolution**: Uses placeholders instead of OS/network resolver
2. **Error semantics**: Does not return full Node-style DNS error codes

### tls Module

1. **TLS handshake**: No real certificate verification or secure negotiation
2. **Connection metadata**: Protocol/cipher details are placeholder values

### module Module

1. **Real module loading**: `createRequire` does not resolve/execute files
2. **Extension handlers**: `_extensions` are placeholders only

### async_hooks Module

1. **Async context propagation**: Not fully tied to runtime async boundaries
2. **Lifecycle hooks**: `createHook` callbacks are placeholders

### v8 Module

1. **Heap snapshots**: No real V8 heap stream/snapshot output
2. **Structured clone semantics**: Serialization uses JSON, not V8 serializer behavior

### worker_threads Module

1. **No true worker threads**: Runs in single-threaded browser context
2. **Messaging semantics**: Message delivery/queuing APIs are placeholders

### vm Module

1. **Sandbox isolation**: Execution is not fully isolated from outer globals
2. **Timeouts**: `timeout` option is not implemented
3. **Context writeback**: Assignment to primitive bindings does not persist to context

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
├── path.test.ts          # path module tests (223 tests)
├── assert.test.ts        # assert module tests (45 tests)
├── buffer.test.ts        # buffer module tests (95 tests)
├── stream.test.ts        # stream module tests (53 tests)
├── url.test.ts           # url module tests (67 tests)
├── events.test.ts        # events module tests (50 tests)
├── fs.test.ts            # fs module tests (76 tests)
├── util.test.ts          # util module tests (77 tests)
├── querystring.test.ts   # querystring module tests (52 tests)
├── os.test.ts            # os module tests (58 tests)
├── crypto.test.ts        # crypto module tests (66 tests)
├── zlib.test.ts          # zlib module tests (39 tests)
├── process.test.ts       # process module tests (60 tests)
├── perf_hooks.test.ts    # perf_hooks module tests (33 tests)
├── tty.test.ts           # tty module tests (40 tests)
├── readline.test.ts      # readline module tests (35 tests)
├── net.test.ts           # net module tests (30 tests)
├── dns.test.ts           # dns module tests (26 tests)
├── tls.test.ts           # tls module tests (22 tests)
├── module.test.ts        # module module tests (16 tests)
├── async_hooks.test.ts   # async_hooks module tests (19 tests)
├── v8.test.ts            # v8 module tests (21 tests)
├── worker_threads.test.ts # worker_threads module tests (26 tests)
└── vm.test.ts            # vm module tests (28 tests)
```

## Contributing

When fixing a shim to pass more tests:

1. Run the relevant test file first to identify failures
2. Update the shim implementation
3. Remove any `.skip()` or known limitation documentation if the test now passes
4. Update this README if the limitation is resolved
