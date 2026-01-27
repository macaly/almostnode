/**
 * Node.js crypto module shim
 * Provides basic cryptographic utilities using Web Crypto API
 */

import { Buffer } from './stream';

export function randomBytes(size: number): Buffer {
  const array = new Uint8Array(size);
  crypto.getRandomValues(array);
  return Buffer.from(array);
}

export function randomUUID(): string {
  return crypto.randomUUID();
}

export function randomInt(min: number, max?: number): number {
  if (max === undefined) {
    max = min;
    min = 0;
  }
  const range = max - min;
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return min + (array[0] % range);
}

export function createHash(algorithm: string): Hash {
  return new Hash(algorithm);
}

export function createHmac(algorithm: string, key: string | Buffer): Hmac {
  return new Hmac(algorithm, key);
}

class Hash {
  private algorithm: string;
  private data: Uint8Array[] = [];

  constructor(algorithm: string) {
    this.algorithm = algorithm.toUpperCase().replace('-', '');
  }

  update(data: string | Buffer, encoding?: string): this {
    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    this.data.push(buffer);
    return this;
  }

  async digestAsync(encoding?: string): Promise<string | Buffer> {
    const combined = new Uint8Array(
      this.data.reduce((acc, arr) => acc + arr.length, 0)
    );
    let offset = 0;
    for (const arr of this.data) {
      combined.set(arr, offset);
      offset += arr.length;
    }

    let algorithmName: string;
    switch (this.algorithm) {
      case 'SHA1':
        algorithmName = 'SHA-1';
        break;
      case 'SHA256':
        algorithmName = 'SHA-256';
        break;
      case 'SHA384':
        algorithmName = 'SHA-384';
        break;
      case 'SHA512':
        algorithmName = 'SHA-512';
        break;
      default:
        throw new Error(`Unsupported algorithm: ${this.algorithm}`);
    }

    const hashBuffer = await crypto.subtle.digest(algorithmName, combined);
    const hashArray = new Uint8Array(hashBuffer);

    if (encoding === 'hex') {
      return Array.from(hashArray)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    if (encoding === 'base64') {
      return btoa(String.fromCharCode(...hashArray));
    }

    return Buffer.from(hashArray);
  }

  digest(encoding?: string): string | Buffer {
    // Synchronous digest - uses a simple fallback
    const combined = Buffer.concat(this.data);

    // For synchronous operation, we use a simple non-crypto hash
    // This is a limitation of the browser environment
    let hash = 0;
    const str = combined.toString();
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    const hashStr = Math.abs(hash).toString(16).padStart(8, '0');

    if (encoding === 'hex') {
      return hashStr.repeat(4).slice(0, 32);
    }
    if (encoding === 'base64') {
      return btoa(hashStr);
    }

    return Buffer.from(hashStr);
  }
}

class Hmac {
  private algorithm: string;
  private key: Buffer;
  private data: Uint8Array[] = [];

  constructor(algorithm: string, key: string | Buffer) {
    this.algorithm = algorithm.toUpperCase().replace('-', '');
    this.key = typeof key === 'string' ? Buffer.from(key) : key;
  }

  update(data: string | Buffer, encoding?: string): this {
    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    this.data.push(buffer);
    return this;
  }

  digest(encoding?: string): string | Buffer {
    // Simplified HMAC - in production would use Web Crypto API
    const combined = Buffer.concat(this.data);
    const keyStr = this.key.toString();
    const dataStr = combined.toString();

    let hash = 0;
    const str = keyStr + dataStr;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    const hashStr = Math.abs(hash).toString(16).padStart(8, '0');

    if (encoding === 'hex') {
      return hashStr.repeat(4).slice(0, 32);
    }
    if (encoding === 'base64') {
      return btoa(hashStr);
    }

    return Buffer.from(hashStr);
  }
}

export function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

export const constants = {
  SSL_OP_ALL: 0,
};

export default {
  randomBytes,
  randomUUID,
  randomInt,
  createHash,
  createHmac,
  timingSafeEqual,
  constants,
};
