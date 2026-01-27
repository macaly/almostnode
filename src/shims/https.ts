/**
 * Node.js https module shim
 * Re-exports http module functionality with https protocol default
 */

import {
  Server,
  IncomingMessage,
  ServerResponse,
  ClientRequest,
  createServer,
  STATUS_CODES,
  METHODS,
  getServer,
  getAllServers,
  setServerListenCallback,
  setServerCloseCallback,
  _createClientRequest,
} from './http';

import type { RequestOptions } from './http';

// Re-export all http types and classes
export {
  Server,
  IncomingMessage,
  ServerResponse,
  ClientRequest,
  createServer,
  STATUS_CODES,
  METHODS,
  getServer,
  getAllServers,
  setServerListenCallback,
  setServerCloseCallback,
};

export type { RequestOptions };

/**
 * Create an HTTPS client request
 */
export function request(
  urlOrOptions: string | URL | RequestOptions,
  optionsOrCallback?: RequestOptions | ((res: IncomingMessage) => void),
  callback?: (res: IncomingMessage) => void
): ClientRequest {
  return _createClientRequest(urlOrOptions, optionsOrCallback, callback, 'https');
}

/**
 * Make an HTTPS GET request
 */
export function get(
  urlOrOptions: string | URL | RequestOptions,
  optionsOrCallback?: RequestOptions | ((res: IncomingMessage) => void),
  callback?: (res: IncomingMessage) => void
): ClientRequest {
  const req = _createClientRequest(urlOrOptions, optionsOrCallback, callback, 'https');
  req.end();
  return req;
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
