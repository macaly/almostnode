/**
 * dgram shim - UDP sockets are not available in browser
 */

import { EventEmitter } from './events';

export class Socket extends EventEmitter {
  bind(_port?: number, _address?: string, _callback?: () => void): this {
    if (_callback) setTimeout(_callback, 0);
    return this;
  }

  close(_callback?: () => void): void {
    if (_callback) setTimeout(_callback, 0);
  }

  send(_msg: Buffer | string, _offset?: number, _length?: number, _port?: number, _address?: string, _callback?: (error: Error | null, bytes: number) => void): void {
    if (_callback) setTimeout(() => _callback(null, 0), 0);
  }

  address(): { address: string; family: string; port: number } {
    return { address: '0.0.0.0', family: 'IPv4', port: 0 };
  }

  setBroadcast(_flag: boolean): void {}
  setTTL(_ttl: number): number { return _ttl; }
  setMulticastTTL(_ttl: number): number { return _ttl; }
  setMulticastLoopback(_flag: boolean): boolean { return _flag; }
  setMulticastInterface(_multicastInterface: string): void {}
  addMembership(_multicastAddress: string, _multicastInterface?: string): void {}
  dropMembership(_multicastAddress: string, _multicastInterface?: string): void {}
  ref(): this { return this; }
  unref(): this { return this; }
  setRecvBufferSize(_size: number): void {}
  setSendBufferSize(_size: number): void {}
  getRecvBufferSize(): number { return 0; }
  getSendBufferSize(): number { return 0; }
}

export function createSocket(_type: string | object, _callback?: (msg: Buffer, rinfo: object) => void): Socket {
  return new Socket();
}

export default {
  Socket,
  createSocket,
};
