/**
 * http2 shim - HTTP/2 is not available in browser
 */

import { EventEmitter } from './events';

export class Http2Session extends EventEmitter {
  close(_callback?: () => void): void {
    if (_callback) setTimeout(_callback, 0);
  }
  destroy(_error?: Error, _code?: number): void {}
  get destroyed(): boolean { return false; }
  get encrypted(): boolean { return false; }
  get closed(): boolean { return false; }
  ping(_callback: (err: Error | null, duration: number, payload: Buffer) => void): boolean {
    return false;
  }
  ref(): void {}
  unref(): void {}
  setTimeout(_msecs: number, _callback?: () => void): void {}
}

export class ClientHttp2Session extends Http2Session {}
export class ServerHttp2Session extends Http2Session {}

export class Http2Stream extends EventEmitter {
  close(_code?: number, _callback?: () => void): void {}
  get id(): number { return 0; }
  get pending(): boolean { return false; }
  get destroyed(): boolean { return false; }
  get closed(): boolean { return false; }
  priority(_options: unknown): void {}
  setTimeout(_msecs: number, _callback?: () => void): void {}
  end(_data?: unknown, _encoding?: string, _callback?: () => void): void {}
}

export class Http2ServerRequest extends EventEmitter {}
export class Http2ServerResponse extends EventEmitter {
  writeHead(_statusCode: number, _headers?: object): this { return this; }
  end(_data?: unknown): void {}
}

export function createServer(_options?: unknown, _onRequestHandler?: unknown): EventEmitter {
  return new EventEmitter();
}

export function createSecureServer(_options?: unknown, _onRequestHandler?: unknown): EventEmitter {
  return new EventEmitter();
}

export function connect(_authority: string, _options?: unknown, _listener?: () => void): ClientHttp2Session {
  return new ClientHttp2Session();
}

export const constants = {
  NGHTTP2_SESSION_SERVER: 0,
  NGHTTP2_SESSION_CLIENT: 1,
  HTTP2_HEADER_STATUS: ':status',
  HTTP2_HEADER_METHOD: ':method',
  HTTP2_HEADER_AUTHORITY: ':authority',
  HTTP2_HEADER_SCHEME: ':scheme',
  HTTP2_HEADER_PATH: ':path',
  HTTP_STATUS_OK: 200,
  HTTP_STATUS_NOT_FOUND: 404,
};

export function getDefaultSettings(): object {
  return {};
}

export function getPackedSettings(_settings?: object): Buffer {
  return Buffer.from('');
}

export function getUnpackedSettings(_buf: Buffer): object {
  return {};
}

export const sensitiveHeaders = Symbol('sensitiveHeaders');

export default {
  Http2Session,
  ClientHttp2Session,
  ServerHttp2Session,
  Http2Stream,
  Http2ServerRequest,
  Http2ServerResponse,
  createServer,
  createSecureServer,
  connect,
  constants,
  getDefaultSettings,
  getPackedSettings,
  getUnpackedSettings,
  sensitiveHeaders,
};
