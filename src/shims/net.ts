/**
 * Node.js net module shim
 * Basic Socket and Server classes for virtual networking
 */

import { EventEmitter } from './events';
import { Duplex, Buffer } from './stream';

export interface AddressInfo {
  address: string;
  family: string;
  port: number;
}

export interface SocketOptions {
  allowHalfOpen?: boolean;
  readable?: boolean;
  writable?: boolean;
}

export interface ServerOptions {
  allowHalfOpen?: boolean;
  pauseOnConnect?: boolean;
}

export interface ListenOptions {
  port?: number;
  host?: string;
  backlog?: number;
}

/**
 * Virtual Socket implementation
 */
export class Socket extends Duplex {
  private _connecting: boolean = false;
  private _connected: boolean = false;
  private _destroyed: boolean = false;
  private _remoteAddress: string = '';
  private _remotePort: number = 0;
  private _localAddress: string = '127.0.0.1';
  private _localPort: number = 0;

  localAddress: string = '127.0.0.1';
  localPort: number = 0;
  remoteAddress?: string;
  remotePort?: number;
  remoteFamily?: string;
  connecting: boolean = false;
  destroyed: boolean = false;
  readyState: string = 'closed';

  constructor(options?: SocketOptions) {
    super();
  }

  connect(
    portOrOptions: number | { port: number; host?: string },
    hostOrCallback?: string | (() => void),
    callback?: () => void
  ): this {
    let port: number;
    let host: string = '127.0.0.1';
    let cb: (() => void) | undefined;

    if (typeof portOrOptions === 'number') {
      port = portOrOptions;
      if (typeof hostOrCallback === 'string') {
        host = hostOrCallback;
        cb = callback;
      } else {
        cb = hostOrCallback;
      }
    } else {
      port = portOrOptions.port;
      host = portOrOptions.host || '127.0.0.1';
      cb = typeof hostOrCallback === 'function' ? hostOrCallback : callback;
    }

    this._connecting = true;
    this.connecting = true;
    this._remoteAddress = host;
    this._remotePort = port;
    this.remoteAddress = host;
    this.remotePort = port;
    this.remoteFamily = 'IPv4';
    this.readyState = 'opening';

    // Simulate async connection
    queueMicrotask(() => {
      this._connecting = false;
      this._connected = true;
      this.connecting = false;
      this.readyState = 'open';
      this.emit('connect');
      if (cb) cb();
    });

    return this;
  }

  address(): AddressInfo | null {
    if (!this._connected) return null;
    return {
      address: this._localAddress,
      family: 'IPv4',
      port: this._localPort,
    };
  }

  setEncoding(encoding: BufferEncoding): this {
    return this;
  }

  setTimeout(timeout: number, callback?: () => void): this {
    if (callback) {
      this.once('timeout', callback);
    }
    return this;
  }

  setNoDelay(noDelay?: boolean): this {
    return this;
  }

  setKeepAlive(enable?: boolean, initialDelay?: number): this {
    return this;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  destroy(error?: Error): this {
    if (this._destroyed) return this;

    this._destroyed = true;
    this._connected = false;
    this.destroyed = true;
    this.readyState = 'closed';

    if (error) {
      this.emit('error', error);
    }

    queueMicrotask(() => {
      this.emit('close', !!error);
    });

    return this;
  }

  // Internal: simulate receiving data from remote
  _receiveData(data: Buffer | string): void {
    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    this.push(buffer);
  }

  // Internal: signal end of remote data
  _receiveEnd(): void {
    this.push(null);
  }
}

/**
 * Virtual Server implementation
 */
export class Server extends EventEmitter {
  private _listening: boolean = false;
  private _address: AddressInfo | null = null;
  private _connections: Set<Socket> = new Set();
  private _maxConnections: number = Infinity;

  listening: boolean = false;
  maxConnections?: number;

  constructor(
    optionsOrConnectionListener?: ServerOptions | ((socket: Socket) => void),
    connectionListener?: (socket: Socket) => void
  ) {
    super();

    let listener: ((socket: Socket) => void) | undefined;

    if (typeof optionsOrConnectionListener === 'function') {
      listener = optionsOrConnectionListener;
    } else {
      listener = connectionListener;
    }

    if (listener) {
      this.on('connection', listener);
    }
  }

  listen(
    portOrOptions?: number | ListenOptions,
    hostOrCallback?: string | number | (() => void),
    backlogOrCallback?: number | (() => void),
    callback?: () => void
  ): this {
    let port: number = 0;
    let host: string = '0.0.0.0';
    let cb: (() => void) | undefined;

    if (typeof portOrOptions === 'number') {
      port = portOrOptions;

      if (typeof hostOrCallback === 'string') {
        host = hostOrCallback;
        if (typeof backlogOrCallback === 'function') {
          cb = backlogOrCallback;
        } else {
          cb = callback;
        }
      } else if (typeof hostOrCallback === 'function') {
        cb = hostOrCallback;
      } else if (typeof hostOrCallback === 'number') {
        // backlog
        cb = typeof backlogOrCallback === 'function' ? backlogOrCallback : callback;
      } else {
        // hostOrCallback is undefined, check if callback is in third position
        if (typeof backlogOrCallback === 'function') {
          cb = backlogOrCallback;
        } else if (typeof callback === 'function') {
          cb = callback;
        }
      }
    } else if (portOrOptions) {
      port = portOrOptions.port || 0;
      host = portOrOptions.host || '0.0.0.0';
      cb = typeof hostOrCallback === 'function' ? hostOrCallback : callback;
    }

    // Assign random port if 0
    if (port === 0) {
      port = 3000 + Math.floor(Math.random() * 1000);
    }

    this._address = {
      address: host,
      family: 'IPv4',
      port,
    };

    this._listening = true;
    this.listening = true;

    queueMicrotask(() => {
      this.emit('listening');
      if (cb) cb();
    });

    return this;
  }

  address(): AddressInfo | null {
    return this._address;
  }

  close(callback?: (err?: Error) => void): this {
    this._listening = false;
    this.listening = false;

    // Close all connections
    for (const socket of this._connections) {
      socket.destroy();
    }
    this._connections.clear();

    queueMicrotask(() => {
      this.emit('close');
      if (callback) callback();
    });

    return this;
  }

  getConnections(callback: (err: Error | null, count: number) => void): void {
    callback(null, this._connections.size);
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  // Internal: handle incoming connection
  _handleConnection(socket: Socket): void {
    if (!this._listening) {
      socket.destroy();
      return;
    }

    this._connections.add(socket);

    socket.on('close', () => {
      this._connections.delete(socket);
    });

    this.emit('connection', socket);
  }
}

export function createServer(
  optionsOrConnectionListener?: ServerOptions | ((socket: Socket) => void),
  connectionListener?: (socket: Socket) => void
): Server {
  return new Server(optionsOrConnectionListener, connectionListener);
}

export function createConnection(
  portOrOptions: number | { port: number; host?: string },
  hostOrCallback?: string | (() => void),
  callback?: () => void
): Socket {
  const socket = new Socket();
  return socket.connect(portOrOptions, hostOrCallback as string, callback);
}

export const connect = createConnection;

export function isIP(input: string): number {
  // Simple IPv4 check
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(input)) {
    return 4;
  }
  // Simple IPv6 check
  if (/^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(input)) {
    return 6;
  }
  return 0;
}

export function isIPv4(input: string): boolean {
  return isIP(input) === 4;
}

export function isIPv6(input: string): boolean {
  return isIP(input) === 6;
}

export default {
  Socket,
  Server,
  createServer,
  createConnection,
  connect,
  isIP,
  isIPv4,
  isIPv6,
};
