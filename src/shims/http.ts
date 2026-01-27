/**
 * Node.js http module shim
 * Provides IncomingMessage, ServerResponse, and Server for virtual HTTP handling
 */

import { EventEmitter } from './events';
import { Readable, Writable, Buffer } from './stream';
import { Socket, Server as NetServer, AddressInfo } from './net';

export type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

export interface RequestOptions {
  method?: string;
  path?: string;
  headers?: Record<string, string | string[]>;
  hostname?: string;
  port?: number;
}

/**
 * Incoming HTTP request (Node.js compatible)
 */
export class IncomingMessage extends Readable {
  httpVersion: string = '1.1';
  httpVersionMajor: number = 1;
  httpVersionMinor: number = 1;
  complete: boolean = false;
  headers: Record<string, string | string[] | undefined> = {};
  rawHeaders: string[] = [];
  trailers: Record<string, string | undefined> = {};
  rawTrailers: string[] = [];
  method?: string;
  url?: string;
  statusCode?: number;
  statusMessage?: string;
  socket: Socket;

  private _body: Buffer | null = null;

  constructor(socket?: Socket) {
    super();
    this.socket = socket || new Socket();
  }

  setTimeout(msecs: number, callback?: () => void): this {
    if (callback) {
      this.once('timeout', callback);
    }
    return this;
  }

  destroy(error?: Error): this {
    super.destroy(error);
    return this;
  }

  // Internal: set body data
  _setBody(body: Buffer | string | null): void {
    if (body === null) {
      this._body = null;
    } else {
      this._body = typeof body === 'string' ? Buffer.from(body) : body;
    }

    if (this._body) {
      this.push(this._body);
    }
    this.push(null);
    this.complete = true;
  }

  // Internal: initialize from raw request
  static fromRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: Buffer | string
  ): IncomingMessage {
    const msg = new IncomingMessage();
    msg.method = method;
    msg.url = url;
    msg.headers = { ...headers };

    // Build raw headers
    for (const [key, value] of Object.entries(headers)) {
      msg.rawHeaders.push(key, value);
    }

    if (body) {
      msg._setBody(body);
    } else {
      msg.push(null);
      msg.complete = true;
    }

    return msg;
  }
}

/**
 * Outgoing HTTP response (Node.js compatible)
 */
export class ServerResponse extends Writable {
  statusCode: number = 200;
  statusMessage: string = 'OK';
  headersSent: boolean = false;
  finished: boolean = false;
  sendDate: boolean = true;
  socket: Socket | null;

  private _headers: Map<string, string | string[]> = new Map();
  private _body: Buffer[] = [];
  private _resolve?: (response: ResponseData) => void;

  constructor(req: IncomingMessage) {
    super();
    this.socket = req.socket;
  }

  // Internal: set resolver for async response handling
  _setResolver(resolve: (response: ResponseData) => void): void {
    this._resolve = resolve;
  }

  setHeader(name: string, value: string | string[] | number): this {
    if (this.headersSent) {
      throw new Error('Cannot set headers after they are sent');
    }
    this._headers.set(name.toLowerCase(), String(value));
    return this;
  }

  getHeader(name: string): string | string[] | undefined {
    return this._headers.get(name.toLowerCase());
  }

  getHeaders(): Record<string, string | string[]> {
    const headers: Record<string, string | string[]> = {};
    for (const [key, value] of this._headers) {
      headers[key] = value;
    }
    return headers;
  }

  getHeaderNames(): string[] {
    return [...this._headers.keys()];
  }

  hasHeader(name: string): boolean {
    return this._headers.has(name.toLowerCase());
  }

  removeHeader(name: string): void {
    if (this.headersSent) {
      throw new Error('Cannot remove headers after they are sent');
    }
    this._headers.delete(name.toLowerCase());
  }

  writeHead(
    statusCode: number,
    statusMessageOrHeaders?: string | Record<string, string | string[] | number>,
    headers?: Record<string, string | string[] | number>
  ): this {
    this.statusCode = statusCode;

    if (typeof statusMessageOrHeaders === 'string') {
      this.statusMessage = statusMessageOrHeaders;
      if (headers) {
        for (const [key, value] of Object.entries(headers)) {
          this.setHeader(key, value);
        }
      }
    } else if (statusMessageOrHeaders) {
      for (const [key, value] of Object.entries(statusMessageOrHeaders)) {
        this.setHeader(key, value);
      }
    }

    return this;
  }

  write(
    chunk: Buffer | string,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    this.headersSent = true;
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    this._body.push(buffer);

    const cb = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    if (cb) {
      queueMicrotask(() => cb(null));
    }

    return true;
  }

  end(
    chunkOrCallback?: Buffer | string | (() => void),
    encodingOrCallback?: BufferEncoding | (() => void),
    callback?: () => void
  ): this {
    if (typeof chunkOrCallback === 'function') {
      callback = chunkOrCallback;
    } else if (chunkOrCallback !== undefined) {
      this.write(chunkOrCallback as Buffer | string);
    }

    if (typeof encodingOrCallback === 'function') {
      callback = encodingOrCallback;
    }

    this.headersSent = true;
    this.finished = true;

    // Resolve with response data
    if (this._resolve) {
      const headers: Record<string, string> = {};
      for (const [key, value] of this._headers) {
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }

      this._resolve({
        statusCode: this.statusCode,
        statusMessage: this.statusMessage,
        headers,
        body: Buffer.concat(this._body),
      });
    }

    queueMicrotask(() => {
      this.emit('finish');
      if (callback) callback();
    });

    return this;
  }

  // Convenience method for simple responses
  send(data: string | Buffer | object): this {
    if (typeof data === 'object' && !Buffer.isBuffer(data)) {
      this.setHeader('Content-Type', 'application/json');
      data = JSON.stringify(data);
    }

    if (!this.hasHeader('Content-Type')) {
      this.setHeader('Content-Type', 'text/html');
    }

    this.write(typeof data === 'string' ? data : data);
    return this.end();
  }

  // Express compatibility
  json(data: unknown): this {
    this.setHeader('Content-Type', 'application/json');
    return this.end(JSON.stringify(data));
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  redirect(urlOrStatus: string | number, url?: string): void {
    if (typeof urlOrStatus === 'number') {
      this.statusCode = urlOrStatus;
      this.setHeader('Location', url!);
    } else {
      this.statusCode = 302;
      this.setHeader('Location', urlOrStatus);
    }
    this.end();
  }

  // Get body for testing/debugging
  _getBody(): Buffer {
    return Buffer.concat(this._body);
  }

  _getBodyAsString(): string {
    return this._getBody().toString('utf8');
  }
}

export interface ResponseData {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  body: Buffer;
}

/**
 * HTTP Server (Node.js compatible)
 */
export class Server extends EventEmitter {
  private _netServer: NetServer;
  private _requestListener?: RequestListener;
  private _pendingRequests: Map<string, {
    resolve: (response: ResponseData) => void;
    reject: (error: Error) => void;
  }> = new Map();

  listening: boolean = false;
  maxHeadersCount: number | null = null;
  timeout: number = 0;
  keepAliveTimeout: number = 5000;
  headersTimeout: number = 60000;
  requestTimeout: number = 0;

  constructor(requestListener?: RequestListener) {
    super();
    this._requestListener = requestListener;
    this._netServer = new NetServer();

    this._netServer.on('listening', () => {
      this.listening = true;
      this.emit('listening');
    });

    this._netServer.on('close', () => {
      this.listening = false;
      this.emit('close');
    });

    this._netServer.on('error', (err) => {
      this.emit('error', err);
    });
  }

  listen(
    portOrOptions?: number | { port?: number; host?: string },
    hostOrCallback?: string | (() => void),
    callback?: () => void
  ): this {
    let port: number | undefined;
    let host: string | undefined;
    let cb: (() => void) | undefined;

    if (typeof portOrOptions === 'number') {
      port = portOrOptions;
      if (typeof hostOrCallback === 'string') {
        host = hostOrCallback;
        cb = callback;
      } else {
        cb = hostOrCallback;
      }
    } else if (portOrOptions) {
      port = portOrOptions.port;
      host = portOrOptions.host;
      cb = typeof hostOrCallback === 'function' ? hostOrCallback : callback;
    }

    // Wrap callback to register server after listening
    const originalCb = cb;
    const self = this;
    cb = function() {
      const addr = self._netServer.address();
      if (addr) {
        _registerServer(addr.port, self);
      }
      if (originalCb) originalCb();
    };

    this._netServer.listen(port, host, cb);

    return this;
  }

  close(callback?: (err?: Error) => void): this {
    const addr = this._netServer.address();
    if (addr) {
      _unregisterServer(addr.port);
    }
    this._netServer.close(callback);
    return this;
  }

  address(): AddressInfo | null {
    return this._netServer.address();
  }

  setTimeout(msecs?: number, callback?: () => void): this {
    this.timeout = msecs || 0;
    if (callback) {
      this.on('timeout', callback);
    }
    return this;
  }

  ref(): this {
    this._netServer.ref();
    return this;
  }

  unref(): this {
    this._netServer.unref();
    return this;
  }

  /**
   * Handle an incoming request (used by server bridge)
   */
  async handleRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: Buffer | string
  ): Promise<ResponseData> {
    return new Promise((resolve, reject) => {
      const req = IncomingMessage.fromRequest(method, url, headers, body);
      const res = new ServerResponse(req);

      res._setResolver(resolve);

      // Set timeout
      const timeoutId = this.timeout
        ? setTimeout(() => {
            reject(new Error('Request timeout'));
          }, this.timeout)
        : null;

      res.on('finish', () => {
        if (timeoutId) clearTimeout(timeoutId);
      });

      try {
        this.emit('request', req, res);

        if (this._requestListener) {
          this._requestListener(req, res);
        }
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        reject(error);
      }
    });
  }
}

/**
 * Create an HTTP server
 */
export function createServer(requestListener?: RequestListener): Server {
  return new Server(requestListener);
}

/**
 * HTTP status codes
 */
export const STATUS_CODES: Record<number, string> = {
  100: 'Continue',
  101: 'Switching Protocols',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/**
 * HTTP methods
 */
export const METHODS = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'HEAD',
  'OPTIONS',
  'CONNECT',
  'TRACE',
];

// Client request (simplified)
export class ClientRequest extends Writable {
  method: string;
  path: string;
  headers: Record<string, string>;

  constructor(options: RequestOptions) {
    super();
    this.method = options.method || 'GET';
    this.path = options.path || '/';
    this.headers = {};

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        this.headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }
  }

  setHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }

  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }
}

export function request(
  options: RequestOptions,
  callback?: (res: IncomingMessage) => void
): ClientRequest {
  const req = new ClientRequest(options);
  if (callback) {
    req.once('response', callback);
  }
  return req;
}

export function get(
  options: RequestOptions,
  callback?: (res: IncomingMessage) => void
): ClientRequest {
  const req = request({ ...options, method: 'GET' }, callback);
  req.end();
  return req;
}

/**
 * Server registry for tracking listening servers
 * Used by server bridge to route requests
 */
export type ServerRegistryCallback = (port: number, server: Server) => void;

const serverRegistry = new Map<number, Server>();
let onServerListenCallback: ServerRegistryCallback | null = null;
let onServerCloseCallback: ((port: number) => void) | null = null;

export function _registerServer(port: number, server: Server): void {
  serverRegistry.set(port, server);
  if (onServerListenCallback) {
    onServerListenCallback(port, server);
  }
}

export function _unregisterServer(port: number): void {
  serverRegistry.delete(port);
  if (onServerCloseCallback) {
    onServerCloseCallback(port);
  }
}

export function getServer(port: number): Server | undefined {
  return serverRegistry.get(port);
}

export function getAllServers(): Map<number, Server> {
  return new Map(serverRegistry);
}

export function setServerListenCallback(callback: ServerRegistryCallback | null): void {
  onServerListenCallback = callback;
}

export function setServerCloseCallback(callback: ((port: number) => void) | null): void {
  onServerCloseCallback = callback;
}

export default {
  Server,
  IncomingMessage,
  ServerResponse,
  ClientRequest,
  createServer,
  request,
  get,
  STATUS_CODES,
  METHODS,
  getServer,
  getAllServers,
  setServerListenCallback,
  setServerCloseCallback,
};
