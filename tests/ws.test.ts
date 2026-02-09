/**
 * Tests for ws (WebSocket) shim
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket, WebSocketServer, Server } from '../src/shims/ws';

describe('ws shim', () => {
  describe('WebSocket class', () => {
    it('should have static state constants', () => {
      expect(WebSocket.CONNECTING).toBe(0);
      expect(WebSocket.OPEN).toBe(1);
      expect(WebSocket.CLOSING).toBe(2);
      expect(WebSocket.CLOSED).toBe(3);
    });

    it('should create a WebSocket instance', () => {
      const ws = new WebSocket('ws://localhost:3000');
      expect(ws).toBeDefined();
      expect(ws.url).toBe('ws://localhost:3000');
      expect(ws.readyState).toBe(WebSocket.CONNECTING);
      ws.close();
    });

    it('should have instance state constants', () => {
      const ws = new WebSocket('ws://localhost:3000');
      expect(ws.CONNECTING).toBe(0);
      expect(ws.OPEN).toBe(1);
      expect(ws.CLOSING).toBe(2);
      expect(ws.CLOSED).toBe(3);
      ws.close();
    });

    it('should emit open event', async () => {
      const ws = new WebSocket('ws://localhost:3000');

      const openPromise = new Promise<void>((resolve) => {
        ws.on('open', () => {
          resolve();
        });
      });

      await openPromise;
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('should support onopen handler', async () => {
      const ws = new WebSocket('ws://localhost:3000');

      const openPromise = new Promise<void>((resolve) => {
        ws.onopen = () => {
          resolve();
        };
      });

      await openPromise;
      ws.close();
    });

    it('should emit close event when closed', async () => {
      const ws = new WebSocket('ws://localhost:3000');

      // Wait for open
      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      let closeCalled = false;
      ws.on('close', () => {
        closeCalled = true;
      });

      ws.close();

      // Wait a tick for the async close
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(closeCalled).toBe(true);
      expect(ws.readyState).toBe(WebSocket.CLOSED);
    });

    it('should support onclose handler', async () => {
      const ws = new WebSocket('ws://localhost:3000');

      // Wait for open
      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      let closeCalled = false;
      ws.onclose = () => {
        closeCalled = true;
      };

      ws.close();

      // Wait a tick for the async close
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(closeCalled).toBe(true);
    });

    it('should throw when sending on non-open socket', async () => {
      const ws = new WebSocket('ws://localhost:3000');

      // Should throw because socket is not open yet
      expect(() => ws.send('test')).toThrow('WebSocket is not open');

      ws.close();
    });

    it('should allow sending when open', async () => {
      const ws = new WebSocket('ws://localhost:3000');

      // Wait for open
      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      // Should not throw
      expect(() => ws.send('test')).not.toThrow();

      ws.close();
    });

    it('should support ping and pong methods', async () => {
      const ws = new WebSocket('ws://localhost:3000');

      // These should not throw (no-ops in browser)
      expect(() => ws.ping()).not.toThrow();
      expect(() => ws.pong()).not.toThrow();

      ws.close();
    });

    it('should support terminate method', async () => {
      const ws = new WebSocket('ws://localhost:3000');

      // Wait for open
      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      let closeCalled = false;
      ws.on('close', () => {
        closeCalled = true;
      });

      ws.terminate();

      // Wait a tick for the async close
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(closeCalled).toBe(true);
      expect(ws.readyState).toBe(WebSocket.CLOSED);
    });
  });

  describe('WebSocketServer class', () => {
    let server: WebSocketServer;

    afterEach(() => {
      if (server) {
        server.close();
      }
    });

    it('should create a server instance', () => {
      server = new WebSocketServer({ port: 3001 });
      expect(server).toBeDefined();
      expect(server.clients).toBeInstanceOf(Set);
    });

    it('should support noServer option', () => {
      server = new WebSocketServer({ noServer: true });
      expect(server).toBeDefined();
    });

    it('should support path option', () => {
      server = new WebSocketServer({ path: '/ws' });
      expect(server).toBeDefined();
    });

    it('should return address info', () => {
      server = new WebSocketServer({ host: '127.0.0.1', port: 3002 });
      const address = server.address();

      expect(address).toBeDefined();
      expect(address?.port).toBe(3002);
      expect(address?.address).toBe('127.0.0.1');
      expect(address?.family).toBe('IPv4');
    });

    it('should handle handleUpgrade', async () => {
      server = new WebSocketServer({ noServer: true });

      const connectionPromise = new Promise<void>((resolve) => {
        server.on('connection', (ws) => {
          expect(ws).toBeDefined();
          resolve();
        });
      });

      // Simulate upgrade
      server.handleUpgrade({}, {}, Buffer.alloc(0), (ws) => {
        expect(ws).toBeDefined();
      });

      await connectionPromise;
    });

    it('should track clients when clientTracking is not false', async () => {
      server = new WebSocketServer({ noServer: true });

      const wsPromise = new Promise<void>((resolve) => {
        server.handleUpgrade({}, {}, Buffer.alloc(0), (ws) => {
          // Note: The ws is added to clients after the callback in the async setTimeout
          // So we check it via the connection event instead
          resolve();
        });
      });

      server.on('connection', (ws: unknown) => {
        expect(server.clients.has(ws as any)).toBe(true);
      });

      await wsPromise;
      // Wait for the async callback
      await new Promise(r => setTimeout(r, 10));
    });

    it('should emit close event when closed', async () => {
      server = new WebSocketServer({ port: 3003 });

      const closePromise = new Promise<void>((resolve) => {
        server.on('close', () => {
          resolve();
        });
      });

      server.close();
      await closePromise;
    });

    it('should support close callback', async () => {
      server = new WebSocketServer({ port: 3004 });

      const callbackPromise = new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });

      await callbackPromise;
    });
  });

  describe('Server export', () => {
    it('should be the same as WebSocketServer', () => {
      expect(Server).toBe(WebSocketServer);
    });
  });
});
