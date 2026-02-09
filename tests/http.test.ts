import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  Server,
  IncomingMessage,
  ServerResponse,
  createServer,
  getServer,
  getAllServers,
  setServerListenCallback,
  setServerCloseCallback,
  _registerServer,
  _unregisterServer,
  _parseWsFrame,
  _createWsFrame,
} from '../src/shims/http';
import { EventEmitter } from '../src/shims/events';
import { ServerBridge, resetServerBridge } from '../src/server-bridge';
import { Buffer } from '../src/shims/stream';

describe('http module', () => {
  describe('IncomingMessage', () => {
    it('should create from raw request data', () => {
      const req = IncomingMessage.fromRequest(
        'GET',
        '/api/users?page=1',
        { 'content-type': 'application/json', host: 'localhost' },
        undefined
      );

      expect(req.method).toBe('GET');
      expect(req.url).toBe('/api/users?page=1');
      expect(req.headers['content-type']).toBe('application/json');
      expect(req.headers['host']).toBe('localhost');
      expect(req.complete).toBe(true);
    });

    it('should handle body data', async () => {
      const req = IncomingMessage.fromRequest(
        'POST',
        '/api/users',
        { 'content-type': 'application/json' },
        '{"name":"test"}'
      );

      const body = await new Promise<string>((resolve) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: unknown) => chunks.push(chunk as Buffer));
        req.on('end', () => {
          resolve(Buffer.concat(chunks).toString());
        });
        req.resume();
      });

      expect(body).toBe('{"name":"test"}');
    });
  });

  describe('ServerResponse', () => {
    it('should set status code', () => {
      const req = new IncomingMessage();
      const res = new ServerResponse(req);

      res.statusCode = 404;
      expect(res.statusCode).toBe(404);
    });

    it('should set headers', () => {
      const req = new IncomingMessage();
      const res = new ServerResponse(req);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Custom', 'value');

      expect(res.getHeader('content-type')).toBe('application/json');
      expect(res.getHeader('x-custom')).toBe('value');
      expect(res.hasHeader('Content-Type')).toBe(true);
    });

    it('should write head', () => {
      const req = new IncomingMessage();
      const res = new ServerResponse(req);

      res.writeHead(201, 'Created', { 'X-Id': '123' });

      expect(res.statusCode).toBe(201);
      expect(res.statusMessage).toBe('Created');
      expect(res.getHeader('x-id')).toBe('123');
    });

    it('should write body', () => {
      const req = new IncomingMessage();
      const res = new ServerResponse(req);

      res.write('Hello ');
      res.write('World');
      res.end();

      expect(res._getBodyAsString()).toBe('Hello World');
      expect(res.headersSent).toBe(true);
      expect(res.finished).toBe(true);
    });

    it('should end with data', () => {
      const req = new IncomingMessage();
      const res = new ServerResponse(req);

      res.end('Complete response');

      expect(res._getBodyAsString()).toBe('Complete response');
      expect(res.finished).toBe(true);
    });

    it('should call resolver when ended', async () => {
      const req = new IncomingMessage();
      const res = new ServerResponse(req);

      const responsePromise = new Promise<{
        statusCode: number;
        headers: Record<string, string>;
        body: Buffer;
      }>((resolve) => {
        res._setResolver(resolve);
      });

      res.setHeader('Content-Type', 'text/plain');
      res.statusCode = 200;
      res.end('Hello');

      const response = await responsePromise;

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/plain');
      expect(response.body.toString()).toBe('Hello');
    });
  });

  describe('Server', () => {
    let server: Server;

    afterEach(() => {
      if (server?.listening) {
        server.close();
      }
    });

    it('should create server with request listener', () => {
      server = createServer((req, res) => {
        res.end('Hello');
      });

      expect(server).toBeInstanceOf(Server);
      expect(server).toBeInstanceOf(EventEmitter);
    });

    it('should listen on a port', async () => {
      server = createServer();

      await new Promise<void>((resolve) => {
        server.listen(3000, () => {
          resolve();
        });
      });

      expect(server.listening).toBe(true);
      const addr = server.address();
      expect(addr?.port).toBe(3000);
    });

    it('should emit listening event', async () => {
      server = createServer();

      const listeningPromise = new Promise<void>((resolve) => {
        server.on('listening', () => {
          resolve();
        });
      });

      server.listen(3001);

      await listeningPromise;
      expect(server.listening).toBe(true);
    });

    it('should close server', async () => {
      server = createServer();

      await new Promise<void>((resolve) => server.listen(3002, resolve));

      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });

      expect(server.listening).toBe(false);
    });

    it('should handle requests', async () => {
      server = createServer((req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.end(`Hello from ${req.url}`);
      });

      await new Promise<void>((resolve) => server.listen(3003, resolve));

      const response = await server.handleRequest(
        'GET',
        '/test',
        { host: 'localhost' }
      );

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/plain');
      expect(response.body.toString()).toBe('Hello from /test');
    });

    it('should handle POST with body', async () => {
      server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: unknown) => chunks.push(chunk as Buffer));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ received: body }));
        });
        req.resume();
      });

      await new Promise<void>((resolve) => server.listen(3004, resolve));

      const response = await server.handleRequest(
        'POST',
        '/api/data',
        { 'content-type': 'application/json' },
        '{"test":true}'
      );

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body.toString());
      expect(body.received).toBe('{"test":true}');
    });

    it('should emit request event', async () => {
      let requestReceived = false;

      server = createServer();
      server.on('request', (req: unknown, res: unknown) => {
        requestReceived = true;
        (res as any).end('OK');
      });

      await new Promise<void>((resolve) => server.listen(3005, resolve));
      await server.handleRequest('GET', '/', {});

      expect(requestReceived).toBe(true);
    });
  });

  describe('Server Registry', () => {
    let server: Server;

    beforeEach(() => {
      // Clear any previous callbacks
      setServerListenCallback(null);
      setServerCloseCallback(null);
    });

    afterEach(() => {
      if (server?.listening) {
        server.close();
      }
    });

    it('should register server manually', () => {
      server = createServer((req, res) => res.end('OK'));
      _registerServer(4000, server);

      const registered = getServer(4000);
      expect(registered).toBe(server);

      _unregisterServer(4000);
    });

    it('should unregister server manually', () => {
      server = createServer((req, res) => res.end('OK'));
      _registerServer(4001, server);
      expect(getServer(4001)).toBe(server);

      _unregisterServer(4001);
      expect(getServer(4001)).toBeUndefined();
    });

    it('should call listen callback', () => {
      const ports: number[] = [];
      setServerListenCallback((port) => {
        ports.push(port);
      });

      server = createServer();
      _registerServer(4002, server);

      expect(ports).toContain(4002);
      _unregisterServer(4002);
    });

    it('should call close callback', () => {
      const closedPorts: number[] = [];
      setServerCloseCallback((port) => {
        closedPorts.push(port);
      });

      server = createServer();
      _registerServer(4003, server);
      _unregisterServer(4003);

      expect(closedPorts).toContain(4003);
    });

    it('should list all servers', () => {
      const server1 = createServer();
      const server2 = createServer();

      _registerServer(4010, server1);
      _registerServer(4011, server2);

      const all = getAllServers();
      expect(all.size).toBeGreaterThanOrEqual(2);
      expect(all.get(4010)).toBe(server1);
      expect(all.get(4011)).toBe(server2);

      _unregisterServer(4010);
      _unregisterServer(4011);
    });
  });

  describe('ServerBridge', () => {
    let bridge: ServerBridge;
    let server: Server;

    beforeEach(() => {
      resetServerBridge();
      // Clear callbacks before creating new bridge
      setServerListenCallback(null);
      setServerCloseCallback(null);
      bridge = new ServerBridge({ baseUrl: 'http://localhost:5173' });
    });

    afterEach(() => {
      if (server?.listening) {
        server.close();
      }
      resetServerBridge();
    });

    it('should register server manually', () => {
      server = createServer((req, res) => res.end('OK'));

      bridge.registerServer(server, 5000);

      expect(bridge.getServerPorts()).toContain(5000);
    });

    it('should generate server URL', () => {
      const url = bridge.getServerUrl(5001);
      expect(url).toBe('http://localhost:5173/__virtual__/5001');
    });

    it('should handle requests', async () => {
      server = createServer((req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.end(`Path: ${req.url}`);
      });

      bridge.registerServer(server, 5002);

      const response = await bridge.handleRequest(
        5002,
        'GET',
        '/api/test',
        { host: 'localhost' }
      );

      expect(response.statusCode).toBe(200);
      expect(response.body.toString()).toBe('Path: /api/test');
    });

    it('should return 503 for non-existent server', async () => {
      const response = await bridge.handleRequest(
        9999,
        'GET',
        '/',
        {}
      );

      expect(response.statusCode).toBe(503);
      expect(response.body.toString()).toContain('No server listening');
    });

    it('should emit server-ready event', async () => {
      server = createServer();

      const readyPromise = new Promise<{ port: number; url: string }>((resolve) => {
        bridge.on('server-ready', (port, url) => {
          resolve({ port: port as number, url: url as string });
        });
      });

      bridge.registerServer(server, 5003);

      const { port, url } = await readyPromise;
      expect(port).toBe(5003);
      expect(url).toBe('http://localhost:5173/__virtual__/5003');
    });

    it('should create fetch handler', async () => {
      server = createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ path: req.url }));
      });

      bridge.registerServer(server, 5004);

      const fetchHandler = bridge.createFetchHandler();
      const request = new Request('http://localhost:5173/__virtual__/5004/api/data?foo=bar');
      const response = await fetchHandler(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.path).toBe('/api/data?foo=bar');
    });

    it('should handle POST requests in fetch handler', async () => {
      server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: unknown) => chunks.push(chunk as Buffer));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ received: JSON.parse(body) }));
        });
        req.resume();
      });

      bridge.registerServer(server, 5005);

      const fetchHandler = bridge.createFetchHandler();
      const request = new Request('http://localhost:5173/__virtual__/5005/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });

      const response = await fetchHandler(request);
      const body = await response.json();

      expect(body.received).toEqual({ test: true });
    });
  });
});

import { ClientRequest, request, get } from '../src/shims/http';
import * as https from '../src/shims/https';

describe('HTTP Client', () => {

  describe('ClientRequest', () => {
    it('should create client request with options', () => {
      const req = new ClientRequest({
        method: 'POST',
        hostname: 'api.example.com',
        path: '/users',
        headers: { 'Content-Type': 'application/json' }
      });

      expect(req.method).toBe('POST');
      expect(req.path).toBe('/users');
      expect(req.getHeader('content-type')).toBe('application/json');
    });

    it('should set and get headers', () => {
      const req = new ClientRequest({ method: 'GET', path: '/' });

      req.setHeader('X-Custom', 'value');
      expect(req.getHeader('x-custom')).toBe('value');

      req.removeHeader('x-custom');
      expect(req.getHeader('x-custom')).toBeUndefined();
    });

    it('should buffer body chunks', () => {
      const req = new ClientRequest({ method: 'POST', path: '/' });

      req.write('Hello ');
      req.write('World');

      // Access private field for testing
      expect((req as any)._bodyChunks.length).toBe(2);
    });

    it('should support abort', () => {
      const req = new ClientRequest({ method: 'GET', path: '/' });
      let aborted = false;

      req.on('abort', () => { aborted = true; });
      req.abort();

      expect(aborted).toBe(true);
      expect((req as any)._aborted).toBe(true);
    });

    it('should support setTimeout', () => {
      const req = new ClientRequest({ method: 'GET', path: '/' });
      let timeoutCalled = false;

      req.setTimeout(1000, () => { timeoutCalled = true; });

      expect((req as any)._timeout).toBe(1000);
    });
  });

  describe('host option', () => {
    it('should use host when hostname is not set', () => {
      const req = new ClientRequest({
        method: 'GET',
        host: 'api.convex.cloud',
        path: '/api/1.31.7/sync',
      });

      // Verify the options are stored correctly
      expect((req as any)._options.host).toBe('api.convex.cloud');
      expect((req as any)._options.hostname).toBeUndefined();
    });

    it('should prefer hostname over host', () => {
      const req = new ClientRequest({
        method: 'GET',
        hostname: 'preferred.example.com',
        host: 'fallback.example.com',
        path: '/',
      });

      expect((req as any)._options.hostname).toBe('preferred.example.com');
    });

    it('should extract port from host string', () => {
      const req = new ClientRequest({
        method: 'GET',
        host: 'example.com:8080',
        path: '/api',
      });

      expect((req as any)._options.host).toBe('example.com:8080');
    });

    it('should build correct URL from host option', async () => {
      // Intercept fetch to capture the URL
      const originalFetch = globalThis.fetch;
      let capturedUrl = '';
      globalThis.fetch = async (url: any, _opts: any) => {
        capturedUrl = url.toString();
        return new Response('ok', { status: 200 });
      };

      try {
        const req = new ClientRequest({
          method: 'GET',
          host: 'deploy.convex.cloud',
          path: '/api/sync',
        }, 'https');

        await new Promise<void>((resolve) => {
          req.on('response', () => resolve());
          req.on('error', () => resolve());
          req.end();
        });

        expect(capturedUrl).toBe('https://deploy.convex.cloud/api/sync');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should build correct URL from host with port', async () => {
      const originalFetch = globalThis.fetch;
      let capturedUrl = '';
      globalThis.fetch = async (url: any, _opts: any) => {
        capturedUrl = url.toString();
        return new Response('ok', { status: 200 });
      };

      try {
        const req = new ClientRequest({
          method: 'GET',
          host: 'example.com:8443',
          path: '/data',
        }, 'https');

        await new Promise<void>((resolve) => {
          req.on('response', () => resolve());
          req.on('error', () => resolve());
          req.end();
        });

        expect(capturedUrl).toBe('https://example.com:8443/data');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should prefer hostname over host when building URL', async () => {
      const originalFetch = globalThis.fetch;
      let capturedUrl = '';
      globalThis.fetch = async (url: any, _opts: any) => {
        capturedUrl = url.toString();
        return new Response('ok', { status: 200 });
      };

      try {
        const req = new ClientRequest({
          method: 'GET',
          hostname: 'preferred.example.com',
          host: 'fallback.example.com:9999',
          path: '/',
        }, 'http');

        await new Promise<void>((resolve) => {
          req.on('response', () => resolve());
          req.on('error', () => resolve());
          req.end();
        });

        expect(capturedUrl).toBe('http://preferred.example.com/');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should fall back to localhost when neither host nor hostname set', async () => {
      const originalFetch = globalThis.fetch;
      let capturedUrl = '';
      globalThis.fetch = async (url: any, _opts: any) => {
        capturedUrl = url.toString();
        return new Response('ok', { status: 200 });
      };

      try {
        const req = new ClientRequest({
          method: 'GET',
          path: '/test',
        }, 'http');

        await new Promise<void>((resolve) => {
          req.on('response', () => resolve());
          req.on('error', () => resolve());
          req.end();
        });

        expect(capturedUrl).toBe('http://localhost/test');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('WebSocket upgrade handling', () => {
    it('should emit TypeError for WebSocket upgrade requests', async () => {
      // Browser fetch() cannot perform WebSocket upgrades (strips Connection/Upgrade
      // headers). We emit a TypeError matching what fetch() throws for network errors.
      // Libraries like ws handle this gracefully (retry/fallback).
      const req = new ClientRequest({
        method: 'GET',
        hostname: 'deploy.convex.cloud',
        path: '/api/sync',
        headers: {
          'Connection': 'Upgrade',
          'Upgrade': 'websocket',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13',
        },
      }, 'https');

      const error = await new Promise<Error>((resolve) => {
        req.on('error', (err: unknown) => resolve(err as Error));
        req.end();
      });

      expect(error).toBeInstanceOf(TypeError);
      expect(error.message).toBe('Failed to fetch');
    });

    it('should not intercept non-upgrade requests', async () => {
      const originalFetch = globalThis.fetch;
      let fetchCalled = false;
      globalThis.fetch = async (url: any, _opts: any) => {
        fetchCalled = true;
        return new Response('ok', { status: 200 });
      };

      try {
        const req = new ClientRequest({
          method: 'GET',
          hostname: 'example.com',
          path: '/api',
        }, 'https');

        await new Promise<void>((resolve) => {
          req.on('response', () => resolve());
          req.on('error', () => resolve());
          req.end();
        });

        expect(fetchCalled).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('request function', () => {
    it('should create ClientRequest with options object', () => {
      const req = request({
        hostname: 'example.com',
        path: '/api',
        method: 'POST'
      });

      expect(req).toBeInstanceOf(ClientRequest);
      expect(req.method).toBe('POST');
    });

    it('should create ClientRequest from URL string', () => {
      const req = request('http://example.com/path?query=1');

      expect(req).toBeInstanceOf(ClientRequest);
      expect(req.path).toBe('/path?query=1');
    });

    it('should create ClientRequest from URL object', () => {
      const url = new URL('http://example.com:8080/api');
      const req = request(url);

      expect(req).toBeInstanceOf(ClientRequest);
      expect(req.path).toBe('/api');
    });

    it('should attach response callback', () => {
      let callbackAttached = false;
      const req = request('http://example.com', () => {
        callbackAttached = true;
      });

      expect(req.listenerCount('response')).toBe(1);
    });
  });

  describe('get function', () => {
    it('should create GET request', () => {
      const req = get({ hostname: 'example.com', path: '/' });

      expect(req.method).toBe('GET');
    });

    it('should auto-call end()', () => {
      const req = get({ hostname: 'example.com', path: '/' });

      expect((req as any)._requestEnded).toBe(true);
    });
  });

  describe('https module', () => {
    it('should export request function', () => {
      expect(typeof https.request).toBe('function');
    });

    it('should export get function', () => {
      expect(typeof https.get).toBe('function');
    });

    it('should create https requests with correct protocol', () => {
      const req = https.request('https://secure.example.com/api');

      expect(req).toBeInstanceOf(ClientRequest);
      expect((req as any)._protocol).toBe('https');
    });
  });
});

describe('WebSocket frame helpers', () => {
  describe('_createWsFrame', () => {
    it('should create unmasked text frame with small payload', () => {
      const payload = new TextEncoder().encode('hello');
      const frame = _createWsFrame(0x01, payload, false);

      expect(frame[0]).toBe(0x81); // FIN + text opcode
      expect(frame[1]).toBe(5);    // unmasked, length 5
      expect(new TextDecoder().decode(frame.slice(2))).toBe('hello');
    });

    it('should create unmasked binary frame', () => {
      const payload = new Uint8Array([1, 2, 3]);
      const frame = _createWsFrame(0x02, payload, false);

      expect(frame[0]).toBe(0x82); // FIN + binary opcode
      expect(frame[1]).toBe(3);
      expect(frame[2]).toBe(1);
      expect(frame[3]).toBe(2);
      expect(frame[4]).toBe(3);
    });

    it('should create masked frame', () => {
      const payload = new TextEncoder().encode('test');
      const frame = _createWsFrame(0x01, payload, true);

      expect(frame[0]).toBe(0x81);
      expect(frame[1]).toBe(0x80 | 4); // masked, length 4
      // frame[2..5] = mask key, frame[6..9] = masked payload
      expect(frame.length).toBe(2 + 4 + 4);
    });

    it('should handle medium payload (126-65535 bytes)', () => {
      const payload = new Uint8Array(300);
      const frame = _createWsFrame(0x01, payload, false);

      expect(frame[0]).toBe(0x81);
      expect(frame[1]).toBe(126);
      expect((frame[2] << 8) | frame[3]).toBe(300);
      expect(frame.length).toBe(4 + 300);
    });

    it('should create close frame', () => {
      const payload = new Uint8Array([0x03, 0xE8]); // code 1000
      const frame = _createWsFrame(0x08, payload, false);

      expect(frame[0]).toBe(0x88); // FIN + close
      expect(frame[1]).toBe(2);
    });
  });

  describe('_parseWsFrame', () => {
    it('should parse unmasked text frame', () => {
      const frame = _createWsFrame(0x01, new TextEncoder().encode('hello'), false);
      const parsed = _parseWsFrame(frame);

      expect(parsed).not.toBeNull();
      expect(parsed!.opcode).toBe(0x01);
      expect(new TextDecoder().decode(parsed!.payload)).toBe('hello');
      expect(parsed!.totalLength).toBe(frame.length);
    });

    it('should parse masked frame and unmask payload', () => {
      const original = new TextEncoder().encode('test');
      const frame = _createWsFrame(0x01, original, true);
      const parsed = _parseWsFrame(frame);

      expect(parsed).not.toBeNull();
      expect(parsed!.opcode).toBe(0x01);
      expect(new TextDecoder().decode(parsed!.payload)).toBe('test');
    });

    it('should return null for incomplete frame', () => {
      expect(_parseWsFrame(new Uint8Array([0x81]))).toBeNull();
      expect(_parseWsFrame(new Uint8Array([]))).toBeNull();
    });

    it('should return null for incomplete payload', () => {
      // Header says 5 bytes but only 3 provided
      const incomplete = new Uint8Array([0x81, 5, 0x68, 0x65, 0x6c]);
      expect(_parseWsFrame(incomplete)).toBeNull();
    });

    it('should round-trip medium payload', () => {
      const payload = new Uint8Array(500);
      for (let i = 0; i < 500; i++) payload[i] = i % 256;

      const frame = _createWsFrame(0x02, payload, false);
      const parsed = _parseWsFrame(frame);

      expect(parsed).not.toBeNull();
      expect(parsed!.opcode).toBe(0x02);
      expect(parsed!.payload.length).toBe(500);
      expect(Array.from(parsed!.payload)).toEqual(Array.from(payload));
    });

    it('should round-trip masked medium payload', () => {
      const payload = new Uint8Array(1000);
      for (let i = 0; i < 1000; i++) payload[i] = i % 256;

      const frame = _createWsFrame(0x02, payload, true);
      const parsed = _parseWsFrame(frame);

      expect(parsed).not.toBeNull();
      expect(parsed!.payload.length).toBe(1000);
      expect(Array.from(parsed!.payload)).toEqual(Array.from(payload));
    });

    it('should parse close frame', () => {
      const closePayload = new Uint8Array([0x03, 0xE8]); // code 1000
      const frame = _createWsFrame(0x08, closePayload, false);
      const parsed = _parseWsFrame(frame);

      expect(parsed).not.toBeNull();
      expect(parsed!.opcode).toBe(0x08);
      expect((parsed!.payload[0] << 8) | parsed!.payload[1]).toBe(1000);
    });
  });
});

describe('EventEmitter', () => {
  it('should emit and listen to events', () => {
    const emitter = new EventEmitter();
    const received: string[] = [];

    emitter.on('test', (data) => received.push(data as string));
    emitter.emit('test', 'hello');
    emitter.emit('test', 'world');

    expect(received).toEqual(['hello', 'world']);
  });

  it('should handle once listeners', () => {
    const emitter = new EventEmitter();
    let count = 0;

    emitter.once('event', () => count++);
    emitter.emit('event');
    emitter.emit('event');

    expect(count).toBe(1);
  });

  it('should remove listeners', () => {
    const emitter = new EventEmitter();
    let count = 0;
    const listener = () => count++;

    emitter.on('event', listener);
    emitter.emit('event');
    emitter.off('event', listener);
    emitter.emit('event');

    expect(count).toBe(1);
  });
});
