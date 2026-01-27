/**
 * Node.js zlib module shim
 * Provides basic compression utilities
 */

import { Buffer } from './stream';
import pako from 'pako';

export function gzip(
  buffer: Buffer | string,
  callback: (error: Error | null, result: Buffer) => void
): void {
  try {
    const input = typeof buffer === 'string' ? Buffer.from(buffer) : buffer;
    const result = pako.gzip(input);
    callback(null, Buffer.from(result));
  } catch (error) {
    callback(error as Error, Buffer.alloc(0));
  }
}

export function gunzip(
  buffer: Buffer,
  callback: (error: Error | null, result: Buffer) => void
): void {
  try {
    const result = pako.ungzip(buffer);
    callback(null, Buffer.from(result));
  } catch (error) {
    callback(error as Error, Buffer.alloc(0));
  }
}

export function deflate(
  buffer: Buffer | string,
  callback: (error: Error | null, result: Buffer) => void
): void {
  try {
    const input = typeof buffer === 'string' ? Buffer.from(buffer) : buffer;
    const result = pako.deflate(input);
    callback(null, Buffer.from(result));
  } catch (error) {
    callback(error as Error, Buffer.alloc(0));
  }
}

export function inflate(
  buffer: Buffer,
  callback: (error: Error | null, result: Buffer) => void
): void {
  try {
    const result = pako.inflate(buffer);
    callback(null, Buffer.from(result));
  } catch (error) {
    callback(error as Error, Buffer.alloc(0));
  }
}

export function deflateRaw(
  buffer: Buffer | string,
  callback: (error: Error | null, result: Buffer) => void
): void {
  try {
    const input = typeof buffer === 'string' ? Buffer.from(buffer) : buffer;
    const result = pako.deflateRaw(input);
    callback(null, Buffer.from(result));
  } catch (error) {
    callback(error as Error, Buffer.alloc(0));
  }
}

export function inflateRaw(
  buffer: Buffer,
  callback: (error: Error | null, result: Buffer) => void
): void {
  try {
    const result = pako.inflateRaw(buffer);
    callback(null, Buffer.from(result));
  } catch (error) {
    callback(error as Error, Buffer.alloc(0));
  }
}

// Sync versions
export function gzipSync(buffer: Buffer | string): Buffer {
  const input = typeof buffer === 'string' ? Buffer.from(buffer) : buffer;
  return Buffer.from(pako.gzip(input));
}

export function gunzipSync(buffer: Buffer): Buffer {
  return Buffer.from(pako.ungzip(buffer));
}

export function deflateSync(buffer: Buffer | string): Buffer {
  const input = typeof buffer === 'string' ? Buffer.from(buffer) : buffer;
  return Buffer.from(pako.deflate(input));
}

export function inflateSync(buffer: Buffer): Buffer {
  return Buffer.from(pako.inflate(buffer));
}

export function deflateRawSync(buffer: Buffer | string): Buffer {
  const input = typeof buffer === 'string' ? Buffer.from(buffer) : buffer;
  return Buffer.from(pako.deflateRaw(input));
}

export function inflateRawSync(buffer: Buffer): Buffer {
  return Buffer.from(pako.inflateRaw(buffer));
}

// Constants
export const constants = {
  Z_NO_FLUSH: 0,
  Z_PARTIAL_FLUSH: 1,
  Z_SYNC_FLUSH: 2,
  Z_FULL_FLUSH: 3,
  Z_FINISH: 4,
  Z_BLOCK: 5,
  Z_OK: 0,
  Z_STREAM_END: 1,
  Z_NEED_DICT: 2,
  Z_ERRNO: -1,
  Z_STREAM_ERROR: -2,
  Z_DATA_ERROR: -3,
  Z_MEM_ERROR: -4,
  Z_BUF_ERROR: -5,
  Z_VERSION_ERROR: -6,
  Z_NO_COMPRESSION: 0,
  Z_BEST_SPEED: 1,
  Z_BEST_COMPRESSION: 9,
  Z_DEFAULT_COMPRESSION: -1,
  Z_FILTERED: 1,
  Z_HUFFMAN_ONLY: 2,
  Z_RLE: 3,
  Z_FIXED: 4,
  Z_DEFAULT_STRATEGY: 0,
  ZLIB_VERNUM: 4784,
  Z_MIN_WINDOWBITS: 8,
  Z_MAX_WINDOWBITS: 15,
  Z_DEFAULT_WINDOWBITS: 15,
  Z_MIN_CHUNK: 64,
  Z_MAX_CHUNK: Infinity,
  Z_DEFAULT_CHUNK: 16384,
  Z_MIN_MEMLEVEL: 1,
  Z_MAX_MEMLEVEL: 9,
  Z_DEFAULT_MEMLEVEL: 8,
  Z_MIN_LEVEL: -1,
  Z_MAX_LEVEL: 9,
  Z_DEFAULT_LEVEL: -1,
};

export default {
  gzip,
  gunzip,
  deflate,
  inflate,
  deflateRaw,
  inflateRaw,
  gzipSync,
  gunzipSync,
  deflateSync,
  inflateSync,
  deflateRawSync,
  inflateRawSync,
  constants,
};
