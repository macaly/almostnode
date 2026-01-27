/**
 * Server Bridge
 * Connects Service Worker requests to virtual HTTP servers
 */

import {
  Server,
  ResponseData,
  setServerListenCallback,
  setServerCloseCallback,
  getServer,
} from './shims/http';
import { EventEmitter } from './shims/events';
import { Buffer } from './shims/stream';

export interface VirtualServer {
  server: Server;
  port: number;
  hostname: string;
}

export interface BridgeOptions {
  baseUrl?: string;
  onServerReady?: (port: number, url: string) => void;
}

/**
 * Server Bridge manages virtual HTTP servers and routes requests
 */
export class ServerBridge extends EventEmitter {
  private servers: Map<number, VirtualServer> = new Map();
  private baseUrl: string;
  private options: BridgeOptions;
  private messageChannel: MessageChannel | null = null;
  private serviceWorkerReady: boolean = false;

  constructor(options: BridgeOptions = {}) {
    super();
    this.options = options;

    // Handle browser vs Node.js environment
    if (typeof location !== 'undefined') {
      this.baseUrl = options.baseUrl || `${location.protocol}//${location.host}`;
    } else {
      this.baseUrl = options.baseUrl || 'http://localhost';
    }

    // Set up auto-registration from http module
    setServerListenCallback((port, server) => {
      this.registerServer(server, port);
    });

    setServerCloseCallback((port) => {
      this.unregisterServer(port);
    });
  }

  /**
   * Register a server on a port
   */
  registerServer(server: Server, port: number, hostname: string = '0.0.0.0'): void {
    this.servers.set(port, { server, port, hostname });

    // Emit server-ready event
    const url = this.getServerUrl(port);
    this.emit('server-ready', port, url);

    if (this.options.onServerReady) {
      this.options.onServerReady(port, url);
    }

    // Notify service worker if connected
    this.notifyServiceWorker('server-registered', { port, hostname });
  }

  /**
   * Unregister a server
   */
  unregisterServer(port: number): void {
    this.servers.delete(port);
    this.notifyServiceWorker('server-unregistered', { port });
  }

  /**
   * Get server URL for a port
   */
  getServerUrl(port: number): string {
    return `${this.baseUrl}/__virtual__/${port}`;
  }

  /**
   * Get all registered server ports
   */
  getServerPorts(): number[] {
    return [...this.servers.keys()];
  }

  /**
   * Handle an incoming request from Service Worker
   */
  async handleRequest(
    port: number,
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: ArrayBuffer
  ): Promise<ResponseData> {
    const virtualServer = this.servers.get(port);

    if (!virtualServer) {
      return {
        statusCode: 503,
        statusMessage: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' },
        body: Buffer.from(`No server listening on port ${port}`),
      };
    }

    try {
      const bodyBuffer = body ? Buffer.from(new Uint8Array(body)) : undefined;
      return await virtualServer.server.handleRequest(method, url, headers, bodyBuffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal Server Error';
      return {
        statusCode: 500,
        statusMessage: 'Internal Server Error',
        headers: { 'Content-Type': 'text/plain' },
        body: Buffer.from(message),
      };
    }
  }

  /**
   * Initialize Service Worker communication
   */
  async initServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Workers not supported');
    }

    // Register service worker
    const registration = await navigator.serviceWorker.register('/__sw__.js', {
      scope: '/',
    });

    // Wait for service worker to be active
    const sw = registration.active || registration.waiting || registration.installing;

    if (!sw) {
      throw new Error('Service Worker registration failed');
    }

    await new Promise<void>((resolve) => {
      if (sw.state === 'activated') {
        resolve();
      } else {
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated') {
            resolve();
          }
        });
      }
    });

    // Set up message channel for communication
    this.messageChannel = new MessageChannel();
    this.messageChannel.port1.onmessage = this.handleServiceWorkerMessage.bind(this);

    // Send port to service worker
    sw.postMessage({ type: 'init', port: this.messageChannel.port2 }, [
      this.messageChannel.port2,
    ]);

    this.serviceWorkerReady = true;
    this.emit('sw-ready');
  }

  /**
   * Handle messages from Service Worker
   */
  private async handleServiceWorkerMessage(event: MessageEvent): Promise<void> {
    const { type, id, data } = event.data;

    console.log('[ServerBridge] SW message:', type, id, data?.url);

    if (type === 'request') {
      const { port, method, url, headers, body } = data;

      console.log('[ServerBridge] Handling request:', port, method, url);

      try {
        const response = await this.handleRequest(port, method, url, headers, body);
        console.log('[ServerBridge] Response:', response.statusCode, 'body length:', response.body?.length);

        // Convert body to base64 string to avoid structured cloning issues with Uint8Array
        let bodyBase64 = '';
        if (response.body && response.body.length > 0) {
          // Convert Uint8Array to base64 string
          const bytes = response.body instanceof Uint8Array ? response.body : new Uint8Array(0);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          bodyBase64 = btoa(binary);
        }

        console.log('[ServerBridge] Sending response to SW, body base64 length:', bodyBase64.length);

        this.messageChannel?.port1.postMessage({
          type: 'response',
          id,
          data: {
            statusCode: response.statusCode,
            statusMessage: response.statusMessage,
            headers: response.headers,
            bodyBase64: bodyBase64,
          },
        });
      } catch (error) {
        this.messageChannel?.port1.postMessage({
          type: 'response',
          id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Send message to Service Worker
   */
  private notifyServiceWorker(type: string, data: unknown): void {
    if (this.serviceWorkerReady && this.messageChannel) {
      this.messageChannel.port1.postMessage({ type, data });
    }
  }

  /**
   * Create a mock request handler for testing without Service Worker
   */
  createFetchHandler(): (request: Request) => Promise<Response> {
    return async (request: Request): Promise<Response> => {
      const url = new URL(request.url);

      // Check if this is a virtual server request
      const match = url.pathname.match(/^\/__virtual__\/(\d+)(\/.*)?$/);
      if (!match) {
        throw new Error('Not a virtual server request');
      }

      const port = parseInt(match[1], 10);
      const path = match[2] || '/';

      // Build headers object
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });

      // Get body if present
      let body: ArrayBuffer | undefined;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        body = await request.arrayBuffer();
      }

      // Handle request
      const response = await this.handleRequest(
        port,
        request.method,
        path + url.search,
        headers,
        body
      );

      // Convert to fetch Response
      return new Response(response.body, {
        status: response.statusCode,
        statusText: response.statusMessage,
        headers: response.headers,
      });
    };
  }
}

// Global bridge instance
let globalBridge: ServerBridge | null = null;

/**
 * Get or create the global server bridge
 */
export function getServerBridge(options?: BridgeOptions): ServerBridge {
  if (!globalBridge) {
    globalBridge = new ServerBridge(options);
  }
  return globalBridge;
}

/**
 * Reset the global bridge (for testing)
 */
export function resetServerBridge(): void {
  globalBridge = null;
}

export default ServerBridge;
