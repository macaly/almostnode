/**
 * Node.js Stream shim
 * Basic Readable and Writable stream implementations
 */

import { EventEmitter } from './events';

export class Readable extends EventEmitter {
  private _buffer: Buffer[] = [];
  private _ended: boolean = false;
  private _flowing: boolean = false;
  readable: boolean = true;
  readableEnded: boolean = false;
  readableFlowing: boolean | null = null;

  constructor() {
    super();
  }

  push(chunk: Buffer | string | null): boolean {
    if (chunk === null) {
      this._ended = true;
      this.readableEnded = true;
      this.readable = false;
      queueMicrotask(() => this.emit('end'));
      return false;
    }

    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    this._buffer.push(buffer);

    if (this._flowing) {
      queueMicrotask(() => {
        while (this._buffer.length > 0 && this._flowing) {
          const data = this._buffer.shift();
          this.emit('data', data);
        }
      });
    }

    return true;
  }

  read(size?: number): Buffer | null {
    if (this._buffer.length === 0) {
      return null;
    }

    if (size === undefined) {
      const result = Buffer.concat(this._buffer);
      this._buffer = [];
      return result;
    }

    // Read specific size
    const chunks: Buffer[] = [];
    let remaining = size;

    while (remaining > 0 && this._buffer.length > 0) {
      const chunk = this._buffer[0];
      if (chunk.length <= remaining) {
        chunks.push(this._buffer.shift()!);
        remaining -= chunk.length;
      } else {
        chunks.push(chunk.slice(0, remaining));
        this._buffer[0] = chunk.slice(remaining);
        remaining = 0;
      }
    }

    return chunks.length > 0 ? Buffer.concat(chunks) : null;
  }

  resume(): this {
    this._flowing = true;
    this.readableFlowing = true;

    // Flush buffer
    while (this._buffer.length > 0 && this._flowing) {
      const data = this._buffer.shift();
      this.emit('data', data);
    }

    return this;
  }

  pause(): this {
    this._flowing = false;
    this.readableFlowing = false;
    return this;
  }

  pipe<T extends Writable>(destination: T): T {
    this.on('data', (chunk) => {
      destination.write(chunk);
    });

    this.on('end', () => {
      destination.end();
    });

    this.resume();
    return destination;
  }

  unpipe(destination?: Writable): this {
    this.removeAllListeners('data');
    this.removeAllListeners('end');
    return this;
  }

  setEncoding(encoding: string): this {
    // Simplified - just store encoding for reference
    return this;
  }

  destroy(error?: Error): this {
    this._buffer = [];
    this._ended = true;
    this.readable = false;
    if (error) {
      this.emit('error', error);
    }
    this.emit('close');
    return this;
  }
}

export class Writable extends EventEmitter {
  private _chunks: Buffer[] = [];
  private _ended: boolean = false;
  writable: boolean = true;
  writableEnded: boolean = false;
  writableFinished: boolean = false;

  constructor() {
    super();
  }

  write(
    chunk: Buffer | string,
    encodingOrCallback?: string | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    if (this._ended) {
      const error = new Error('write after end');
      if (typeof encodingOrCallback === 'function') {
        encodingOrCallback(error);
      } else if (callback) {
        callback(error);
      }
      return false;
    }

    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    this._chunks.push(buffer);

    const cb = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    if (cb) {
      queueMicrotask(() => cb(null));
    }

    return true;
  }

  end(
    chunkOrCallback?: Buffer | string | (() => void),
    encodingOrCallback?: string | (() => void),
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

    this._ended = true;
    this.writable = false;
    this.writableEnded = true;

    queueMicrotask(() => {
      this.writableFinished = true;
      this.emit('finish');
      if (callback) {
        callback();
      }
    });

    return this;
  }

  getBuffer(): Buffer {
    return Buffer.concat(this._chunks);
  }

  getBufferAsString(encoding: BufferEncoding = 'utf8'): string {
    return this.getBuffer().toString(encoding);
  }

  destroy(error?: Error): this {
    this._chunks = [];
    this._ended = true;
    this.writable = false;
    if (error) {
      this.emit('error', error);
    }
    this.emit('close');
    return this;
  }

  cork(): void {
    // No-op in this implementation
  }

  uncork(): void {
    // No-op in this implementation
  }

  setDefaultEncoding(encoding: string): this {
    return this;
  }
}

export class Duplex extends Readable {
  private _writeChunks: Buffer[] = [];
  private _writeEnded: boolean = false;
  writable: boolean = true;
  writableEnded: boolean = false;
  writableFinished: boolean = false;

  write(
    chunk: Buffer | string,
    encodingOrCallback?: string | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    if (this._writeEnded) {
      return false;
    }

    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    this._writeChunks.push(buffer);

    const cb = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    if (cb) {
      queueMicrotask(() => cb(null));
    }

    return true;
  }

  end(
    chunkOrCallback?: Buffer | string | (() => void),
    encodingOrCallback?: string | (() => void),
    callback?: () => void
  ): this {
    if (typeof chunkOrCallback === 'function') {
      callback = chunkOrCallback;
    } else if (chunkOrCallback !== undefined) {
      this.write(chunkOrCallback as Buffer | string);
    }

    this._writeEnded = true;
    this.writable = false;
    this.writableEnded = true;

    queueMicrotask(() => {
      this.writableFinished = true;
      this.emit('finish');
      if (callback) {
        callback();
      }
    });

    return this;
  }
}

export class PassThrough extends Duplex {
  constructor() {
    super();
  }

  write(
    chunk: Buffer | string,
    encodingOrCallback?: string | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    // Pass through to readable side
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    this.push(buffer);

    const cb = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    if (cb) {
      queueMicrotask(() => cb(null));
    }

    return true;
  }
}

export class Transform extends Duplex {
  constructor() {
    super();
  }

  _transform(
    chunk: Buffer,
    encoding: string,
    callback: (error?: Error | null, data?: Buffer) => void
  ): void {
    // Default: pass through
    callback(null, chunk);
  }

  _flush(callback: (error?: Error | null, data?: Buffer) => void): void {
    callback(null);
  }

  write(
    chunk: Buffer | string,
    encodingOrCallback?: string | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : 'utf8';
    const cb = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;

    this._transform(buffer, encoding, (error, data) => {
      if (error) {
        if (cb) cb(error);
        return;
      }
      if (data) {
        this.push(data);
      }
      if (cb) cb(null);
    });

    return true;
  }

  end(
    chunkOrCallback?: Buffer | string | (() => void),
    encodingOrCallback?: string | (() => void),
    callback?: () => void
  ): this {
    // Flush before ending
    this._flush((error, data) => {
      if (data) {
        this.push(data);
      }
    });

    return super.end(chunkOrCallback, encodingOrCallback, callback);
  }
}

// Base Stream class that some code extends
export class Stream extends EventEmitter {
  pipe<T extends Writable>(destination: T): T {
    return destination;
  }
}

// Make Stream also have static references to all stream types
(Stream as unknown as Record<string, unknown>).Readable = Readable;
(Stream as unknown as Record<string, unknown>).Writable = Writable;
(Stream as unknown as Record<string, unknown>).Duplex = Duplex;
(Stream as unknown as Record<string, unknown>).Transform = Transform;
(Stream as unknown as Record<string, unknown>).PassThrough = PassThrough;

// Promises API
export const promises = {
  pipeline: async (...streams: unknown[]): Promise<void> => {
    // Simplified pipeline
    return Promise.resolve();
  },
  finished: async (stream: unknown): Promise<void> => {
    return Promise.resolve();
  },
};

export function pipeline(...args: unknown[]): unknown {
  const callback = args[args.length - 1];
  if (typeof callback === 'function') {
    setTimeout(() => (callback as () => void)(), 0);
  }
  return args[args.length - 2] || args[0];
}

export function finished(stream: unknown, callback: (err?: Error) => void): () => void {
  setTimeout(() => callback(), 0);
  return () => {};
}

// Simple Buffer polyfill for browser
declare global {
  interface Window {
    Buffer: typeof Buffer;
  }
}

class BufferPolyfill extends Uint8Array {
  static from(data: string | ArrayBuffer | Uint8Array, encoding?: string): BufferPolyfill {
    if (typeof data === 'string') {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(data);
      return new BufferPolyfill(bytes);
    }
    if (data instanceof ArrayBuffer) {
      return new BufferPolyfill(data);
    }
    return new BufferPolyfill(data);
  }

  static alloc(size: number, fill?: number): BufferPolyfill {
    const buffer = new BufferPolyfill(size);
    if (fill !== undefined) {
      buffer.fill(fill);
    }
    return buffer;
  }

  static allocUnsafe(size: number): BufferPolyfill {
    return new BufferPolyfill(size);
  }

  static allocUnsafeSlow(size: number): BufferPolyfill {
    return new BufferPolyfill(size);
  }

  static concat(buffers: (Uint8Array | BufferPolyfill)[]): BufferPolyfill {
    const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
    const result = new BufferPolyfill(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      result.set(buf, offset);
      offset += buf.length;
    }
    return result;
  }

  static isBuffer(obj: unknown): obj is BufferPolyfill {
    return obj instanceof BufferPolyfill || obj instanceof Uint8Array;
  }

  static isEncoding(encoding: string): boolean {
    return ['utf8', 'utf-8', 'ascii', 'latin1', 'binary', 'base64', 'hex'].includes(encoding.toLowerCase());
  }

  static byteLength(string: string, encoding?: string): number {
    return new TextEncoder().encode(string).length;
  }

  toString(encoding: BufferEncoding = 'utf8'): string {
    const decoder = new TextDecoder(encoding === 'utf8' ? 'utf-8' : encoding);
    return decoder.decode(this);
  }

  slice(start?: number, end?: number): BufferPolyfill {
    return new BufferPolyfill(super.slice(start, end));
  }

  subarray(start?: number, end?: number): BufferPolyfill {
    return new BufferPolyfill(super.subarray(start, end));
  }

  write(string: string, offset?: number): number {
    const bytes = new TextEncoder().encode(string);
    this.set(bytes, offset || 0);
    return bytes.length;
  }

  copy(target: BufferPolyfill, targetStart?: number, sourceStart?: number, sourceEnd?: number): number {
    const src = this.subarray(sourceStart || 0, sourceEnd);
    target.set(src, targetStart || 0);
    return src.length;
  }

  compare(otherBuffer: Uint8Array): number {
    const len = Math.min(this.length, otherBuffer.length);
    for (let i = 0; i < len; i++) {
      if (this[i] < otherBuffer[i]) return -1;
      if (this[i] > otherBuffer[i]) return 1;
    }
    if (this.length < otherBuffer.length) return -1;
    if (this.length > otherBuffer.length) return 1;
    return 0;
  }

  equals(otherBuffer: Uint8Array): boolean {
    return this.compare(otherBuffer) === 0;
  }

  toJSON(): { type: string; data: number[] } {
    return {
      type: 'Buffer',
      data: Array.from(this)
    };
  }

  // Add Object prototype methods that TypedArrays don't have directly
  hasOwnProperty(prop: PropertyKey): boolean {
    return Object.prototype.hasOwnProperty.call(this, prop);
  }

  readUInt8(offset: number): number {
    return this[offset];
  }

  readUInt16BE(offset: number): number {
    return (this[offset] << 8) | this[offset + 1];
  }

  readUInt16LE(offset: number): number {
    return this[offset] | (this[offset + 1] << 8);
  }

  readUInt32BE(offset: number): number {
    return (this[offset] << 24) | (this[offset + 1] << 16) | (this[offset + 2] << 8) | this[offset + 3];
  }

  readUInt32LE(offset: number): number {
    return this[offset] | (this[offset + 1] << 8) | (this[offset + 2] << 16) | (this[offset + 3] << 24);
  }

  writeUInt8(value: number, offset: number): number {
    this[offset] = value & 0xff;
    return offset + 1;
  }

  writeUInt16BE(value: number, offset: number): number {
    this[offset] = (value >> 8) & 0xff;
    this[offset + 1] = value & 0xff;
    return offset + 2;
  }

  writeUInt16LE(value: number, offset: number): number {
    this[offset] = value & 0xff;
    this[offset + 1] = (value >> 8) & 0xff;
    return offset + 2;
  }

  writeUInt32BE(value: number, offset: number): number {
    this[offset] = (value >> 24) & 0xff;
    this[offset + 1] = (value >> 16) & 0xff;
    this[offset + 2] = (value >> 8) & 0xff;
    this[offset + 3] = value & 0xff;
    return offset + 4;
  }

  writeUInt32LE(value: number, offset: number): number {
    this[offset] = value & 0xff;
    this[offset + 1] = (value >> 8) & 0xff;
    this[offset + 2] = (value >> 16) & 0xff;
    this[offset + 3] = (value >> 24) & 0xff;
    return offset + 4;
  }
}

// Set global Buffer if not defined
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as unknown as { Buffer: typeof BufferPolyfill }).Buffer = BufferPolyfill as unknown as typeof Buffer;
}

export { BufferPolyfill as Buffer };

export default {
  Stream,
  Readable,
  Writable,
  Duplex,
  Transform,
  PassThrough,
  pipeline,
  finished,
  promises,
};
