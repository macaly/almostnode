/**
 * Node.js zlib module shim
 * Provides basic compression utilities
 */

import { Buffer } from './stream';
import pako from 'pako';
// @ts-expect-error - direct import of brotli-wasm web bundle
import init, * as brotliWasm from 'brotli-wasm/pkg.web/brotli_wasm.js';
// @ts-expect-error - Vite URL import for the WASM file
import brotliWasmUrl from 'brotli-wasm/pkg.web/brotli_wasm_bg.wasm?url';

// Brotli WASM instance - loaded lazily
let brotliModule: { compress: (data: Uint8Array) => Uint8Array; decompress: (data: Uint8Array) => Uint8Array } | null = null;
let brotliLoadPromise: Promise<typeof brotliModule> | null = null;

async function loadBrotli(): Promise<typeof brotliModule> {
  if (brotliModule) return brotliModule;
  if (!brotliLoadPromise) {
    brotliLoadPromise = (async () => {
      try {
        // Initialize brotli-wasm with the explicit WASM URL
        await init(brotliWasmUrl);
        brotliModule = brotliWasm as typeof brotliModule;
        console.log('[zlib] brotli-wasm loaded successfully');
        return brotliModule;
      } catch (error) {
        console.error('[zlib] Failed to load brotli-wasm:', error);
        return null;
      }
    })();
  }
  return brotliLoadPromise;
}

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

// Brotli compression using brotli-wasm
export function brotliCompress(
  buffer: Buffer | string,
  options: unknown,
  callback: (error: Error | null, result: Buffer) => void
): void {
  // Handle overload where options is the callback
  if (typeof options === 'function') {
    callback = options as (error: Error | null, result: Buffer) => void;
  }

  loadBrotli().then(brotli => {
    if (!brotli) {
      callback(new Error('Brotli WASM failed to load'), Buffer.alloc(0));
      return;
    }
    try {
      const input = typeof buffer === 'string' ? Buffer.from(buffer) : buffer;
      const result = brotli.compress(new Uint8Array(input));
      callback(null, Buffer.from(result));
    } catch (error) {
      callback(error as Error, Buffer.alloc(0));
    }
  }).catch(error => {
    callback(error as Error, Buffer.alloc(0));
  });
}

export function brotliDecompress(
  buffer: Buffer,
  options: unknown,
  callback: (error: Error | null, result: Buffer) => void
): void {
  // Handle overload where options is the callback
  if (typeof options === 'function') {
    callback = options as (error: Error | null, result: Buffer) => void;
  }

  loadBrotli().then(brotli => {
    if (!brotli) {
      callback(new Error('Brotli WASM failed to load'), Buffer.alloc(0));
      return;
    }
    try {
      const result = brotli.decompress(new Uint8Array(buffer));
      callback(null, Buffer.from(result));
    } catch (error) {
      callback(error as Error, Buffer.alloc(0));
    }
  }).catch(error => {
    callback(error as Error, Buffer.alloc(0));
  });
}

export function brotliCompressSync(buffer: Buffer | string, _options?: unknown): Buffer {
  if (!brotliModule) {
    throw new Error('Brotli WASM not loaded. Call brotliCompress first to initialize.');
  }
  const input = typeof buffer === 'string' ? Buffer.from(buffer) : buffer;
  return Buffer.from(brotliModule.compress(new Uint8Array(input)));
}

export function brotliDecompressSync(buffer: Buffer, _options?: unknown): Buffer {
  if (!brotliModule) {
    throw new Error('Brotli WASM not loaded. Call brotliDecompress first to initialize.');
  }
  return Buffer.from(brotliModule.decompress(new Uint8Array(buffer)));
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
  // Brotli constants
  BROTLI_DECODE: 0,
  BROTLI_ENCODE: 1,
  BROTLI_OPERATION_PROCESS: 0,
  BROTLI_OPERATION_FLUSH: 1,
  BROTLI_OPERATION_FINISH: 2,
  BROTLI_OPERATION_EMIT_METADATA: 3,
  BROTLI_PARAM_MODE: 0,
  BROTLI_MODE_GENERIC: 0,
  BROTLI_MODE_TEXT: 1,
  BROTLI_MODE_FONT: 2,
  BROTLI_PARAM_QUALITY: 1,
  BROTLI_MIN_QUALITY: 0,
  BROTLI_MAX_QUALITY: 11,
  BROTLI_DEFAULT_QUALITY: 11,
  BROTLI_PARAM_LGWIN: 2,
  BROTLI_MIN_WINDOW_BITS: 10,
  BROTLI_MAX_WINDOW_BITS: 24,
  BROTLI_DEFAULT_WINDOW: 22,
  BROTLI_PARAM_LGBLOCK: 3,
  BROTLI_MIN_INPUT_BLOCK_BITS: 16,
  BROTLI_MAX_INPUT_BLOCK_BITS: 24,
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
  brotliCompress,
  brotliDecompress,
  brotliCompressSync,
  brotliDecompressSync,
  constants,
};
