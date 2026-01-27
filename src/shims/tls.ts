/**
 * tls shim - TLS/SSL is not available in browser
 * Provides stubs that allow code to load without crashing
 */

import { EventEmitter } from './events';
import * as net from './net';

export class TLSSocket extends EventEmitter {
  authorized = false;
  encrypted = true;

  constructor(_socket?: unknown, _options?: unknown) {
    super();
  }

  getPeerCertificate(_detailed?: boolean): object {
    return {};
  }

  getCipher(): { name: string; version: string } | null {
    return null;
  }

  getProtocol(): string | null {
    return null;
  }

  setServername(_name: string): void {}

  renegotiate(_options: unknown, _callback: (err: Error | null) => void): boolean {
    return false;
  }
}

export class Server extends EventEmitter {
  constructor(_options?: unknown, _connectionListener?: (socket: TLSSocket) => void) {
    super();
  }

  listen(..._args: unknown[]): this {
    return this;
  }

  close(_callback?: (err?: Error) => void): this {
    return this;
  }

  address(): { port: number; family: string; address: string } | string | null {
    return null;
  }

  getTicketKeys(): Buffer {
    return Buffer.from('');
  }

  setTicketKeys(_keys: Buffer): void {}

  setSecureContext(_options: unknown): void {}
}

export function createServer(_options?: unknown, _connectionListener?: (socket: TLSSocket) => void): Server {
  return new Server(_options, _connectionListener);
}

export function connect(_options: unknown, _callback?: () => void): TLSSocket {
  const socket = new TLSSocket();
  if (_callback) {
    setTimeout(_callback, 0);
  }
  return socket;
}

export const createSecureContext = (_options?: unknown) => ({});

export const getCiphers = () => ['TLS_AES_256_GCM_SHA384', 'TLS_AES_128_GCM_SHA256'];

export const DEFAULT_ECDH_CURVE = 'auto';
export const DEFAULT_MAX_VERSION = 'TLSv1.3';
export const DEFAULT_MIN_VERSION = 'TLSv1.2';

export const rootCertificates: string[] = [];

export default {
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
};
