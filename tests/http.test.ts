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
        req.on('data', (chunk) => chunks.push(chunk));
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
        req.on('data', (chunk) => chunks.push(chunk));
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
      server.on('request', (req, res) => {
        requestReceived = true;
        res.end('OK');
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
        req.on('data', (chunk) => chunks.push(chunk));
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

      expect((req as any)._ended).toBe(true);
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
