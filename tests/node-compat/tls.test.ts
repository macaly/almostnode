/**
 * Node.js tls module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-tls-*.js
 *
 * Note: Browser environments cannot provide real TLS handshakes.
 */

import { describe, it, expect, vi } from 'vitest';
import tls, {
  TLSSocket,
  Server,
  createServer,
  connect,
  createSecureContext,
  getCiphers,
  DEFAULT_ECDH_CURVE,
  DEFAULT_MAX_VERSION,
  DEFAULT_MIN_VERSION,
  rootCertificates,
} from '../../src/shims/tls';
import { assert } from './common';

describe('tls module (Node.js compat)', () => {
  describe('exports', () => {
    it('should export TLSSocket and Server classes', () => {
      expect(typeof TLSSocket).toBe('function');
      expect(typeof Server).toBe('function');
    });

    it('should export createServer/connect helpers', () => {
      expect(typeof createServer).toBe('function');
      expect(typeof connect).toBe('function');
    });

    it('should export context/cipher helpers', () => {
      expect(typeof createSecureContext).toBe('function');
      expect(typeof getCiphers).toBe('function');
    });
  });

  describe('constants', () => {
    it('should expose TLS default version constants', () => {
      assert.strictEqual(DEFAULT_ECDH_CURVE, 'auto');
      assert.strictEqual(DEFAULT_MAX_VERSION, 'TLSv1.3');
      assert.strictEqual(DEFAULT_MIN_VERSION, 'TLSv1.2');
    });

    it('should expose rootCertificates array', () => {
      expect(Array.isArray(rootCertificates)).toBe(true);
    });
  });

  describe('TLSSocket', () => {
    it('should create instance with default state', () => {
      const socket = new TLSSocket();
      expect(socket).toBeInstanceOf(TLSSocket);
      assert.strictEqual(socket.authorized, false);
      assert.strictEqual(socket.encrypted, true);
    });

    it('should provide certificate/cipher/protocol accessors', () => {
      const socket = new TLSSocket();
      expect(typeof socket.getPeerCertificate()).toBe('object');
      assert.strictEqual(socket.getCipher(), null);
      assert.strictEqual(socket.getProtocol(), null);
    });

    it('setServername should be callable', () => {
      const socket = new TLSSocket();
      assert.doesNotThrow(() => socket.setServername('example.com'));
    });

    it('renegotiate should return false', () => {
      const socket = new TLSSocket();
      const cb = vi.fn();
      assert.strictEqual(socket.renegotiate({}, cb), false);
      expect(cb).toHaveBeenCalledTimes(0);
    });
  });

  describe('Server', () => {
    it('should create server instance', () => {
      const server = new Server();
      expect(server).toBeInstanceOf(Server);
    });

    it('listen() and close() should be chainable', () => {
      const server = new Server();
      expect(server.listen()).toBe(server);
      expect(server.close()).toBe(server);
    });

    it('address() should return null in shim', () => {
      const server = new Server();
      assert.strictEqual(server.address(), null);
    });

    it('ticket key helpers should be callable', () => {
      const server = new Server();
      const keys = server.getTicketKeys();
      expect(Buffer.isBuffer(keys)).toBe(true);
      assert.doesNotThrow(() => server.setTicketKeys(Buffer.from('')));
    });

    it('setSecureContext should be callable', () => {
      const server = new Server();
      assert.doesNotThrow(() => server.setSecureContext({}));
    });
  });

  describe('helper functions', () => {
    it('createServer() should return Server', () => {
      const server = createServer();
      expect(server).toBeInstanceOf(Server);
    });

    it('connect() should return TLSSocket', () => {
      const socket = connect({ host: 'example.com', port: 443 });
      expect(socket).toBeInstanceOf(TLSSocket);
    });

    it('connect(options, callback) should invoke callback asynchronously', async () => {
      const onConnect = vi.fn();
      connect({ host: 'example.com', port: 443 }, onConnect);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(onConnect).toHaveBeenCalledTimes(1);
    });

    it('createSecureContext() should return object', () => {
      const context = createSecureContext({});
      expect(typeof context).toBe('object');
      expect(context).not.toBeNull();
    });

    it('getCiphers() should return non-empty cipher list', () => {
      const ciphers = getCiphers();
      expect(Array.isArray(ciphers)).toBe(true);
      expect(ciphers.length).toBeGreaterThan(0);
      expect(ciphers).toContain('TLS_AES_256_GCM_SHA384');
    });
  });

  describe('default export', () => {
    it('should expose key APIs', () => {
      expect(tls.TLSSocket).toBe(TLSSocket);
      expect(tls.Server).toBe(Server);
      expect(tls.createServer).toBe(createServer);
      expect(tls.connect).toBe(connect);
      expect(tls.getCiphers).toBe(getCiphers);
    });
  });

  describe('known limitations (documented)', () => {
    it.skip('should perform real TLS handshake and verify peer certificates', () => {
      const socket = connect({ host: 'example.com', port: 443, rejectUnauthorized: true });
      expect(socket.authorized).toBe(true);
    });

    it.skip('should expose negotiated protocol/cipher after secure connection', () => {
      const socket = connect({ host: 'example.com', port: 443 });
      expect(socket.getProtocol()).toBeTruthy();
      expect(socket.getCipher()).not.toBeNull();
    });
  });
});
