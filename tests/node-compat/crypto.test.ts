/**
 * Node.js crypto module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-crypto-*.js
 *
 * Note: Our crypto shim uses Web Crypto API under the hood.
 * Some operations that require async in Web Crypto are shimmed synchronously.
 */

import { describe, it, expect } from 'vitest';
import crypto, {
  randomBytes,
  randomUUID,
  randomInt,
  createHash,
  createHmac,
  createSign,
  createVerify,
  sign,
  verify,
  pbkdf2,
  pbkdf2Sync,
  timingSafeEqual,
  createSecretKey,
  KeyObject,
  getHashes,
  getCiphers,
} from '../../src/shims/crypto';
import { Buffer } from '../../src/shims/stream';
import { assert } from './common';

describe('crypto module (Node.js compat)', () => {
  describe('crypto.randomBytes()', () => {
    it('should generate random bytes of specified length', () => {
      const bytes = randomBytes(16);
      expect(bytes).toBeInstanceOf(Uint8Array);
      assert.strictEqual(bytes.length, 16);
    });

    it('should generate different values each time', () => {
      const bytes1 = randomBytes(32);
      const bytes2 = randomBytes(32);
      // Very unlikely to be equal
      expect(bytes1).not.toEqual(bytes2);
    });

    it('should handle various sizes', () => {
      assert.strictEqual(randomBytes(1).length, 1);
      assert.strictEqual(randomBytes(64).length, 64);
      assert.strictEqual(randomBytes(256).length, 256);
    });

    it('should handle size 0', () => {
      const bytes = randomBytes(0);
      assert.strictEqual(bytes.length, 0);
    });
  });

  // Note: randomFillSync is not implemented in our shim

  describe('crypto.randomUUID()', () => {
    it('should generate a valid UUID v4', () => {
      const uuid = randomUUID();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set();
      for (let i = 0; i < 100; i++) {
        uuids.add(randomUUID());
      }
      assert.strictEqual(uuids.size, 100);
    });

    it('should return lowercase string', () => {
      const uuid = randomUUID();
      assert.strictEqual(uuid, uuid.toLowerCase());
    });
  });

  describe('crypto.randomInt()', () => {
    it('should generate random integer with max only', () => {
      for (let i = 0; i < 100; i++) {
        const num = randomInt(10);
        expect(num).toBeGreaterThanOrEqual(0);
        expect(num).toBeLessThan(10);
        expect(Number.isInteger(num)).toBe(true);
      }
    });

    it('should generate random integer in range', () => {
      for (let i = 0; i < 100; i++) {
        const num = randomInt(10, 20);
        expect(num).toBeGreaterThanOrEqual(10);
        expect(num).toBeLessThan(20);
        expect(Number.isInteger(num)).toBe(true);
      }
    });

    it('should handle negative ranges', () => {
      for (let i = 0; i < 100; i++) {
        const num = randomInt(-10, 0);
        expect(num).toBeGreaterThanOrEqual(-10);
        expect(num).toBeLessThan(0);
      }
    });

    it('should handle range of 1', () => {
      const num = randomInt(5, 6);
      assert.strictEqual(num, 5);
    });
  });

  describe('crypto.createHash()', () => {
    describe('SHA-256', () => {
      it('should create hash with update and digest', () => {
        const hash = createHash('sha256');
        hash.update('hello world');
        const digest = hash.digest('hex');
        assert.strictEqual(typeof digest, 'string');
        assert.strictEqual(digest.length, 64); // SHA-256 = 32 bytes = 64 hex chars
      });

      it('should produce consistent hash values', () => {
        const hash1 = createHash('sha256').update('hello').digest('hex');
        const hash2 = createHash('sha256').update('hello').digest('hex');
        assert.strictEqual(hash1, hash2);
      });

      it('should handle empty string', () => {
        const hash = createHash('sha256').update('').digest('hex');
        // Should produce a valid 64-char hex string
        assert.strictEqual(hash.length, 64);
        expect(hash).toMatch(/^[0-9a-f]+$/);
      });
    });

    describe('multiple algorithms', () => {
      it('should handle SHA-1', () => {
        const hash = createHash('sha1').update('test').digest('hex');
        assert.strictEqual(hash.length, 40); // SHA-1 = 20 bytes = 40 hex chars
      });

      it('should handle SHA-384', () => {
        const hash = createHash('sha384').update('test').digest('hex');
        assert.strictEqual(hash.length, 96); // SHA-384 = 48 bytes = 96 hex chars
      });

      it('should handle SHA-512', () => {
        const hash = createHash('sha512').update('test').digest('hex');
        assert.strictEqual(hash.length, 128); // SHA-512 = 64 bytes = 128 hex chars
      });

      it('should handle case-insensitive algorithm names', () => {
        const hash1 = createHash('SHA256').update('test').digest('hex');
        const hash2 = createHash('sha256').update('test').digest('hex');
        assert.strictEqual(hash1, hash2);
      });
    });

    describe('multiple updates', () => {
      it('should handle multiple updates', () => {
        const hash = createHash('sha256');
        hash.update('hello');
        hash.update(' ');
        hash.update('world');
        const digest = hash.digest('hex');

        const singleHash = createHash('sha256').update('hello world').digest('hex');
        assert.strictEqual(digest, singleHash);
      });

      it('should support chained updates', () => {
        const hash = createHash('sha256')
          .update('a')
          .update('b')
          .update('c')
          .digest('hex');

        const expected = createHash('sha256').update('abc').digest('hex');
        assert.strictEqual(hash, expected);
      });
    });

    describe('output encodings', () => {
      it('should return Buffer when no encoding specified', () => {
        const hash = createHash('sha256').update('hello').digest();
        expect(hash).toBeInstanceOf(Uint8Array);
        assert.strictEqual(hash.length, 32);
      });

      it('should support hex encoding', () => {
        const hash = createHash('sha256').update('hello').digest('hex');
        expect(hash).toMatch(/^[0-9a-f]+$/);
      });

      it('should support base64 encoding', () => {
        const hash = createHash('sha256').update('hello').digest('base64');
        expect(typeof hash).toBe('string');
        // Base64 encoded SHA-256 should be 44 chars (with padding)
        assert.strictEqual(hash.length, 44);
      });
    });

    describe('input types', () => {
      it('should accept string input', () => {
        const hash = createHash('sha256').update('hello').digest('hex');
        expect(typeof hash).toBe('string');
      });

      it('should accept Buffer input', () => {
        const buffer = Buffer.from('hello');
        const hash = createHash('sha256').update(buffer).digest('hex');
        const expected = createHash('sha256').update('hello').digest('hex');
        assert.strictEqual(hash, expected);
      });

      it('should accept Uint8Array input', () => {
        const arr = new TextEncoder().encode('hello');
        const hash = createHash('sha256').update(arr).digest('hex');
        const expected = createHash('sha256').update('hello').digest('hex');
        assert.strictEqual(hash, expected);
      });
    });
  });

  describe('crypto.createHmac()', () => {
    it('should create HMAC with SHA-256', () => {
      const hmac = createHmac('sha256', 'secret');
      hmac.update('hello world');
      const digest = hmac.digest('hex');
      expect(typeof digest).toBe('string');
      assert.strictEqual(digest.length, 64);
    });

    it('should produce consistent HMAC values', () => {
      const hmac1 = createHmac('sha256', 'key').update('message').digest('hex');
      const hmac2 = createHmac('sha256', 'key').update('message').digest('hex');
      assert.strictEqual(hmac1, hmac2);
      assert.strictEqual(hmac1.length, 64); // SHA-256 = 64 hex chars
    });

    it('should produce different output with different keys', () => {
      const hmac1 = createHmac('sha256', 'key1').update('data').digest('hex');
      const hmac2 = createHmac('sha256', 'key2').update('data').digest('hex');
      expect(hmac1).not.toBe(hmac2);
    });

    it('should produce consistent output for same key and data', () => {
      const hmac1 = createHmac('sha256', 'key').update('data').digest('hex');
      const hmac2 = createHmac('sha256', 'key').update('data').digest('hex');
      assert.strictEqual(hmac1, hmac2);
    });

    it('should support Buffer key', () => {
      const key = Buffer.from('secret');
      const hmac = createHmac('sha256', key).update('data').digest('hex');
      expect(typeof hmac).toBe('string');
    });

    it('should support multiple updates', () => {
      const hmac1 = createHmac('sha256', 'key')
        .update('hello')
        .update(' ')
        .update('world')
        .digest('hex');

      const hmac2 = createHmac('sha256', 'key').update('hello world').digest('hex');
      assert.strictEqual(hmac1, hmac2);
    });
  });

  describe('crypto.sign() and crypto.verify()', () => {
    const testData = Buffer.from('test message to sign');
    const secretKey = 'my-secret-key';

    it('should sign data with secret key', () => {
      const signature = sign('SHA256', testData, secretKey);
      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature!.length).toBeGreaterThan(0);
    });

    it('should verify signature with same key', () => {
      const signature = sign('SHA256', testData, secretKey);
      const isValid = verify('SHA256', testData, secretKey, signature!);
      assert.strictEqual(isValid, true);
    });

    it('should fail verification with different key', () => {
      const signature = sign('SHA256', testData, secretKey);
      const isValid = verify('SHA256', testData, 'different-key', signature!);
      assert.strictEqual(isValid, false);
    });

    it('should fail verification with different data', () => {
      const signature = sign('SHA256', testData, secretKey);
      const differentData = Buffer.from('different message');
      const isValid = verify('SHA256', differentData, secretKey, signature!);
      assert.strictEqual(isValid, false);
    });

    it('should produce consistent signatures', () => {
      const sig1 = sign('SHA256', testData, secretKey);
      const sig2 = sign('SHA256', testData, secretKey);
      expect(sig1).toEqual(sig2);
    });
  });

  describe('crypto.createSign() and crypto.createVerify()', () => {
    const testData = 'test message to sign';
    const secretKey = 'my-secret-key';

    it('should sign using streaming API', () => {
      const signer = createSign('SHA256');
      signer.update(testData);
      const signature = signer.sign(secretKey);
      expect(signature).toBeDefined();
    });

    it('should verify using streaming API', () => {
      const signer = createSign('SHA256');
      signer.update(testData);
      const signature = signer.sign(secretKey);

      const verifier = createVerify('SHA256');
      verifier.update(testData);
      const isValid = verifier.verify(secretKey, signature as Buffer);
      assert.strictEqual(isValid, true);
    });

    it('should support hex encoding for signature', () => {
      const signer = createSign('SHA256');
      signer.update(testData);
      const signature = signer.sign(secretKey, 'hex');
      expect(typeof signature).toBe('string');
      expect(signature).toMatch(/^[0-9a-f]+$/);
    });

    it('should support base64 encoding for signature', () => {
      const signer = createSign('SHA256');
      signer.update(testData);
      const signature = signer.sign(secretKey, 'base64');
      expect(typeof signature).toBe('string');
    });

    it('should support multiple updates', () => {
      const signer = createSign('SHA256');
      signer.update('hello');
      signer.update(' ');
      signer.update('world');
      const signature = signer.sign(secretKey, 'hex');

      const verifier = createVerify('SHA256');
      verifier.update('hello world');
      const isValid = verifier.verify(secretKey, signature, 'hex');
      assert.strictEqual(isValid, true);
    });
  });

  describe('crypto.timingSafeEqual()', () => {
    it('should return true for equal buffers', () => {
      const a = Buffer.from('hello');
      const b = Buffer.from('hello');
      assert.strictEqual(timingSafeEqual(a, b), true);
    });

    it('should return false for different buffers', () => {
      const a = Buffer.from('hello');
      const b = Buffer.from('world');
      assert.strictEqual(timingSafeEqual(a, b), false);
    });

    it('should return false for different length buffers', () => {
      const a = Buffer.from('hello');
      const b = Buffer.from('hello world');
      assert.strictEqual(timingSafeEqual(a, b), false);
    });

    it('should work with Uint8Array', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3]);
      assert.strictEqual(timingSafeEqual(a, b), true);
    });

    it('should handle empty buffers', () => {
      const a = Buffer.from('');
      const b = Buffer.from('');
      assert.strictEqual(timingSafeEqual(a, b), true);
    });
  });

  describe('crypto.KeyObject', () => {
    it('should create secret key', () => {
      const key = createSecretKey(Buffer.from('secret'));
      expect(key).toBeInstanceOf(KeyObject);
      assert.strictEqual(key.type, 'secret');
    });

    it('should report symmetric key size in bits', () => {
      const key = createSecretKey(Buffer.from('1234567890123456')); // 16 bytes
      assert.strictEqual(key.symmetricKeySize, 128); // 16 * 8 = 128 bits
    });

    it('should export key material', () => {
      const keyData = Buffer.from('secret-key-data');
      const key = createSecretKey(keyData);
      const exported = key.export();
      expect(exported).toEqual(keyData);
    });
  });

  describe('crypto.getHashes()', () => {
    it('should return array of hash algorithms', () => {
      const hashes = getHashes();
      expect(Array.isArray(hashes)).toBe(true);
      expect(hashes.length).toBeGreaterThan(0);
    });

    it('should include common algorithms', () => {
      const hashes = getHashes();
      expect(hashes).toContain('sha256');
      expect(hashes).toContain('sha1');
    });
  });

  describe('crypto.getCiphers()', () => {
    it('should return array of cipher algorithms', () => {
      const ciphers = getCiphers();
      expect(Array.isArray(ciphers)).toBe(true);
    });
  });

  describe('default export', () => {
    it('should export all functions', () => {
      expect(crypto.randomBytes).toBe(randomBytes);
      expect(crypto.randomUUID).toBe(randomUUID);
      expect(crypto.randomInt).toBe(randomInt);
      expect(crypto.createHash).toBe(createHash);
      expect(crypto.createHmac).toBe(createHmac);
      expect(crypto.createSign).toBe(createSign);
      expect(crypto.createVerify).toBe(createVerify);
      expect(crypto.sign).toBe(sign);
      expect(crypto.verify).toBe(verify);
      expect(crypto.timingSafeEqual).toBe(timingSafeEqual);
      expect(crypto.createSecretKey).toBe(createSecretKey);
      expect(crypto.getHashes).toBe(getHashes);
      expect(crypto.getCiphers).toBe(getCiphers);
    });
  });

  describe('crypto.pbkdf2() and crypto.pbkdf2Sync()', () => {
    it('should derive key with callback API', async () => {
      const password = 'password';
      const salt = 'salt';
      const iterations = 1000;
      const keylen = 32;
      const digest = 'sha256';

      const derivedKey = await new Promise<Buffer>((resolve, reject) => {
        pbkdf2(password, salt, iterations, keylen, digest, (err, key) => {
          if (err) reject(err);
          else resolve(key);
        });
      });

      expect(derivedKey).toBeInstanceOf(Uint8Array);
      assert.strictEqual(derivedKey.length, keylen);
    });

    it('should derive consistent keys', async () => {
      const params = {
        password: 'mypassword',
        salt: 'mysalt',
        iterations: 100,
        keylen: 32,
        digest: 'sha256',
      };

      const key1 = await new Promise<Buffer>((resolve, reject) => {
        pbkdf2(params.password, params.salt, params.iterations, params.keylen, params.digest, (err, key) => {
          if (err) reject(err);
          else resolve(key);
        });
      });

      const key2 = await new Promise<Buffer>((resolve, reject) => {
        pbkdf2(params.password, params.salt, params.iterations, params.keylen, params.digest, (err, key) => {
          if (err) reject(err);
          else resolve(key);
        });
      });

      expect(key1).toEqual(key2);
    });

    it('should produce different keys with different passwords', async () => {
      const params = {
        salt: 'salt',
        iterations: 100,
        keylen: 32,
        digest: 'sha256',
      };

      const key1 = await new Promise<Buffer>((resolve, reject) => {
        pbkdf2('password1', params.salt, params.iterations, params.keylen, params.digest, (err, key) => {
          if (err) reject(err);
          else resolve(key);
        });
      });

      const key2 = await new Promise<Buffer>((resolve, reject) => {
        pbkdf2('password2', params.salt, params.iterations, params.keylen, params.digest, (err, key) => {
          if (err) reject(err);
          else resolve(key);
        });
      });

      expect(key1).not.toEqual(key2);
    });

    it('should produce different keys with different salts', async () => {
      const params = {
        password: 'password',
        iterations: 100,
        keylen: 32,
        digest: 'sha256',
      };

      const key1 = await new Promise<Buffer>((resolve, reject) => {
        pbkdf2(params.password, 'salt1', params.iterations, params.keylen, params.digest, (err, key) => {
          if (err) reject(err);
          else resolve(key);
        });
      });

      const key2 = await new Promise<Buffer>((resolve, reject) => {
        pbkdf2(params.password, 'salt2', params.iterations, params.keylen, params.digest, (err, key) => {
          if (err) reject(err);
          else resolve(key);
        });
      });

      expect(key1).not.toEqual(key2);
    });

    it('should handle Buffer inputs', async () => {
      const password = Buffer.from('password');
      const salt = Buffer.from('salt');

      const derivedKey = await new Promise<Buffer>((resolve, reject) => {
        pbkdf2(password, salt, 100, 32, 'sha256', (err, key) => {
          if (err) reject(err);
          else resolve(key);
        });
      });

      expect(derivedKey).toBeInstanceOf(Uint8Array);
      assert.strictEqual(derivedKey.length, 32);
    });

    it('should support different key lengths', async () => {
      const keylens = [16, 32, 64, 128];

      for (const keylen of keylens) {
        const derivedKey = await new Promise<Buffer>((resolve, reject) => {
          pbkdf2('password', 'salt', 100, keylen, 'sha256', (err, key) => {
            if (err) reject(err);
            else resolve(key);
          });
        });

        assert.strictEqual(derivedKey.length, keylen);
      }
    });

    it('should support different hash algorithms', async () => {
      const digests = ['sha1', 'sha256', 'sha384', 'sha512'];

      for (const digest of digests) {
        const derivedKey = await new Promise<Buffer>((resolve, reject) => {
          pbkdf2('password', 'salt', 100, 32, digest, (err, key) => {
            if (err) reject(err);
            else resolve(key);
          });
        });

        assert.strictEqual(derivedKey.length, 32);
      }
    });

    it('pbkdf2Sync should derive key synchronously', () => {
      const derivedKey = pbkdf2Sync('password', 'salt', 100, 32, 'sha256');
      expect(derivedKey).toBeInstanceOf(Uint8Array);
      assert.strictEqual(derivedKey.length, 32);
    });

    it('pbkdf2Sync should produce consistent keys', () => {
      const key1 = pbkdf2Sync('password', 'salt', 100, 32, 'sha256');
      const key2 = pbkdf2Sync('password', 'salt', 100, 32, 'sha256');
      expect(key1).toEqual(key2);
    });
  });

  describe('edge cases', () => {
    it('should handle unicode in hash input', () => {
      const hash = createHash('sha256').update('中文').digest('hex');
      expect(typeof hash).toBe('string');
      assert.strictEqual(hash.length, 64);
    });

    it('should handle binary data in hash', () => {
      const binary = new Uint8Array([0, 1, 2, 255, 254, 253]);
      const hash = createHash('sha256').update(binary).digest('hex');
      expect(typeof hash).toBe('string');
      assert.strictEqual(hash.length, 64);
    });

    it('should handle large inputs', () => {
      const largeInput = 'x'.repeat(10000);
      const hash = createHash('sha256').update(largeInput).digest('hex');
      expect(typeof hash).toBe('string');
      assert.strictEqual(hash.length, 64);
    });
  });
});
