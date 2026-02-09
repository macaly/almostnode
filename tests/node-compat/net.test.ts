/**
 * Node.js net module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-net-*.js
 *
 * Note: Our net shim provides virtual networking primitives for browser use.
 */

import { describe, it, expect, vi } from 'vitest';
import net, { Socket, Server, createServer, createConnection, connect, isIP, isIPv4, isIPv6 } from '../../src/shims/net';
import { assert } from './common';

describe('net module (Node.js compat)', () => {
  describe('exports', () => {
    it('should export Socket and Server classes', () => {
      expect(typeof Socket).toBe('function');
      expect(typeof Server).toBe('function');
    });

    it('should export factory functions', () => {
      expect(typeof createServer).toBe('function');
      expect(typeof createConnection).toBe('function');
      expect(typeof connect).toBe('function');
    });

    it('should export IP helper functions', () => {
      expect(typeof isIP).toBe('function');
      expect(typeof isIPv4).toBe('function');
      expect(typeof isIPv6).toBe('function');
    });
  });

  describe('IP helpers', () => {
    it('isIP should identify basic IPv4 and IPv6 values', () => {
      assert.strictEqual(isIP('127.0.0.1'), 4);
      assert.strictEqual(isIP('::1'), 6);
      assert.strictEqual(isIP('not-an-ip'), 0);
    });

    it('isIPv4 should match IPv4 addresses', () => {
      assert.strictEqual(isIPv4('127.0.0.1'), true);
      assert.strictEqual(isIPv4('::1'), false);
    });

    it('isIPv6 should match IPv6 addresses', () => {
      assert.strictEqual(isIPv6('::1'), true);
      assert.strictEqual(isIPv6('127.0.0.1'), false);
    });
  });

  describe('Socket', () => {
    it('should create a socket instance', () => {
      const socket = new Socket();
      expect(socket).toBeInstanceOf(Socket);
    });

    it('should have initial disconnected state', () => {
      const socket = new Socket();
      assert.strictEqual(socket.connecting, false);
      assert.strictEqual(socket.destroyed, false);
      assert.strictEqual(socket.readyState, 'closed');
      assert.strictEqual(socket.address(), null);
    });

    it('connect(port, host, callback) should emit connect and invoke callback', async () => {
      const socket = new Socket();
      const onConnect = vi.fn();
      const onCallback = vi.fn();

      socket.on('connect', onConnect);
      socket.connect(3000, 'localhost', onCallback);

      expect(socket.connecting).toBe(true);
      expect(socket.readyState).toBe('opening');

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onConnect).toHaveBeenCalledTimes(1);
      expect(onCallback).toHaveBeenCalledTimes(1);
      assert.strictEqual(socket.connecting, false);
      assert.strictEqual(socket.readyState, 'open');
      assert.strictEqual(socket.remoteAddress, 'localhost');
      assert.strictEqual(socket.remotePort, 3000);
      assert.strictEqual(socket.remoteFamily, 'IPv4');
    });

    it('connect(options, callback) should support options overload', async () => {
      const socket = new Socket();
      const onCallback = vi.fn();

      socket.connect({ port: 4321, host: '127.0.0.1' }, onCallback);
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.strictEqual(socket.remoteAddress, '127.0.0.1');
      assert.strictEqual(socket.remotePort, 4321);
      expect(onCallback).toHaveBeenCalledTimes(1);
    });

    it('address() should return AddressInfo when connected', async () => {
      const socket = new Socket();
      socket.connect(1234);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const addr = socket.address();
      expect(addr).not.toBeNull();
      assert.strictEqual(addr?.address, '127.0.0.1');
      assert.strictEqual(addr?.family, 'IPv4');
      expect(typeof addr?.port).toBe('number');
    });

    it('setters should be chainable', () => {
      const socket = new Socket();
      expect(socket.setEncoding('utf8')).toBe(socket);
      expect(socket.setNoDelay(true)).toBe(socket);
      expect(socket.setKeepAlive(true, 100)).toBe(socket);
      expect(socket.ref()).toBe(socket);
      expect(socket.unref()).toBe(socket);
    });

    it('setTimeout(callback) should register timeout listener', () => {
      const socket = new Socket();
      const onTimeout = vi.fn();
      socket.setTimeout(10, onTimeout);
      socket.emit('timeout');
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('destroy() should update state and emit close', async () => {
      const socket = new Socket();
      const onClose = vi.fn();
      socket.on('close', onClose);

      socket.destroy();
      assert.strictEqual(socket.destroyed, true);
      assert.strictEqual(socket.readyState, 'closed');

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(onClose).toHaveBeenCalledWith(false);
    });

    it('destroy(error) should emit error and close(true)', async () => {
      const socket = new Socket();
      const onError = vi.fn();
      const onClose = vi.fn();
      socket.on('error', onError);
      socket.on('close', onClose);

      const err = new Error('boom');
      socket.destroy(err);

      expect(onError).toHaveBeenCalledWith(err);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(onClose).toHaveBeenCalledWith(true);
    });

    it('_receiveData should push readable data', async () => {
      const socket = new Socket();
      const onData = vi.fn();
      socket.on('data', onData);

      socket._receiveData('hello');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onData).toHaveBeenCalledTimes(1);
      const chunk = onData.mock.calls[0][0];
      expect(chunk instanceof Uint8Array).toBe(true);
      assert.strictEqual(new TextDecoder().decode(chunk as Uint8Array), 'hello');
    });

    it('_receiveEnd should end readable side', async () => {
      const socket = new Socket();
      const onEnd = vi.fn();
      socket.on('end', onEnd);
      socket.resume();

      socket._receiveEnd();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe('Server', () => {
    it('should create a server instance', () => {
      const server = new Server();
      expect(server).toBeInstanceOf(Server);
      assert.strictEqual(server.listening, false);
    });

    it('createServer(listener) should wire connection listener', () => {
      const onConnection = vi.fn();
      const server = createServer(onConnection);
      const socket = new Socket();
      server.listen(8080);
      server._handleConnection(socket);
      expect(onConnection).toHaveBeenCalledWith(socket);
    });

    it('listen() should set listening state and emit listening', async () => {
      const server = createServer();
      const onListening = vi.fn();
      const onCallback = vi.fn();

      server.on('listening', onListening);
      server.listen(8123, '127.0.0.1', onCallback);

      assert.strictEqual(server.listening, true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onListening).toHaveBeenCalledTimes(1);
      expect(onCallback).toHaveBeenCalledTimes(1);

      const addr = server.address();
      expect(addr).not.toBeNull();
      assert.strictEqual(addr?.address, '127.0.0.1');
      assert.strictEqual(addr?.family, 'IPv4');
      assert.strictEqual(addr?.port, 8123);
    });

    it('listen(0) should assign non-zero port', () => {
      const server = createServer();
      server.listen(0);
      const addr = server.address();
      expect(addr).not.toBeNull();
      expect((addr as { port: number }).port).toBeGreaterThan(0);
    });

    it('close() should stop listening and emit close', async () => {
      const server = createServer();
      const onClose = vi.fn();
      const onCallback = vi.fn();

      server.listen(9000);
      server.on('close', onClose);
      server.close(onCallback);

      assert.strictEqual(server.listening, false);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onCallback).toHaveBeenCalledTimes(1);
    });

    it('getConnections() should report connection count', () => {
      const server = createServer();
      server.listen(8000);
      server._handleConnection(new Socket());
      server._handleConnection(new Socket());

      const callback = vi.fn();
      server.getConnections(callback);

      expect(callback).toHaveBeenCalledWith(null, 2);
    });

    it('_handleConnection should destroy socket when server is not listening', async () => {
      const server = createServer();
      const socket = new Socket();
      server._handleConnection(socket);
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.strictEqual(socket.destroyed, true);
    });

    it('ref() and unref() should be chainable', () => {
      const server = createServer();
      expect(server.ref()).toBe(server);
      expect(server.unref()).toBe(server);
    });
  });

  describe('createConnection/connect()', () => {
    it('createConnection should return connected socket', async () => {
      const socket = createConnection(7777);
      expect(socket).toBeInstanceOf(Socket);
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.strictEqual(socket.readyState, 'open');
      assert.strictEqual(socket.remotePort, 7777);
    });

    it('connect alias should behave like createConnection', async () => {
      const socket = connect({ port: 8888, host: 'localhost' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.strictEqual(socket.remotePort, 8888);
      assert.strictEqual(socket.remoteAddress, 'localhost');
    });
  });

  describe('default export', () => {
    it('should expose key APIs', () => {
      expect(net.Socket).toBe(Socket);
      expect(net.Server).toBe(Server);
      expect(net.createServer).toBe(createServer);
      expect(net.connect).toBe(connect);
      expect(net.isIP).toBe(isIP);
    });
  });

  describe('known limitations (documented)', () => {
    it.skip('should perform real TCP networking with OS sockets', () => {
      const server = createServer((socket) => {
        socket.write('hello');
      });
      server.listen(0, '127.0.0.1');
    });

    it.skip('should enforce strict IPv4 segment validation like Node', () => {
      assert.strictEqual(isIP('999.999.999.999'), 0);
    });
  });
});
