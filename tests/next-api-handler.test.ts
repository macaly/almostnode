import { describe, it, expect, vi } from 'vitest';
import { Buffer } from '../src/shims/stream';
import {
  parseCookies,
  createMockRequest,
  createMockResponse,
  createStreamingMockResponse,
  createBuiltinModules,
  executeApiHandler,
} from '../src/frameworks/next-api-handler';

// ─── parseCookies ────────────────────────────────────────────────────────────

describe('parseCookies', () => {
  it('parses single cookie', () => {
    expect(parseCookies('name=value')).toEqual({ name: 'value' });
  });

  it('parses multiple cookies', () => {
    expect(parseCookies('a=1; b=2; c=3')).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('returns empty object for empty string', () => {
    expect(parseCookies('')).toEqual({});
  });

  it('decodes URI-encoded values', () => {
    expect(parseCookies('name=hello%20world')).toEqual({ name: 'hello world' });
  });

  it('handles cookies with spaces around semicolons', () => {
    expect(parseCookies('a=1 ; b=2 ; c=3')).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('ignores malformed entries without value', () => {
    const result = parseCookies('valid=yes; invalid; also=ok');
    expect(result.valid).toBe('yes');
    expect(result.also).toBe('ok');
    expect(result.invalid).toBeUndefined();
  });
});

// ─── createMockRequest ───────────────────────────────────────────────────────

describe('createMockRequest', () => {
  it('creates request with method and url', () => {
    const req = createMockRequest('GET', '/api/hello', {});
    expect(req.method).toBe('GET');
    expect(req.url).toBe('/api/hello');
  });

  it('passes headers', () => {
    const headers = { 'content-type': 'application/json', 'x-custom': 'test' };
    const req = createMockRequest('POST', '/api/data', headers);
    expect(req.headers).toBe(headers);
  });

  it('parses query parameters', () => {
    const req = createMockRequest('GET', '/api/search?q=hello&limit=10', {});
    expect(req.query).toEqual({ q: 'hello', limit: '10' });
  });

  it('parses body as JSON', () => {
    const body = Buffer.from(JSON.stringify({ name: 'test' }));
    const req = createMockRequest('POST', '/api/data', {}, body);
    expect(req.body).toEqual({ name: 'test' });
  });

  it('has undefined body when no body provided', () => {
    const req = createMockRequest('GET', '/api/hello', {});
    expect(req.body).toBeUndefined();
  });

  it('parses cookies from headers', () => {
    const req = createMockRequest('GET', '/api/hello', { cookie: 'token=abc; lang=en' });
    expect(req.cookies).toEqual({ token: 'abc', lang: 'en' });
  });

  it('has empty cookies when no cookie header', () => {
    const req = createMockRequest('GET', '/api/hello', {});
    expect(req.cookies).toEqual({});
  });
});

// ─── createMockResponse ──────────────────────────────────────────────────────

describe('createMockResponse', () => {
  it('defaults to 200 status', () => {
    const res = createMockResponse();
    const response = res.toResponse();
    expect(response.statusCode).toBe(200);
    expect(response.statusMessage).toBe('OK');
  });

  it('sets status code', () => {
    const res = createMockResponse();
    res.status(404);
    expect(res.toResponse().statusCode).toBe(404);
  });

  it('chains status()', () => {
    const res = createMockResponse();
    expect(res.status(200)).toBe(res);
  });

  it('sets and gets headers', () => {
    const res = createMockResponse();
    res.setHeader('X-Custom', 'value');
    expect(res.getHeader('X-Custom')).toBe('value');
  });

  it('chains setHeader()', () => {
    const res = createMockResponse();
    expect(res.setHeader('X-Custom', 'value')).toBe(res);
  });

  it('sends JSON response', () => {
    const res = createMockResponse();
    res.json({ hello: 'world' });

    const response = res.toResponse();
    expect(response.headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(JSON.parse(response.body.toString())).toEqual({ hello: 'world' });
    expect(res.isEnded()).toBe(true);
  });

  it('sends string response', () => {
    const res = createMockResponse();
    res.send('hello world');

    const response = res.toResponse();
    expect(response.body.toString()).toBe('hello world');
    expect(res.isEnded()).toBe(true);
  });

  it('sends object via send() as JSON', () => {
    const res = createMockResponse();
    res.send({ data: 'test' });

    const response = res.toResponse();
    expect(response.headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(JSON.parse(response.body.toString())).toEqual({ data: 'test' });
  });

  it('ends response with data', () => {
    const res = createMockResponse();
    res.end('done');

    const response = res.toResponse();
    expect(response.body.toString()).toBe('done');
    expect(res.isEnded()).toBe(true);
  });

  it('ends response without data', () => {
    const res = createMockResponse();
    res.end();
    expect(res.isEnded()).toBe(true);
  });

  it('writes to body', () => {
    const res = createMockResponse();
    res.write('chunk1');
    res.write('chunk2');
    res.end();

    const response = res.toResponse();
    expect(response.body.toString()).toBe('chunk1chunk2');
  });

  it('redirects with status code', () => {
    const res = createMockResponse();
    res.redirect(302, '/new-location');

    const response = res.toResponse();
    expect(response.statusCode).toBe(302);
    expect(response.headers['Location']).toBe('/new-location');
    expect(res.isEnded()).toBe(true);
  });

  it('redirects with string url (defaults to 307)', () => {
    const res = createMockResponse();
    res.redirect('/other');

    const response = res.toResponse();
    expect(response.statusCode).toBe(307);
    expect(response.headers['Location']).toBe('/other');
  });

  it('sets Content-Length in toResponse()', () => {
    const res = createMockResponse();
    res.send('hello');

    const response = res.toResponse();
    expect(response.headers['Content-Length']).toBe('5');
  });

  it('waitForEnd resolves when ended', async () => {
    const res = createMockResponse();

    // End after a tick
    setTimeout(() => res.end(), 0);

    await res.waitForEnd();
    expect(res.isEnded()).toBe(true);
  });

  it('has writable property', () => {
    const res = createMockResponse();
    expect(res.writable).toBe(true);
  });
});

// ─── createStreamingMockResponse ─────────────────────────────────────────────

describe('createStreamingMockResponse', () => {
  it('calls onStart, onChunk, onEnd in order', () => {
    const calls: string[] = [];
    const onStart = vi.fn(() => calls.push('start'));
    const onChunk = vi.fn(() => calls.push('chunk'));
    const onEnd = vi.fn(() => calls.push('end'));

    const res = createStreamingMockResponse(onStart, onChunk, onEnd);
    res.send('hello');

    expect(calls).toEqual(['start', 'chunk', 'end']);
  });

  it('passes status code and headers to onStart', () => {
    const onStart = vi.fn();
    const onChunk = vi.fn();
    const onEnd = vi.fn();

    const res = createStreamingMockResponse(onStart, onChunk, onEnd);
    res.status(201);
    res.setHeader('X-Custom', 'test');
    res.send('data');

    expect(onStart).toHaveBeenCalledWith(201, 'OK', expect.objectContaining({ 'X-Custom': 'test' }));
  });

  it('streams multiple chunks via write()', () => {
    const onStart = vi.fn();
    const chunks: string[] = [];
    const onChunk = vi.fn((chunk: string | Uint8Array) => chunks.push(chunk as string));
    const onEnd = vi.fn();

    const res = createStreamingMockResponse(onStart, onChunk, onEnd);
    res.write('chunk1');
    res.write('chunk2');
    res.write('chunk3');
    res.end();

    expect(chunks).toEqual(['chunk1', 'chunk2', 'chunk3']);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('sends headers before first write', () => {
    const callOrder: string[] = [];
    const onStart = vi.fn(() => callOrder.push('headers'));
    const onChunk = vi.fn(() => callOrder.push('data'));
    const onEnd = vi.fn();

    const res = createStreamingMockResponse(onStart, onChunk, onEnd);
    res.write('data');

    expect(callOrder).toEqual(['headers', 'data']);
  });

  it('json() sets content type and ends', () => {
    const onStart = vi.fn();
    const onChunk = vi.fn();
    const onEnd = vi.fn();

    const res = createStreamingMockResponse(onStart, onChunk, onEnd);
    res.json({ key: 'value' });

    expect(onStart).toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledWith('{"key":"value"}');
    expect(onEnd).toHaveBeenCalled();
    expect(res.isEnded()).toBe(true);
  });

  it('end() with data sends chunk then ends', () => {
    const chunks: string[] = [];
    const onStart = vi.fn();
    const onChunk = vi.fn((chunk: string | Uint8Array) => chunks.push(chunk as string));
    const onEnd = vi.fn();

    const res = createStreamingMockResponse(onStart, onChunk, onEnd);
    res.end('final');

    expect(chunks).toEqual(['final']);
    expect(onEnd).toHaveBeenCalled();
  });

  it('redirect sets Location header and ends', () => {
    const onStart = vi.fn();
    const onChunk = vi.fn();
    const onEnd = vi.fn();

    const res = createStreamingMockResponse(onStart, onChunk, onEnd);
    res.redirect(302, '/new');

    expect(onStart).toHaveBeenCalledWith(302, 'OK', expect.objectContaining({ Location: '/new' }));
    expect(onEnd).toHaveBeenCalled();
  });

  it('does not call onEnd twice', () => {
    const onStart = vi.fn();
    const onChunk = vi.fn();
    const onEnd = vi.fn();

    const res = createStreamingMockResponse(onStart, onChunk, onEnd);
    res.end();
    res.end();

    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('waitForEnd resolves when ended', async () => {
    const onStart = vi.fn();
    const onChunk = vi.fn();
    const onEnd = vi.fn();

    const res = createStreamingMockResponse(onStart, onChunk, onEnd);
    setTimeout(() => res.end(), 0);

    await res.waitForEnd();
    expect(res.isEnded()).toBe(true);
  });
});

// ─── createBuiltinModules ────────────────────────────────────────────────────

describe('createBuiltinModules', () => {
  it('includes all standard shims', async () => {
    const modules = await createBuiltinModules();

    expect(modules.https).toBeDefined();
    expect(modules.http).toBeDefined();
    expect(modules.path).toBeDefined();
    expect(modules.url).toBeDefined();
    expect(modules.querystring).toBeDefined();
    expect(modules.util).toBeDefined();
    expect(modules.events).toBeDefined();
    expect(modules.stream).toBeDefined();
    expect(modules.buffer).toBeDefined();
    expect(modules.crypto).toBeDefined();
  });

  it('does not include fs by default', async () => {
    const modules = await createBuiltinModules();
    expect(modules.fs).toBeUndefined();
  });

  it('includes fs when createFsShim is provided', async () => {
    const fsShim = { readFileSync: () => 'mock' };
    const modules = await createBuiltinModules(() => fsShim);
    expect(modules.fs).toBe(fsShim);
  });

  it('handles async createFsShim', async () => {
    const fsShim = { readFileSync: () => 'mock' };
    const modules = await createBuiltinModules(async () => fsShim);
    expect(modules.fs).toBe(fsShim);
  });
});

// ─── executeApiHandler ───────────────────────────────────────────────────────

describe('executeApiHandler', () => {
  const emptyModules: Record<string, unknown> = {};

  it('executes default export handler', async () => {
    const code = `
      exports.default = function(req, res) {
        res.json({ message: 'hello' });
      };
    `;
    const req = createMockRequest('GET', '/api/hello', {});
    const res = createMockResponse();

    await executeApiHandler(code, req, res, {}, emptyModules);

    const response = res.toResponse();
    expect(JSON.parse(response.body.toString())).toEqual({ message: 'hello' });
  });

  it('executes module.exports handler', async () => {
    const code = `
      module.exports = function(req, res) {
        res.send('direct export');
      };
    `;
    const req = createMockRequest('GET', '/api/hello', {});
    const res = createMockResponse();

    await executeApiHandler(code, req, res, {}, emptyModules);

    expect(res.toResponse().body.toString()).toBe('direct export');
  });

  it('provides process.env to handler', async () => {
    const code = `
      exports.default = function(req, res) {
        res.json({ value: process.env.MY_VAR });
      };
    `;
    const req = createMockRequest('GET', '/api/env', {});
    const res = createMockResponse();

    await executeApiHandler(code, req, res, { MY_VAR: 'test-value' }, emptyModules);

    expect(JSON.parse(res.toResponse().body.toString())).toEqual({ value: 'test-value' });
  });

  it('provides require function for builtins', async () => {
    const code = `
      const path = require('path');
      exports.default = function(req, res) {
        res.json({ hasJoin: typeof path.join === 'function' });
      };
    `;
    const req = createMockRequest('GET', '/api/test', {});
    const res = createMockResponse();

    const builtins = await createBuiltinModules();
    await executeApiHandler(code, req, res, {}, builtins);

    expect(JSON.parse(res.toResponse().body.toString())).toEqual({ hasJoin: true });
  });

  it('handles node: prefix in require', async () => {
    const code = `
      const path = require('node:path');
      exports.default = function(req, res) {
        res.json({ hasJoin: typeof path.join === 'function' });
      };
    `;
    const req = createMockRequest('GET', '/api/test', {});
    const res = createMockResponse();

    const builtins = await createBuiltinModules();
    await executeApiHandler(code, req, res, {}, builtins);

    expect(JSON.parse(res.toResponse().body.toString())).toEqual({ hasJoin: true });
  });

  it('throws for unknown modules', async () => {
    const code = `
      const unknown = require('nonexistent');
      exports.default = function(req, res) { res.end(); };
    `;
    const req = createMockRequest('GET', '/api/test', {});
    const res = createMockResponse();

    await expect(
      executeApiHandler(code, req, res, {}, emptyModules)
    ).rejects.toThrow('Module not found: nonexistent');
  });

  it('throws when no default export found', async () => {
    const code = `
      // No exports
      const x = 1;
    `;
    const req = createMockRequest('GET', '/api/test', {});
    const res = createMockResponse();

    await expect(
      executeApiHandler(code, req, res, {}, emptyModules)
    ).rejects.toThrow('No default export handler found');
  });

  it('handles async handlers', async () => {
    const code = `
      exports.default = async function(req, res) {
        await new Promise(resolve => setTimeout(resolve, 10));
        res.json({ async: true });
      };
    `;
    const req = createMockRequest('GET', '/api/async', {});
    const res = createMockResponse();

    await executeApiHandler(code, req, res, {}, emptyModules);

    expect(JSON.parse(res.toResponse().body.toString())).toEqual({ async: true });
  });

  it('passes request body to handler', async () => {
    const code = `
      exports.default = function(req, res) {
        res.json({ received: req.body });
      };
    `;
    const body = Buffer.from(JSON.stringify({ input: 'data' }));
    const req = createMockRequest('POST', '/api/data', { 'content-type': 'application/json' }, body);
    const res = createMockResponse();

    await executeApiHandler(code, req, res, {}, emptyModules);

    expect(JSON.parse(res.toResponse().body.toString())).toEqual({ received: { input: 'data' } });
  });

  it('provides process.cwd() returning /', async () => {
    const code = `
      exports.default = function(req, res) {
        res.json({ cwd: process.cwd() });
      };
    `;
    const req = createMockRequest('GET', '/api/test', {});
    const res = createMockResponse();

    await executeApiHandler(code, req, res, {}, emptyModules);

    expect(JSON.parse(res.toResponse().body.toString())).toEqual({ cwd: '/' });
  });
});
