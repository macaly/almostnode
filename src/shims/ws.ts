/**
 * ws (WebSocket) shim for browser environment
 * Used by Vite for HMR (Hot Module Replacement)
 */

import { EventEmitter } from './events';

// Polyfill for CloseEvent (not available in Node.js)
const CloseEventPolyfill = typeof CloseEvent !== 'undefined' ? CloseEvent : class CloseEvent extends Event {
  code: number;
  reason: string;
  wasClean: boolean;
  constructor(type: string, init?: { code?: number; reason?: string; wasClean?: boolean }) {
    super(type);
    this.code = init?.code ?? 1000;
    this.reason = init?.reason ?? '';
    this.wasClean = init?.wasClean ?? true;
  }
};

// Polyfill for MessageEvent (not available in Node.js)
const MessageEventPolyfill = typeof MessageEvent !== 'undefined' ? MessageEvent : class MessageEvent extends Event {
  data: unknown;
  constructor(type: string, init?: { data?: unknown }) {
    super(type);
    this.data = init?.data;
  }
};

// Message channel for communication between WebSocket server and clients
let messageChannel: BroadcastChannel | null = null;
try {
  messageChannel = new BroadcastChannel('vite-ws-channel');
} catch {
  // BroadcastChannel not available in some environments
}

// Track all server instances
const servers = new Map<string, WebSocketServer>();
let clientIdCounter = 0;

export class WebSocket extends EventEmitter {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = WebSocket.CONNECTING;
  readonly OPEN = WebSocket.OPEN;
  readonly CLOSING = WebSocket.CLOSING;
  readonly CLOSED = WebSocket.CLOSED;

  readyState: number = WebSocket.CONNECTING;
  url: string;
  protocol: string = '';
  extensions: string = '';
  bufferedAmount: number = 0;
  binaryType: 'blob' | 'arraybuffer' = 'blob';

  private _id: string;
  private _server: WebSocketServer | null = null;
  private _nativeWs: globalThis.WebSocket | null = null;

  // Event handler properties
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    super();
    this.url = url;
    this._id = `client-${++clientIdCounter}`;

    if (protocols) {
      this.protocol = Array.isArray(protocols) ? protocols[0] : protocols;
    }

    // Connect asynchronously
    setTimeout(() => this._connect(), 0);
  }

  private _connect(): void {
    // For internal WebSocket connections (from server to client), connect immediately
    if (this.url.startsWith('internal://')) {
      this.readyState = WebSocket.OPEN;
      this.emit('open');
      if (this.onopen) this.onopen(new Event('open'));
      return;
    }

    // For external WebSocket connections, use the browser's native WebSocket.
    // This allows libraries like the Convex CLI (which require('ws')) to
    // communicate with real remote servers.
    if (this.url.startsWith('ws://') || this.url.startsWith('wss://')) {
      this._connectNative();
      return;
    }

    // For all other URLs, use BroadcastChannel (internal Vite HMR)
    if (!messageChannel) {
      setTimeout(() => {
        this.readyState = WebSocket.OPEN;
        this.emit('open');
        if (this.onopen) this.onopen(new Event('open'));
      }, 0);
      return;
    }

    // Try to connect to a server via BroadcastChannel
    messageChannel.postMessage({
      type: 'connect',
      clientId: this._id,
      url: this.url,
    });

    // Listen for responses
    const channel = messageChannel;
    const handler = (event: MessageEvent) => {
      const data = event.data;

      if (data.targetClient !== this._id) return;

      switch (data.type) {
        case 'connected':
          this.readyState = WebSocket.OPEN;
          this.emit('open');
          if (this.onopen) this.onopen(new Event('open'));
          break;

        case 'message':
          const msgEvent = new MessageEventPolyfill('message', { data: data.payload });
          this.emit('message', msgEvent);
          if (this.onmessage) this.onmessage(msgEvent as unknown as MessageEvent);
          break;

        case 'close':
          this.readyState = WebSocket.CLOSED;
          const closeEvent = new CloseEventPolyfill('close', {
            code: data.code || 1000,
            reason: data.reason || '',
            wasClean: true,
          });
          this.emit('close', closeEvent);
          if (this.onclose) this.onclose(closeEvent as unknown as CloseEvent);
          channel.removeEventListener('message', handler);
          break;

        case 'error':
          const errorEvent = new Event('error');
          this.emit('error', errorEvent);
          if (this.onerror) this.onerror(errorEvent);
          break;
      }
    };

    channel.addEventListener('message', handler);

    // Connection timeout
    setTimeout(() => {
      if (this.readyState === WebSocket.CONNECTING) {
        // No server responded, act as if connected (for standalone client use)
        this.readyState = WebSocket.OPEN;
        this.emit('open');
        if (this.onopen) this.onopen(new Event('open'));
      }
    }, 100);
  }

  private _connectNative(): void {
    // Check that the browser's native WebSocket is available and is not our own shim.
    // Only use native WebSocket in a real browser — Node.js 21+ has native WebSocket
    // but it connects to real servers, which breaks tests and isn't what the shim needs.
    const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
    const NativeWS = isBrowser && typeof globalThis.WebSocket === 'function' && globalThis.WebSocket !== (WebSocket as any)
      ? globalThis.WebSocket
      : null;

    if (!NativeWS) {
      // No native WebSocket (test env, Node.js, etc.) — act as if connected
      setTimeout(() => {
        this.readyState = WebSocket.OPEN;
        this.emit('open');
        if (this.onopen) this.onopen(new Event('open'));
      }, 0);
      return;
    }

    try {
      this._nativeWs = new NativeWS(this.url);
      this._nativeWs.binaryType = this.binaryType === 'arraybuffer' ? 'arraybuffer' : 'blob';
    } catch {
      this.readyState = WebSocket.CLOSED;
      const errorEvent = new Event('error');
      this.emit('error', errorEvent);
      if (this.onerror) this.onerror(errorEvent);
      return;
    }

    this._nativeWs.onopen = () => {
      this.readyState = WebSocket.OPEN;
      this.emit('open');
      if (this.onopen) this.onopen(new Event('open'));
    };

    this._nativeWs.onmessage = (event: globalThis.MessageEvent) => {
      const msgEvent = new MessageEventPolyfill('message', { data: event.data });
      this.emit('message', msgEvent);
      if (this.onmessage) this.onmessage(msgEvent as unknown as MessageEvent);
    };

    this._nativeWs.onclose = (event: globalThis.CloseEvent) => {
      this.readyState = WebSocket.CLOSED;
      this._nativeWs = null;
      const closeEvent = new CloseEventPolyfill('close', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      this.emit('close', closeEvent);
      if (this.onclose) this.onclose(closeEvent as unknown as CloseEvent);
    };

    this._nativeWs.onerror = () => {
      const errorEvent = new Event('error');
      this.emit('error', errorEvent);
      if (this.onerror) this.onerror(errorEvent);
    };
  }

  send(data: string | ArrayBuffer | Uint8Array): void {
    if (this.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }

    // If connected to native WebSocket (external server)
    if (this._nativeWs) {
      this._nativeWs.send(data);
      return;
    }

    // If connected to internal server
    if (this._server) {
      this._server._handleClientMessage(this, data);
      return;
    }

    // Send via BroadcastChannel
    if (messageChannel) {
      messageChannel.postMessage({
        type: 'message',
        clientId: this._id,
        url: this.url,
        payload: data,
      });
    }
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === WebSocket.CLOSED || this.readyState === WebSocket.CLOSING) {
      return;
    }

    this.readyState = WebSocket.CLOSING;

    // If connected to native WebSocket, close it (onclose handler emits events)
    if (this._nativeWs) {
      this._nativeWs.close(code, reason);
      return;
    }

    if (messageChannel) {
      messageChannel.postMessage({
        type: 'disconnect',
        clientId: this._id,
        url: this.url,
        code,
        reason,
      });
    }

    setTimeout(() => {
      this.readyState = WebSocket.CLOSED;
      const closeEvent = new CloseEventPolyfill('close', {
        code: code || 1000,
        reason: reason || '',
        wasClean: true,
      });
      this.emit('close', closeEvent);
      if (this.onclose) this.onclose(closeEvent as unknown as CloseEvent);
    }, 0);
  }

  ping(): void {
    // No-op in browser
  }

  pong(): void {
    // No-op in browser
  }

  terminate(): void {
    if (this._nativeWs) {
      this._nativeWs.close();
      this._nativeWs = null;
    }
    this.readyState = WebSocket.CLOSED;
    const closeEvent = new CloseEventPolyfill('close', {
      code: 1006,
      reason: 'Connection terminated',
      wasClean: false,
    });
    this.emit('close', closeEvent);
    if (this.onclose) this.onclose(closeEvent as unknown as CloseEvent);
  }

  // For internal server use
  _setServer(server: WebSocketServer): void {
    this._server = server;
  }

  _receiveMessage(data: unknown): void {
    const msgEvent = new MessageEventPolyfill('message', { data });
    this.emit('message', msgEvent);
    if (this.onmessage) this.onmessage(msgEvent as unknown as MessageEvent);
  }
}

export interface ServerOptions {
  host?: string;
  port?: number;
  server?: unknown; // HTTP server
  noServer?: boolean;
  path?: string;
  clientTracking?: boolean;
  perMessageDeflate?: boolean | object;
  maxPayload?: number;
}

export class WebSocketServer extends EventEmitter {
  clients: Set<WebSocket> = new Set();
  options: ServerOptions;
  private _path: string;
  private _channelHandler: ((event: MessageEvent) => void) | null = null;

  constructor(options: ServerOptions = {}) {
    super();
    this.options = options;
    this._path = options.path || '/';

    // If not noServer, set up listening
    if (!options.noServer) {
      this._setupListener();
    }

    // Register server
    servers.set(this._path, this);
  }

  private _setupListener(): void {
    if (!messageChannel) return;

    const channel = messageChannel;
    this._channelHandler = (event: MessageEvent) => {
      const data = event.data;

      if (data.type === 'connect') {
        // Create a new WebSocket for this client
        const ws = new WebSocket('internal://' + this._path);
        ws._setServer(this);
        (ws as unknown as { _clientId: string })._clientId = data.clientId;
        this.clients.add(ws);

        // Notify client of connection
        channel.postMessage({
          type: 'connected',
          targetClient: data.clientId,
        });

        // Emit connection event
        this.emit('connection', ws, { url: data.url });
      }

      if (data.type === 'message') {
        // Find the client and deliver the message
        for (const client of this.clients) {
          if ((client as unknown as { _clientId: string })._clientId === data.clientId) {
            client._receiveMessage(data.payload);
            break;
          }
        }
      }

      if (data.type === 'disconnect') {
        for (const client of this.clients) {
          if ((client as unknown as { _clientId: string })._clientId === data.clientId) {
            client.close(data.code, data.reason);
            this.clients.delete(client);
            break;
          }
        }
      }
    };

    channel.addEventListener('message', this._channelHandler);
  }

  _handleClientMessage(client: WebSocket, data: unknown): void {
    // Broadcast to server-side handlers
    const msgEvent = new MessageEventPolyfill('message', { data });
    client.emit('message', msgEvent);
  }

  handleUpgrade(
    request: unknown,
    socket: unknown,
    head: unknown,
    callback: (ws: WebSocket, request: unknown) => void
  ): void {
    // Create WebSocket for this upgrade
    const ws = new WebSocket('internal://' + this._path);
    ws._setServer(this);

    if (this.options.clientTracking !== false) {
      this.clients.add(ws);
    }

    // Async callback
    setTimeout(() => {
      callback(ws, request);
      this.emit('connection', ws, request);
    }, 0);
  }

  close(callback?: () => void): void {
    // Close all clients
    for (const client of this.clients) {
      client.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    // Remove from registry
    servers.delete(this._path);

    // Remove channel listener
    if (this._channelHandler && messageChannel) {
      messageChannel.removeEventListener('message', this._channelHandler);
      this._channelHandler = null;
    }

    this.emit('close');

    if (callback) {
      setTimeout(callback, 0);
    }
  }

  address(): { port: number; family: string; address: string } | null {
    return {
      port: this.options.port || 0,
      family: 'IPv4',
      address: this.options.host || '0.0.0.0',
    };
  }

}

// Export WebSocket and Server
export default WebSocket;
export const Server = WebSocketServer;

// Additional exports for compatibility
export const createWebSocketStream = () => {
  throw new Error('createWebSocketStream is not supported in browser');
};
