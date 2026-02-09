/**
 * Node.js stream module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-stream-*.js
 *
 * These tests verify that our stream shim behaves consistently with Node.js
 * for common stream operations used by target frameworks.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Stream, {
  Readable,
  Writable,
  Duplex,
  Transform,
  PassThrough,
  Buffer,
  pipeline,
  finished,
} from '../../src/shims/stream';
import { assert } from './common';

describe('Stream module (Node.js compat)', () => {
  describe('Stream class', () => {
    it('should be exported as default', () => {
      expect(Stream).toBeDefined();
      expect(typeof Stream).toBe('function');
    });

    it('should have static references to stream types', () => {
      expect((Stream as unknown as Record<string, unknown>).Readable).toBe(Readable);
      expect((Stream as unknown as Record<string, unknown>).Writable).toBe(Writable);
      expect((Stream as unknown as Record<string, unknown>).Duplex).toBe(Duplex);
      expect((Stream as unknown as Record<string, unknown>).Transform).toBe(Transform);
      expect((Stream as unknown as Record<string, unknown>).PassThrough).toBe(PassThrough);
    });

    it('should have pipe method', () => {
      const stream = new Stream();
      expect(typeof stream.pipe).toBe('function');
    });
  });

  describe('Readable', () => {
    describe('basic functionality', () => {
      it('should create a readable stream', () => {
        const readable = new Readable();
        expect(readable).toBeInstanceOf(Readable);
        expect(readable.readable).toBe(true);
      });

      it('should push data and receive via data event', async () => {
        const readable = new Readable();
        const chunks: Buffer[] = [];

        readable.on('data', (chunk) => {
          chunks.push(chunk as Buffer);
        });

        // Wait for microtask to set up flowing mode
        await new Promise<void>(resolve => queueMicrotask(resolve));

        readable.push(Buffer.from('hello'));
        readable.push(Buffer.from(' world'));
        readable.push(null);

        // Wait for data events to fire
        await new Promise<void>(resolve => queueMicrotask(resolve));

        const combined = Buffer.concat(chunks);
        assert.strictEqual(combined.toString(), 'hello world');
      });

      it('should emit end event when push(null) is called', async () => {
        const readable = new Readable();
        let ended = false;

        readable.on('data', () => {});
        readable.on('end', () => {
          ended = true;
        });

        // Wait for flowing mode
        await new Promise<void>(resolve => queueMicrotask(resolve));

        readable.push(Buffer.from('data'));
        readable.push(null);

        // Wait for end event
        await new Promise(resolve => setTimeout(resolve, 10));

        assert.strictEqual(ended, true);
      });

      it('should set readableEnded after end', async () => {
        const readable = new Readable();

        readable.on('data', () => {});

        await new Promise<void>(resolve => queueMicrotask(resolve));

        assert.strictEqual(readable.readableEnded, false);
        readable.push(null);

        await new Promise<void>(resolve => queueMicrotask(resolve));

        assert.strictEqual(readable.readableEnded, true);
      });
    });

    describe('pause and resume', () => {
      it('should pause and resume stream', async () => {
        const readable = new Readable();
        const chunks: Buffer[] = [];

        readable.on('data', (chunk) => {
          chunks.push(chunk as Buffer);
        });

        await new Promise<void>(resolve => queueMicrotask(resolve));

        readable.push(Buffer.from('chunk1'));
        await new Promise<void>(resolve => queueMicrotask(resolve));

        readable.pause();
        readable.push(Buffer.from('chunk2')); // Should be buffered

        // Give some time to ensure chunk2 isn't emitted
        await new Promise(resolve => setTimeout(resolve, 10));

        assert.strictEqual(chunks.length, 1);

        readable.resume();
        await new Promise<void>(resolve => queueMicrotask(resolve));

        assert.strictEqual(chunks.length, 2);
      });

      it('should set readableFlowing correctly', async () => {
        const readable = new Readable();

        assert.strictEqual(readable.readableFlowing, null);

        readable.on('data', () => {});
        await new Promise<void>(resolve => queueMicrotask(resolve));

        assert.strictEqual(readable.readableFlowing, true);

        readable.pause();
        assert.strictEqual(readable.readableFlowing, false);

        readable.resume();
        assert.strictEqual(readable.readableFlowing, true);
      });
    });

    describe('read() method', () => {
      it('should read all buffered data when no size specified', () => {
        const readable = new Readable();
        readable.push(Buffer.from('hello'));
        readable.push(Buffer.from(' world'));

        const data = readable.read();
        assert.strictEqual(data?.toString(), 'hello world');
      });

      it('should read specific size', () => {
        const readable = new Readable();
        readable.push(Buffer.from('hello world'));

        const data = readable.read(5);
        assert.strictEqual(data?.toString(), 'hello');

        const remaining = readable.read();
        assert.strictEqual(remaining?.toString(), ' world');
      });

      it('should return null when buffer is empty', () => {
        const readable = new Readable();
        const data = readable.read();
        assert.strictEqual(data, null);
      });
    });

    describe('pipe', () => {
      it('should pipe to writable', async () => {
        const readable = new Readable();
        const writable = new Writable();

        readable.pipe(writable);

        readable.push(Buffer.from('hello'));
        readable.push(Buffer.from(' world'));
        readable.push(null);

        // Wait for pipe to complete
        await new Promise(resolve => setTimeout(resolve, 20));

        assert.strictEqual(writable.getBufferAsString(), 'hello world');
      });

      it('should end destination when source ends', async () => {
        const readable = new Readable();
        const writable = new Writable();

        readable.pipe(writable);

        readable.push(Buffer.from('data'));
        readable.push(null);

        await new Promise(resolve => setTimeout(resolve, 20));

        assert.strictEqual(writable.writableEnded, true);
      });
    });

    describe('destroy', () => {
      it('should emit close event', async () => {
        const readable = new Readable();
        let closed = false;

        readable.on('close', () => {
          closed = true;
        });

        readable.destroy();

        await new Promise<void>(resolve => queueMicrotask(resolve));
        assert.strictEqual(closed, true);
      });

      it('should emit error if provided', async () => {
        const readable = new Readable();
        let errorReceived: Error | null = null;

        readable.on('error', (err) => {
          errorReceived = err as Error;
        });

        const error = new Error('test error');
        readable.destroy(error);

        await new Promise<void>(resolve => queueMicrotask(resolve));
        assert.strictEqual(errorReceived, error);
      });
    });

    describe('Readable.from()', () => {
      it('should create stream from array', async () => {
        const data = ['hello', ' ', 'world'];
        const readable = Readable.from(data);
        const chunks: Buffer[] = [];

        readable.on('data', (chunk) => {
          chunks.push(chunk as Buffer);
        });

        await new Promise(resolve => readable.on('end', resolve));

        const result = Buffer.concat(chunks).toString();
        assert.strictEqual(result, 'hello world');
      });

      it('should create stream from generator', async () => {
        function* generator() {
          yield 'a';
          yield 'b';
          yield 'c';
        }

        const readable = Readable.from(generator());
        const chunks: Buffer[] = [];

        readable.on('data', (chunk) => {
          chunks.push(chunk as Buffer);
        });

        await new Promise(resolve => readable.on('end', resolve));

        const result = Buffer.concat(chunks).toString();
        assert.strictEqual(result, 'abc');
      });

      it('should create stream from async generator', async () => {
        async function* asyncGenerator() {
          yield 'async';
          await new Promise(resolve => setTimeout(resolve, 5));
          yield ' ';
          yield 'data';
        }

        const readable = Readable.from(asyncGenerator());
        const chunks: Buffer[] = [];

        readable.on('data', (chunk) => {
          chunks.push(chunk as Buffer);
        });

        await new Promise(resolve => readable.on('end', resolve));

        const result = Buffer.concat(chunks).toString();
        assert.strictEqual(result, 'async data');
      });

      it('should create stream from Buffer array', async () => {
        const data = [Buffer.from('hello'), Buffer.from(' '), Buffer.from('world')];
        const readable = Readable.from(data);
        const chunks: Buffer[] = [];

        readable.on('data', (chunk) => {
          chunks.push(chunk as Buffer);
        });

        await new Promise(resolve => readable.on('end', resolve));

        const result = Buffer.concat(chunks).toString();
        assert.strictEqual(result, 'hello world');
      });

      it('should skip null and undefined values', async () => {
        function* generator() {
          yield 'a';
          yield null;
          yield undefined;
          yield 'b';
        }

        const readable = Readable.from(generator());
        const chunks: Buffer[] = [];

        readable.on('data', (chunk) => {
          chunks.push(chunk as Buffer);
        });

        await new Promise(resolve => readable.on('end', resolve));

        const result = Buffer.concat(chunks).toString();
        assert.strictEqual(result, 'ab');
      });

      it('should handle empty iterable', async () => {
        const readable = Readable.from([]);
        let ended = false;

        readable.on('data', () => {});
        readable.on('end', () => {
          ended = true;
        });

        await new Promise(resolve => setTimeout(resolve, 20));
        assert.strictEqual(ended, true);
      });

      it('should be pipeable', async () => {
        const data = ['chunk1', 'chunk2', 'chunk3'];
        const readable = Readable.from(data);
        const writable = new Writable();

        readable.pipe(writable);

        await new Promise(resolve => writable.on('finish', resolve));

        assert.strictEqual(writable.getBufferAsString(), 'chunk1chunk2chunk3');
      });

      it('should handle errors in async generator', async () => {
        async function* errorGenerator() {
          yield 'ok';
          throw new Error('generator error');
        }

        const readable = Readable.from(errorGenerator());
        let errorReceived: Error | null = null;

        readable.on('data', () => {});
        readable.on('error', (err) => {
          errorReceived = err as Error;
        });

        await new Promise(resolve => setTimeout(resolve, 20));
        expect(errorReceived).not.toBeNull();
        assert.strictEqual(errorReceived!.message, 'generator error');
      });

      it('should be accessible via Stream.from', () => {
        expect((Stream as unknown as Record<string, unknown>).from).toBe(Readable.from);
      });
    });
  });

  describe('Writable', () => {
    describe('basic functionality', () => {
      it('should create a writable stream', () => {
        const writable = new Writable();
        expect(writable).toBeInstanceOf(Writable);
        expect(writable.writable).toBe(true);
      });

      it('should write data', () => {
        const writable = new Writable();
        writable.write(Buffer.from('hello'));
        writable.write(Buffer.from(' world'));

        assert.strictEqual(writable.getBufferAsString(), 'hello world');
      });

      it('should write strings', () => {
        const writable = new Writable();
        writable.write('hello');
        writable.write(' world');

        assert.strictEqual(writable.getBufferAsString(), 'hello world');
      });

      it('should return true from write', () => {
        const writable = new Writable();
        const result = writable.write('test');
        assert.strictEqual(result, true);
      });
    });

    describe('callbacks', () => {
      it('should call write callback', async () => {
        const writable = new Writable();
        let callbackCalled = false;

        writable.write('test', () => {
          callbackCalled = true;
        });

        await new Promise<void>(resolve => queueMicrotask(resolve));
        assert.strictEqual(callbackCalled, true);
      });

      it('should call write callback with encoding', async () => {
        const writable = new Writable();
        let callbackCalled = false;

        writable.write('test', 'utf8', () => {
          callbackCalled = true;
        });

        await new Promise<void>(resolve => queueMicrotask(resolve));
        assert.strictEqual(callbackCalled, true);
      });
    });

    describe('end', () => {
      it('should end the stream', async () => {
        const writable = new Writable();
        writable.write('hello');
        writable.end();

        await new Promise<void>(resolve => queueMicrotask(resolve));

        assert.strictEqual(writable.writable, false);
        assert.strictEqual(writable.writableEnded, true);
      });

      it('should emit finish event', async () => {
        const writable = new Writable();
        let finished = false;

        writable.on('finish', () => {
          finished = true;
        });

        writable.end();

        await new Promise<void>(resolve => queueMicrotask(resolve));
        assert.strictEqual(finished, true);
      });

      it('should write final chunk before ending', async () => {
        const writable = new Writable();
        writable.write('hello');
        writable.end(' world');

        await new Promise<void>(resolve => queueMicrotask(resolve));
        assert.strictEqual(writable.getBufferAsString(), 'hello world');
      });

      it('should call callback on end', async () => {
        const writable = new Writable();
        let callbackCalled = false;

        writable.end(() => {
          callbackCalled = true;
        });

        await new Promise<void>(resolve => queueMicrotask(resolve));
        assert.strictEqual(callbackCalled, true);
      });

      it('should error on write after end', async () => {
        const writable = new Writable();
        writable.end();

        await new Promise<void>(resolve => queueMicrotask(resolve));

        let errorReceived = false;
        writable.write('test', (err) => {
          errorReceived = err !== null;
        });

        await new Promise<void>(resolve => queueMicrotask(resolve));
        assert.strictEqual(errorReceived, true);
      });
    });

    describe('destroy', () => {
      it('should emit close event', async () => {
        const writable = new Writable();
        let closed = false;

        writable.on('close', () => {
          closed = true;
        });

        writable.destroy();

        await new Promise<void>(resolve => queueMicrotask(resolve));
        assert.strictEqual(closed, true);
      });
    });
  });

  describe('Duplex', () => {
    it('should create a duplex stream', () => {
      const duplex = new Duplex();
      expect(duplex).toBeInstanceOf(Duplex);
      expect(duplex).toBeInstanceOf(Readable);
      expect(duplex.readable).toBe(true);
      expect(duplex.writable).toBe(true);
    });

    it('should be readable and writable independently', async () => {
      const duplex = new Duplex();

      // Write to writable side
      duplex.write('write side');

      // Push to readable side
      duplex.push(Buffer.from('read side'));

      const readData = duplex.read();
      assert.strictEqual(readData?.toString(), 'read side');
    });
  });

  describe('PassThrough', () => {
    it('should create a passthrough stream', () => {
      const passthrough = new PassThrough();
      expect(passthrough).toBeInstanceOf(PassThrough);
      expect(passthrough).toBeInstanceOf(Duplex);
    });

    it('should pass data through', async () => {
      const passthrough = new PassThrough();
      const chunks: Buffer[] = [];

      passthrough.on('data', (chunk) => {
        chunks.push(chunk as Buffer);
      });

      await new Promise<void>(resolve => queueMicrotask(resolve));

      passthrough.write('hello');
      passthrough.write(' world');

      await new Promise<void>(resolve => queueMicrotask(resolve));

      const combined = Buffer.concat(chunks);
      assert.strictEqual(combined.toString(), 'hello world');
    });
  });

  describe('Transform', () => {
    it('should create a transform stream', () => {
      const transform = new Transform();
      expect(transform).toBeInstanceOf(Transform);
      expect(transform).toBeInstanceOf(Duplex);
    });

    it('should transform data with default passthrough', async () => {
      const transform = new Transform();
      const chunks: Buffer[] = [];

      transform.on('data', (chunk) => {
        chunks.push(chunk as Buffer);
      });

      await new Promise<void>(resolve => queueMicrotask(resolve));

      transform.write('hello');

      await new Promise<void>(resolve => queueMicrotask(resolve));

      assert.strictEqual(chunks[0]?.toString(), 'hello');
    });

    it('should allow custom transform implementation', async () => {
      class UpperCaseTransform extends Transform {
        _transform(chunk: any, encoding: string, callback: (error?: Error | null, data?: any) => void): void {
          callback(null, Buffer.from(chunk.toString().toUpperCase()));
        }
      }

      const transform = new UpperCaseTransform();
      const chunks: Buffer[] = [];

      transform.on('data', (chunk) => {
        chunks.push(chunk as Buffer);
      });

      await new Promise<void>(resolve => queueMicrotask(resolve));

      transform.write('hello');

      await new Promise<void>(resolve => queueMicrotask(resolve));

      assert.strictEqual(chunks[0]?.toString(), 'HELLO');
    });
  });

  describe('pipeline()', () => {
    it('should pipeline streams', async () => {
      const readable = new Readable();
      const writable = new Writable();

      let callbackCalled = false;
      pipeline(readable, writable, () => {
        callbackCalled = true;
      });

      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(callbackCalled, true);
    });

    it('should return last stream', () => {
      const readable = new Readable();
      const writable = new Writable();

      const result = pipeline(readable, writable, () => {});
      expect(result).toBe(writable);
    });
  });

  describe('finished()', () => {
    it('should call callback when stream finishes', async () => {
      const writable = new Writable();
      let callbackCalled = false;

      finished(writable, () => {
        callbackCalled = true;
      });

      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(callbackCalled, true);
    });

    it('should return cleanup function', () => {
      const writable = new Writable();
      const cleanup = finished(writable, () => {});
      expect(typeof cleanup).toBe('function');
    });
  });

  describe('integration scenarios', () => {
    it('should handle readable -> writable pipe with multiple chunks', async () => {
      const readable = new Readable();
      const writable = new Writable();

      readable.pipe(writable);

      for (let i = 0; i < 10; i++) {
        readable.push(Buffer.from(`chunk${i}`));
      }
      readable.push(null);

      await new Promise(resolve => setTimeout(resolve, 50));

      const result = writable.getBufferAsString();
      for (let i = 0; i < 10; i++) {
        expect(result).toContain(`chunk${i}`);
      }
    });

    it('should handle readable -> transform -> writable', async () => {
      class ReverseTransform extends Transform {
        _transform(chunk: any, encoding: string, callback: (error?: Error | null, data?: any) => void): void {
          const reversed = chunk.toString().split('').reverse().join('');
          callback(null, Buffer.from(reversed));
        }
      }

      const readable = new Readable();
      const transform = new ReverseTransform();
      const writable = new Writable();

      readable.pipe(transform).pipe(writable);

      readable.push(Buffer.from('hello'));
      readable.push(null);

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(writable.getBufferAsString(), 'olleh');
    });

    it('should handle string input', async () => {
      const readable = new Readable();
      const writable = new Writable();

      readable.pipe(writable);

      readable.push('hello');
      readable.push(' world');
      readable.push(null);

      await new Promise(resolve => setTimeout(resolve, 20));

      assert.strictEqual(writable.getBufferAsString(), 'hello world');
    });
  });

  describe('EventEmitter integration', () => {
    it('should support once() listener', async () => {
      const readable = new Readable();
      let count = 0;

      readable.once('data', () => {
        count++;
      });

      await new Promise<void>(resolve => queueMicrotask(resolve));

      readable.push(Buffer.from('first'));
      readable.push(Buffer.from('second'));

      await new Promise(resolve => setTimeout(resolve, 10));

      // once should only fire once
      assert.strictEqual(count, 1);
    });

    it('should support removeAllListeners()', async () => {
      const readable = new Readable();
      let count = 0;

      readable.on('data', () => {
        count++;
      });

      await new Promise<void>(resolve => queueMicrotask(resolve));

      readable.push(Buffer.from('first'));
      await new Promise<void>(resolve => queueMicrotask(resolve));

      readable.removeAllListeners('data');

      readable.push(Buffer.from('second'));
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.strictEqual(count, 1);
    });
  });
});
