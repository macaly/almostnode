/**
 * Node.js Stream shim
 * Basic Readable and Writable stream implementations
 */

import { EventEmitter } from './events';
import { uint8ToBase64, uint8ToHex, uint8ToBinaryString } from '../utils/binary-encoding';

const _encoder = new TextEncoder();
const _decoder = new TextDecoder('utf-8');

export class Readable extends EventEmitter {
  private _buffer: Uint8Array[] = [];
  private _ended: boolean = false;
  private _flowing: boolean = false;
  private _endEmitted: boolean = false;
  readable: boolean = true;
  readableEnded: boolean = false;
  readableFlowing: boolean | null = null;

  constructor() {
    super();
  }

  // Internal method to add listener without triggering auto-flow
  private _addListenerInternal(event: string | symbol, listener: (...args: unknown[]) => void): this {
    // Call base EventEmitter's addListener directly
    EventEmitter.prototype.addListener.call(this, event as string, listener);
    return this;
  }

  // Override on() to auto-flow when 'data' listener is added
  on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    this._addListenerInternal(event, listener);

    // In Node.js, adding a 'data' listener puts the stream into flowing mode
    // We need to resume even if ended, because we need to flush buffered data
    if (event === 'data' && !this._flowing) {
      // Use queueMicrotask to allow all listeners to be added first
      queueMicrotask(() => {
        if (this.listenerCount('data') > 0 && !this._flowing) {
          this.resume();
        }
      });
    }

    return this;
  }

  // Also handle addListener (alias for on)
  addListener(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return this.on(event, listener);
  }

  push(chunk: Uint8Array | string | null): boolean {
    if (chunk === null) {
      this._ended = true;
      this.readableEnded = true;
      this.readable = false;
      // Only emit 'end' immediately if already flowing and buffer is empty
      // Otherwise, 'end' will be emitted when resume() flushes the buffer
      if (this._flowing && this._buffer.length === 0 && !this._endEmitted) {
        this._endEmitted = true;
        queueMicrotask(() => this.emit('end'));
      }
      return false;
    }

    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    this._buffer.push(buffer);

    if (this._flowing) {
      queueMicrotask(() => {
        this._flushBuffer();
      });
    }

    return true;
  }

  private _flushBuffer(): void {
    while (this._buffer.length > 0 && this._flowing) {
      const data = this._buffer.shift();
      this.emit('data', data);
    }
    // Emit 'end' after buffer is flushed if stream has ended
    if (this._ended && this._buffer.length === 0 && !this._endEmitted) {
      this._endEmitted = true;
      this.emit('end');
    }
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
    const chunks: Uint8Array[] = [];
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

    return chunks.length > 0 ? Buffer.concat(chunks as BufferPolyfill[]) : null;
  }

  resume(): this {
    this._flowing = true;
    this.readableFlowing = true;

    // Flush buffer and emit 'end' if needed
    this._flushBuffer();

    return this;
  }

  pause(): this {
    this._flowing = false;
    this.readableFlowing = false;
    return this;
  }

  pipe<T extends Writable | Duplex>(destination: T): T {
    this.on('data', (chunk: unknown) => {
      (destination as Writable).write(chunk as Uint8Array | string);
    });

    this.on('end', () => {
      (destination as Writable).end();
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

  /**
   * Creates a Readable stream from an iterable or async iterable
   * @param iterable - An iterable or async iterable to create the stream from
   * @param options - Optional stream options
   */
  static from(
    iterable: Iterable<unknown> | AsyncIterable<unknown>,
    options?: { objectMode?: boolean; highWaterMark?: number }
  ): Readable {
    const readable = new Readable();

    // Handle async iteration
    (async () => {
      try {
        // Use for-await-of which works with both sync and async iterables
        for await (const chunk of iterable as AsyncIterable<unknown>) {
          if (chunk !== null && chunk !== undefined) {
            // Convert to Buffer if it's a string
            const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
            readable.push(data as Buffer);
          }
        }
        readable.push(null); // Signal end of stream
      } catch (err) {
        readable.destroy(err as Error);
      }
    })();

    return readable;
  }
}

export class Writable extends EventEmitter {
  private _chunks: Uint8Array[] = [];
  private _ended: boolean = false;
  writable: boolean = true;
  writableEnded: boolean = false;
  writableFinished: boolean = false;

  constructor() {
    super();
  }

  write(
    chunk: Uint8Array | string,
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
    chunkOrCallback?: Uint8Array | string | (() => void),
    encodingOrCallback?: string | (() => void),
    callback?: () => void
  ): this {
    if (typeof chunkOrCallback === 'function') {
      callback = chunkOrCallback;
    } else if (chunkOrCallback !== undefined) {
      this.write(chunkOrCallback as Uint8Array | string);
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
    chunk: Buffer | Uint8Array,
    encoding: string,
    callback: (error?: Error | null, data?: Buffer | Uint8Array) => void
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
// This allows: const Stream = require('stream'); class X extends Stream {}
// And also: const { Readable } = require('stream');
(Stream as unknown as Record<string, unknown>).Readable = Readable;
(Stream as unknown as Record<string, unknown>).Writable = Writable;
(Stream as unknown as Record<string, unknown>).Duplex = Duplex;
(Stream as unknown as Record<string, unknown>).Transform = Transform;
(Stream as unknown as Record<string, unknown>).PassThrough = PassThrough;
(Stream as unknown as Record<string, unknown>).Stream = Stream;
// Also expose Readable.from on Stream for compatibility
(Stream as unknown as Record<string, unknown>).from = Readable.from;

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
  // BYTES_PER_ELEMENT for TypedArray compatibility
  static readonly BYTES_PER_ELEMENT = 1;

  // Overloads for Buffer.from compatibility
  static from(arrayLike: ArrayLike<number>): BufferPolyfill;
  static from<T>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => number, thisArg?: unknown): BufferPolyfill;
  static from(data: string, encoding?: string): BufferPolyfill;
  static from(data: ArrayBuffer | Uint8Array): BufferPolyfill;
  static from(data: Iterable<number>): BufferPolyfill;
  static from(
    value: string | ArrayBuffer | Uint8Array | number[] | ArrayLike<number> | Iterable<number>,
    encodingOrMapfn?: string | ((v: unknown, k: number) => number),
    thisArg?: unknown
  ): BufferPolyfill {
    // Handle Uint8Array.from signature (mapfn, thisArg)
    if (typeof encodingOrMapfn === 'function') {
      const arrayLike = value as ArrayLike<number>;
      const mapped = Array.from(arrayLike, encodingOrMapfn as (v: number, k: number) => number, thisArg);
      return new BufferPolyfill(mapped);
    }

    const data = value as string | ArrayBuffer | Uint8Array | number[];
    const encoding = encodingOrMapfn as string | undefined;
    if (Array.isArray(data)) {
      return new BufferPolyfill(data);
    }
    if (typeof data === 'string') {
      const enc = (encoding || 'utf8').toLowerCase();

      if (enc === 'base64' || enc === 'base64url') {
        // Convert base64url to base64 if needed
        let base64 = data;
        if (enc === 'base64url') {
          base64 = data.replace(/-/g, '+').replace(/_/g, '/');
          // Add padding if needed
          while (base64.length % 4 !== 0) {
            base64 += '=';
          }
        }
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return new BufferPolyfill(bytes);
      }

      if (enc === 'hex') {
        const bytes = new Uint8Array(data.length / 2);
        for (let i = 0; i < data.length; i += 2) {
          bytes[i / 2] = parseInt(data.slice(i, i + 2), 16);
        }
        return new BufferPolyfill(bytes);
      }

      if (enc === 'latin1' || enc === 'binary') {
        const bytes = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
          bytes[i] = data.charCodeAt(i) & 0xff;
        }
        return new BufferPolyfill(bytes);
      }

      // Default: utf8
      const bytes = _encoder.encode(data);
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
    return ['utf8', 'utf-8', 'ascii', 'latin1', 'binary', 'base64', 'base64url', 'hex'].includes(encoding.toLowerCase());
  }

  static byteLength(string: string, encoding?: string): number {
    const enc = (encoding || 'utf8').toLowerCase();
    if (enc === 'base64' || enc === 'base64url') {
      // Remove padding and calculate
      const base64 = string.replace(/[=]/g, '');
      return Math.floor(base64.length * 3 / 4);
    }
    if (enc === 'hex') {
      return string.length / 2;
    }
    return _encoder.encode(string).length;
  }

  toString(encoding: BufferEncoding = 'utf8'): string {
    const enc = (encoding || 'utf8').toLowerCase();

    if (enc === 'base64') {
      return uint8ToBase64(this);
    }

    if (enc === 'base64url') {
      return uint8ToBase64(this).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    if (enc === 'hex') {
      return uint8ToHex(this);
    }

    if (enc === 'latin1' || enc === 'binary') {
      return uint8ToBinaryString(this);
    }

    // Default: utf8
    return _decoder.decode(this);
  }

  slice(start?: number, end?: number): BufferPolyfill {
    return new BufferPolyfill(super.slice(start, end));
  }

  subarray(start?: number, end?: number): BufferPolyfill {
    return new BufferPolyfill(super.subarray(start, end));
  }

  write(string: string, offset?: number): number {
    const bytes = _encoder.encode(string);
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

  // Lowercase aliases for UInt methods (Node.js Buffer API compatibility)
  readUint8(offset: number): number {
    return this.readUInt8(offset);
  }

  readUint16BE(offset: number): number {
    return this.readUInt16BE(offset);
  }

  readUint16LE(offset: number): number {
    return this.readUInt16LE(offset);
  }

  readUint32BE(offset: number): number {
    return this.readUInt32BE(offset);
  }

  readUint32LE(offset: number): number {
    return this.readUInt32LE(offset);
  }

  writeUint8(value: number, offset: number): number {
    return this.writeUInt8(value, offset);
  }

  writeUint16BE(value: number, offset: number): number {
    return this.writeUInt16BE(value, offset);
  }

  writeUint16LE(value: number, offset: number): number {
    return this.writeUInt16LE(value, offset);
  }

  writeUint32BE(value: number, offset: number): number {
    return this.writeUInt32BE(value, offset);
  }

  writeUint32LE(value: number, offset: number): number {
    return this.writeUInt32LE(value, offset);
  }

  // Signed integer methods
  readInt8(offset: number): number {
    const val = this[offset];
    return val & 0x80 ? val - 0x100 : val;
  }

  readInt16BE(offset: number): number {
    const val = this.readUInt16BE(offset);
    return val & 0x8000 ? val - 0x10000 : val;
  }

  readInt16LE(offset: number): number {
    const val = this.readUInt16LE(offset);
    return val & 0x8000 ? val - 0x10000 : val;
  }

  readInt32BE(offset: number): number {
    const val = this.readUInt32BE(offset);
    return val | 0; // Convert to signed 32-bit
  }

  readInt32LE(offset: number): number {
    const val = this.readUInt32LE(offset);
    return val | 0; // Convert to signed 32-bit
  }

  writeInt8(value: number, offset: number): number {
    this[offset] = value & 0xff;
    return offset + 1;
  }

  writeInt16BE(value: number, offset: number): number {
    return this.writeUInt16BE(value & 0xffff, offset);
  }

  writeInt16LE(value: number, offset: number): number {
    return this.writeUInt16LE(value & 0xffff, offset);
  }

  writeInt32BE(value: number, offset: number): number {
    return this.writeUInt32BE(value >>> 0, offset);
  }

  writeInt32LE(value: number, offset: number): number {
    return this.writeUInt32LE(value >>> 0, offset);
  }

  // BigInt methods (64-bit)
  readBigUInt64LE(offset: number): bigint {
    const lo = BigInt(this[offset] | (this[offset + 1] << 8) | (this[offset + 2] << 16) | (this[offset + 3] << 24)) & 0xffffffffn;
    const hi = BigInt(this[offset + 4] | (this[offset + 5] << 8) | (this[offset + 6] << 16) | (this[offset + 7] << 24)) & 0xffffffffn;
    return lo | (hi << 32n);
  }

  readBigUInt64BE(offset: number): bigint {
    const hi = BigInt(this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]) & 0xffffffffn;
    const lo = BigInt(this[offset + 4] << 24 | this[offset + 5] << 16 | this[offset + 6] << 8 | this[offset + 7]) & 0xffffffffn;
    return lo | (hi << 32n);
  }

  readBigInt64LE(offset: number): bigint {
    const val = this.readBigUInt64LE(offset);
    // If high bit is set, it's negative
    if (val >= 0x8000000000000000n) {
      return val - 0x10000000000000000n;
    }
    return val;
  }

  readBigInt64BE(offset: number): bigint {
    const val = this.readBigUInt64BE(offset);
    // If high bit is set, it's negative
    if (val >= 0x8000000000000000n) {
      return val - 0x10000000000000000n;
    }
    return val;
  }

  writeBigUInt64LE(value: bigint, offset: number): number {
    const lo = value & 0xffffffffn;
    const hi = (value >> 32n) & 0xffffffffn;
    this[offset] = Number(lo & 0xffn);
    this[offset + 1] = Number((lo >> 8n) & 0xffn);
    this[offset + 2] = Number((lo >> 16n) & 0xffn);
    this[offset + 3] = Number((lo >> 24n) & 0xffn);
    this[offset + 4] = Number(hi & 0xffn);
    this[offset + 5] = Number((hi >> 8n) & 0xffn);
    this[offset + 6] = Number((hi >> 16n) & 0xffn);
    this[offset + 7] = Number((hi >> 24n) & 0xffn);
    return offset + 8;
  }

  writeBigUInt64BE(value: bigint, offset: number): number {
    const lo = value & 0xffffffffn;
    const hi = (value >> 32n) & 0xffffffffn;
    this[offset] = Number((hi >> 24n) & 0xffn);
    this[offset + 1] = Number((hi >> 16n) & 0xffn);
    this[offset + 2] = Number((hi >> 8n) & 0xffn);
    this[offset + 3] = Number(hi & 0xffn);
    this[offset + 4] = Number((lo >> 24n) & 0xffn);
    this[offset + 5] = Number((lo >> 16n) & 0xffn);
    this[offset + 6] = Number((lo >> 8n) & 0xffn);
    this[offset + 7] = Number(lo & 0xffn);
    return offset + 8;
  }

  writeBigInt64LE(value: bigint, offset: number): number {
    // Convert signed to unsigned representation
    const unsigned = value < 0n ? value + 0x10000000000000000n : value;
    return this.writeBigUInt64LE(unsigned, offset);
  }

  writeBigInt64BE(value: bigint, offset: number): number {
    // Convert signed to unsigned representation
    const unsigned = value < 0n ? value + 0x10000000000000000n : value;
    return this.writeBigUInt64BE(unsigned, offset);
  }

  // Lowercase aliases for BigInt methods (Node.js Buffer API compatibility)
  readBigUint64LE(offset: number): bigint {
    return this.readBigUInt64LE(offset);
  }

  readBigUint64BE(offset: number): bigint {
    return this.readBigUInt64BE(offset);
  }

  writeBigUint64LE(value: bigint, offset: number): number {
    return this.writeBigUInt64LE(value, offset);
  }

  writeBigUint64BE(value: bigint, offset: number): number {
    return this.writeBigUInt64BE(value, offset);
  }

  // Float methods
  readFloatLE(offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 4);
    return view.getFloat32(0, true);
  }

  readFloatBE(offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 4);
    return view.getFloat32(0, false);
  }

  readDoubleLE(offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 8);
    return view.getFloat64(0, true);
  }

  readDoubleBE(offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 8);
    return view.getFloat64(0, false);
  }

  writeFloatLE(value: number, offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 4);
    view.setFloat32(0, value, true);
    return offset + 4;
  }

  writeFloatBE(value: number, offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 4);
    view.setFloat32(0, value, false);
    return offset + 4;
  }

  writeDoubleLE(value: number, offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 8);
    view.setFloat64(0, value, true);
    return offset + 8;
  }

  writeDoubleBE(value: number, offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 8);
    view.setFloat64(0, value, false);
    return offset + 8;
  }

  // Variable-length unsigned integer methods
  readUIntLE(offset: number, byteLength: number): number {
    let val = 0;
    let mul = 1;
    for (let i = 0; i < byteLength; i++) {
      val += this[offset + i] * mul;
      mul *= 0x100;
    }
    return val;
  }

  readUintLE(offset: number, byteLength: number): number {
    return this.readUIntLE(offset, byteLength);
  }

  readUIntBE(offset: number, byteLength: number): number {
    let val = 0;
    let mul = 1;
    for (let i = byteLength - 1; i >= 0; i--) {
      val += this[offset + i] * mul;
      mul *= 0x100;
    }
    return val;
  }

  readUintBE(offset: number, byteLength: number): number {
    return this.readUIntBE(offset, byteLength);
  }

  readIntLE(offset: number, byteLength: number): number {
    let val = this.readUIntLE(offset, byteLength);
    const limit = Math.pow(2, (byteLength * 8) - 1);
    if (val >= limit) {
      val -= Math.pow(2, byteLength * 8);
    }
    return val;
  }

  readIntBE(offset: number, byteLength: number): number {
    let val = this.readUIntBE(offset, byteLength);
    const limit = Math.pow(2, (byteLength * 8) - 1);
    if (val >= limit) {
      val -= Math.pow(2, byteLength * 8);
    }
    return val;
  }

  writeUIntLE(value: number, offset: number, byteLength: number): number {
    let val = value;
    for (let i = 0; i < byteLength; i++) {
      this[offset + i] = val & 0xff;
      val = Math.floor(val / 0x100);
    }
    return offset + byteLength;
  }

  writeUintLE(value: number, offset: number, byteLength: number): number {
    return this.writeUIntLE(value, offset, byteLength);
  }

  writeUIntBE(value: number, offset: number, byteLength: number): number {
    let val = value;
    for (let i = byteLength - 1; i >= 0; i--) {
      this[offset + i] = val & 0xff;
      val = Math.floor(val / 0x100);
    }
    return offset + byteLength;
  }

  writeUintBE(value: number, offset: number, byteLength: number): number {
    return this.writeUIntBE(value, offset, byteLength);
  }

  writeIntLE(value: number, offset: number, byteLength: number): number {
    let val = value;
    if (val < 0) {
      val += Math.pow(2, byteLength * 8);
    }
    return this.writeUIntLE(val, offset, byteLength);
  }

  writeIntBE(value: number, offset: number, byteLength: number): number {
    let val = value;
    if (val < 0) {
      val += Math.pow(2, byteLength * 8);
    }
    return this.writeUIntBE(val, offset, byteLength);
  }

  // Swap methods
  swap16(): this {
    const len = this.length;
    if (len % 2 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 16-bits');
    }
    for (let i = 0; i < len; i += 2) {
      const a = this[i];
      this[i] = this[i + 1];
      this[i + 1] = a;
    }
    return this;
  }

  swap32(): this {
    const len = this.length;
    if (len % 4 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 32-bits');
    }
    for (let i = 0; i < len; i += 4) {
      const a = this[i];
      const b = this[i + 1];
      this[i] = this[i + 3];
      this[i + 1] = this[i + 2];
      this[i + 2] = b;
      this[i + 3] = a;
    }
    return this;
  }

  swap64(): this {
    const len = this.length;
    if (len % 8 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 64-bits');
    }
    for (let i = 0; i < len; i += 8) {
      const a = this[i];
      const b = this[i + 1];
      const c = this[i + 2];
      const d = this[i + 3];
      this[i] = this[i + 7];
      this[i + 1] = this[i + 6];
      this[i + 2] = this[i + 5];
      this[i + 3] = this[i + 4];
      this[i + 4] = d;
      this[i + 5] = c;
      this[i + 6] = b;
      this[i + 7] = a;
    }
    return this;
  }
}

// Set global Buffer if not defined
if (typeof globalThis.Buffer === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Buffer = BufferPolyfill;
}

export { BufferPolyfill as Buffer };

// Add remaining properties to Stream for require('stream') compatibility
(Stream as unknown as Record<string, unknown>).pipeline = pipeline;
(Stream as unknown as Record<string, unknown>).finished = finished;
(Stream as unknown as Record<string, unknown>).promises = promises;

// Export Stream as default so `require('stream')` returns Stream class
// which can be extended and also has all stream types as properties
export default Stream;
