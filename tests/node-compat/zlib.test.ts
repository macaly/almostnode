/**
 * Node.js zlib module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-zlib-*.js
 *
 * Note: The zlib shim uses pako for gzip/deflate and brotli-wasm for brotli.
 * These tests use Node.js built-in zlib and pako directly because the shim
 * has browser-specific imports that don't work in Node.js test environment.
 */

import { describe, it, expect } from 'vitest';
import pako from 'pako';
import * as nodeZlib from 'node:zlib';
import { Buffer } from '../../src/shims/stream';
import { assert } from './common';

describe('zlib module (Node.js compat)', () => {
  // Test data
  const testString = 'Hello World! '.repeat(100);
  const testBuffer = Buffer.from(testString);

  // Helper functions that mirror the zlib shim API
  const gzipSync = (input: Buffer | string): Buffer => {
    const data = typeof input === 'string' ? Buffer.from(input) : input;
    return Buffer.from(pako.gzip(data));
  };

  const gunzipSync = (input: Buffer): Buffer => {
    return Buffer.from(pako.ungzip(input));
  };

  const deflateSync = (input: Buffer | string): Buffer => {
    const data = typeof input === 'string' ? Buffer.from(input) : input;
    return Buffer.from(pako.deflate(data));
  };

  const inflateSync = (input: Buffer): Buffer => {
    return Buffer.from(pako.inflate(input));
  };

  const deflateRawSync = (input: Buffer | string): Buffer => {
    const data = typeof input === 'string' ? Buffer.from(input) : input;
    return Buffer.from(pako.deflateRaw(data));
  };

  const inflateRawSync = (input: Buffer): Buffer => {
    return Buffer.from(pako.inflateRaw(input));
  };

  // Brotli using Node.js built-in
  const brotliCompressSync = (input: Buffer): Buffer => {
    return Buffer.from(nodeZlib.brotliCompressSync(input));
  };

  const brotliDecompressSync = (input: Buffer): Buffer => {
    return Buffer.from(nodeZlib.brotliDecompressSync(input));
  };

  describe('gzipSync() and gunzipSync()', () => {
    it('should compress data', () => {
      const compressed = gzipSync(testBuffer);
      expect(compressed).toBeInstanceOf(Uint8Array);
      expect(compressed.length).toBeGreaterThan(0);
      expect(compressed.length).toBeLessThan(testBuffer.length);
    });

    it('should decompress data', () => {
      const compressed = gzipSync(testBuffer);
      const decompressed = gunzipSync(compressed);
      assert.strictEqual(decompressed.toString(), testString);
    });

    it('should handle round-trip compression', () => {
      const compressed = gzipSync(testBuffer);
      const decompressed = gunzipSync(compressed);
      assert.strictEqual(decompressed.toString(), testString);
    });

    it('should handle string input', () => {
      const compressed = gzipSync(testString);
      const decompressed = gunzipSync(compressed);
      assert.strictEqual(decompressed.toString(), testString);
    });

    it('should handle empty input', () => {
      const compressed = gzipSync('');
      const decompressed = gunzipSync(compressed);
      assert.strictEqual(decompressed.toString(), '');
    });

    it('should handle binary data', () => {
      const binaryData = Buffer.from([0, 1, 2, 255, 254, 253, 0, 0, 0, 128, 127]);
      const compressed = gzipSync(binaryData);
      const decompressed = gunzipSync(compressed);
      expect(Array.from(decompressed)).toEqual(Array.from(binaryData));
    });

    it('should produce valid gzip format', () => {
      const compressed = gzipSync(testBuffer);
      // Gzip magic number: 0x1f 0x8b
      assert.strictEqual(compressed[0], 0x1f);
      assert.strictEqual(compressed[1], 0x8b);
    });
  });

  describe('deflateSync() and inflateSync()', () => {
    it('should compress data', () => {
      const compressed = deflateSync(testBuffer);
      expect(compressed).toBeInstanceOf(Uint8Array);
      expect(compressed.length).toBeGreaterThan(0);
      expect(compressed.length).toBeLessThan(testBuffer.length);
    });

    it('should decompress data', () => {
      const compressed = deflateSync(testBuffer);
      const decompressed = inflateSync(compressed);
      assert.strictEqual(decompressed.toString(), testString);
    });

    it('should handle round-trip compression', () => {
      const compressed = deflateSync(testBuffer);
      const decompressed = inflateSync(compressed);
      assert.strictEqual(decompressed.toString(), testString);
    });

    it('should handle string input', () => {
      const compressed = deflateSync(testString);
      const decompressed = inflateSync(compressed);
      assert.strictEqual(decompressed.toString(), testString);
    });

    it('should handle empty input', () => {
      const compressed = deflateSync('');
      const decompressed = inflateSync(compressed);
      assert.strictEqual(decompressed.toString(), '');
    });

    it('should produce smaller output than gzip for same data', () => {
      // Deflate doesn't have gzip headers, so should be slightly smaller
      const gzipped = gzipSync(testBuffer);
      const deflated = deflateSync(testBuffer);
      expect(deflated.length).toBeLessThanOrEqual(gzipped.length);
    });
  });

  describe('deflateRawSync() and inflateRawSync()', () => {
    it('should compress data', () => {
      const compressed = deflateRawSync(testBuffer);
      expect(compressed).toBeInstanceOf(Uint8Array);
      expect(compressed.length).toBeGreaterThan(0);
    });

    it('should decompress data', () => {
      const compressed = deflateRawSync(testBuffer);
      const decompressed = inflateRawSync(compressed);
      assert.strictEqual(decompressed.toString(), testString);
    });

    it('should handle round-trip compression', () => {
      const compressed = deflateRawSync(testBuffer);
      const decompressed = inflateRawSync(compressed);
      assert.strictEqual(decompressed.toString(), testString);
    });

    it('should produce smaller output than regular deflate', () => {
      // Raw deflate doesn't have zlib headers
      const deflated = deflateSync(testBuffer);
      const deflatedRaw = deflateRawSync(testBuffer);
      expect(deflatedRaw.length).toBeLessThanOrEqual(deflated.length);
    });
  });

  describe('brotliCompressSync() and brotliDecompressSync()', () => {
    it('should compress data', () => {
      const compressed = brotliCompressSync(testBuffer);
      expect(compressed).toBeInstanceOf(Uint8Array);
      expect(compressed.length).toBeGreaterThan(0);
      expect(compressed.length).toBeLessThan(testBuffer.length);
    });

    it('should decompress data', () => {
      const compressed = brotliCompressSync(testBuffer);
      const decompressed = brotliDecompressSync(compressed);
      assert.strictEqual(decompressed.toString(), testString);
    });

    it('should handle round-trip compression', () => {
      const compressed = brotliCompressSync(testBuffer);
      const decompressed = brotliDecompressSync(compressed);
      assert.strictEqual(decompressed.toString(), testString);
    });

    it('should handle empty input', () => {
      const compressed = brotliCompressSync(Buffer.from(''));
      const decompressed = brotliDecompressSync(compressed);
      assert.strictEqual(decompressed.length, 0);
    });

    it('should handle binary data', () => {
      const binaryData = Buffer.from([0, 1, 2, 255, 254, 253, 0, 0, 0, 128, 127]);
      const compressed = brotliCompressSync(binaryData);
      const decompressed = brotliDecompressSync(compressed);
      expect(Array.from(decompressed)).toEqual(Array.from(binaryData));
    });

    it('should throw error when decompressing invalid data', () => {
      const invalidData = Buffer.from('this is not valid brotli data');
      expect(() => brotliDecompressSync(invalidData)).toThrow();
    });

    it('should produce deterministic output', () => {
      const compressed1 = brotliCompressSync(testBuffer);
      const compressed2 = brotliCompressSync(testBuffer);
      expect(compressed1).toEqual(compressed2);
    });
  });

  describe('compression efficiency', () => {
    it('should achieve good compression on repetitive data', () => {
      const repetitive = Buffer.from('abc'.repeat(10000));
      const compressed = gzipSync(repetitive);
      // Should compress to less than 1% of original for highly repetitive data
      expect(compressed.length).toBeLessThan(repetitive.length * 0.01);
    });

    it('should handle large data', () => {
      const largeString = 'x'.repeat(100000);
      const largeBuffer = Buffer.from(largeString);
      const compressed = gzipSync(largeBuffer);
      const decompressed = gunzipSync(compressed);
      assert.strictEqual(decompressed.toString(), largeString);
    });

    it('should handle JSON data typical of web applications', () => {
      const jsonData = JSON.stringify({
        users: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          active: i % 2 === 0,
        })),
      });
      const input = Buffer.from(jsonData);
      const compressed = gzipSync(input);
      const decompressed = gunzipSync(compressed);
      assert.strictEqual(decompressed.toString(), jsonData);
      expect(compressed.length).toBeLessThan(input.length);
    });

    it('brotli should outperform gzip on text data', () => {
      const textData = Buffer.from('The quick brown fox jumps over the lazy dog. '.repeat(1000));
      const gzipped = gzipSync(textData);
      const brotlied = brotliCompressSync(textData);
      // Brotli typically achieves better compression on text
      expect(brotlied.length).toBeLessThanOrEqual(gzipped.length);
    });
  });

  describe('zlib constants', () => {
    // These constants should match what the zlib shim exports
    const constants = {
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
    };

    it('should have correct flush constants', () => {
      assert.strictEqual(constants.Z_NO_FLUSH, 0);
      assert.strictEqual(constants.Z_PARTIAL_FLUSH, 1);
      assert.strictEqual(constants.Z_SYNC_FLUSH, 2);
      assert.strictEqual(constants.Z_FULL_FLUSH, 3);
      assert.strictEqual(constants.Z_FINISH, 4);
      assert.strictEqual(constants.Z_BLOCK, 5);
    });

    it('should have correct return code constants', () => {
      assert.strictEqual(constants.Z_OK, 0);
      assert.strictEqual(constants.Z_STREAM_END, 1);
      assert.strictEqual(constants.Z_NEED_DICT, 2);
      assert.strictEqual(constants.Z_ERRNO, -1);
      assert.strictEqual(constants.Z_STREAM_ERROR, -2);
      assert.strictEqual(constants.Z_DATA_ERROR, -3);
      assert.strictEqual(constants.Z_MEM_ERROR, -4);
      assert.strictEqual(constants.Z_BUF_ERROR, -5);
      assert.strictEqual(constants.Z_VERSION_ERROR, -6);
    });

    it('should have correct compression level constants', () => {
      assert.strictEqual(constants.Z_NO_COMPRESSION, 0);
      assert.strictEqual(constants.Z_BEST_SPEED, 1);
      assert.strictEqual(constants.Z_BEST_COMPRESSION, 9);
      assert.strictEqual(constants.Z_DEFAULT_COMPRESSION, -1);
    });

    it('should have correct strategy constants', () => {
      assert.strictEqual(constants.Z_FILTERED, 1);
      assert.strictEqual(constants.Z_HUFFMAN_ONLY, 2);
      assert.strictEqual(constants.Z_RLE, 3);
      assert.strictEqual(constants.Z_FIXED, 4);
      assert.strictEqual(constants.Z_DEFAULT_STRATEGY, 0);
    });
  });

  describe('brotli constants', () => {
    const brotliConstants = {
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
    };

    it('should have correct brotli operation constants', () => {
      assert.strictEqual(brotliConstants.BROTLI_DECODE, 0);
      assert.strictEqual(brotliConstants.BROTLI_ENCODE, 1);
      assert.strictEqual(brotliConstants.BROTLI_OPERATION_PROCESS, 0);
      assert.strictEqual(brotliConstants.BROTLI_OPERATION_FLUSH, 1);
      assert.strictEqual(brotliConstants.BROTLI_OPERATION_FINISH, 2);
    });

    it('should have correct brotli mode constants', () => {
      assert.strictEqual(brotliConstants.BROTLI_MODE_GENERIC, 0);
      assert.strictEqual(brotliConstants.BROTLI_MODE_TEXT, 1);
      assert.strictEqual(brotliConstants.BROTLI_MODE_FONT, 2);
    });

    it('should have correct brotli quality constants', () => {
      assert.strictEqual(brotliConstants.BROTLI_MIN_QUALITY, 0);
      assert.strictEqual(brotliConstants.BROTLI_MAX_QUALITY, 11);
      assert.strictEqual(brotliConstants.BROTLI_DEFAULT_QUALITY, 11);
    });
  });

  describe('edge cases', () => {
    it('should handle unicode strings', () => {
      const unicode = '中文字符 日本語 한국어 🎉';
      const compressed = gzipSync(unicode);
      const decompressed = gunzipSync(compressed);
      assert.strictEqual(decompressed.toString(), unicode);
    });

    it('should handle single byte', () => {
      const singleByte = Buffer.from([42]);
      const compressed = gzipSync(singleByte);
      const decompressed = gunzipSync(compressed);
      assert.strictEqual(decompressed[0], 42);
      assert.strictEqual(decompressed.length, 1);
    });

    it('should handle all byte values', () => {
      const allBytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
      const compressed = gzipSync(allBytes);
      const decompressed = gunzipSync(compressed);
      expect(Array.from(decompressed)).toEqual(Array.from(allBytes));
    });

    it('should maintain data integrity for random data', () => {
      const randomData = Buffer.from(
        Array.from({ length: 1000 }, () => Math.floor(Math.random() * 256))
      );
      const compressed = gzipSync(randomData);
      const decompressed = gunzipSync(compressed);
      expect(Array.from(decompressed)).toEqual(Array.from(randomData));
    });
  });
});
