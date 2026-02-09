/**
 * Node.js dns module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-dns-*.js
 *
 * Note: Browser environments cannot perform real OS DNS resolution.
 */

import { describe, it, expect } from 'vitest';
import dns, {
  lookup,
  resolve,
  resolve4,
  resolve6,
  reverse,
  setServers,
  getServers,
  setDefaultResultOrder,
  getDefaultResultOrder,
  promises,
  ADDRCONFIG,
  V4MAPPED,
  ALL,
} from '../../src/shims/dns';
import { assert } from './common';

describe('dns module (Node.js compat)', () => {
  describe('exports', () => {
    it('should export callback API methods', () => {
      expect(typeof lookup).toBe('function');
      expect(typeof resolve).toBe('function');
      expect(typeof resolve4).toBe('function');
      expect(typeof resolve6).toBe('function');
      expect(typeof reverse).toBe('function');
    });

    it('should export server/result-order helpers', () => {
      expect(typeof setServers).toBe('function');
      expect(typeof getServers).toBe('function');
      expect(typeof setDefaultResultOrder).toBe('function');
      expect(typeof getDefaultResultOrder).toBe('function');
    });

    it('should export promises API object', () => {
      expect(typeof promises).toBe('object');
      expect(typeof promises.lookup).toBe('function');
      expect(typeof promises.resolve).toBe('function');
      expect(typeof promises.resolve4).toBe('function');
      expect(typeof promises.resolve6).toBe('function');
      expect(typeof promises.reverse).toBe('function');
    });

    it('should export constants', () => {
      expect(typeof ADDRCONFIG).toBe('number');
      expect(typeof V4MAPPED).toBe('number');
      expect(typeof ALL).toBe('number');
    });
  });

  describe('lookup()', () => {
    it('should resolve localhost to 127.0.0.1', async () => {
      const result = await new Promise<{ address?: string; family?: number }>((resolvePromise) => {
        lookup('localhost', (err, address, family) => {
          expect(err).toBeNull();
          resolvePromise({ address, family });
        });
      });

      assert.strictEqual(result.address, '127.0.0.1');
      assert.strictEqual(result.family, 4);
    });

    it('should resolve 127.0.0.1 as localhost address', async () => {
      const result = await new Promise<{ address?: string; family?: number }>((resolvePromise) => {
        lookup('127.0.0.1', (err, address, family) => {
          expect(err).toBeNull();
          resolvePromise({ address, family });
        });
      });

      assert.strictEqual(result.address, '127.0.0.1');
      assert.strictEqual(result.family, 4);
    });

    it('should return placeholder address for non-local hostnames', async () => {
      const result = await new Promise<{ address?: string; family?: number }>((resolvePromise) => {
        lookup('example.com', (err, address, family) => {
          expect(err).toBeNull();
          resolvePromise({ address, family });
        });
      });

      assert.strictEqual(result.address, '0.0.0.0');
      assert.strictEqual(result.family, 4);
    });

    it('lookup({ all: true }) should return address objects', async () => {
      const addresses = await new Promise<Array<{ address: string; family: number }>>((resolvePromise) => {
        lookup('localhost', { all: true }, (err: any, allAddresses: any) => {
          expect(err).toBeNull();
          resolvePromise(allAddresses || []);
        });
      });

      expect(addresses.length).toBeGreaterThan(0);
      assert.strictEqual(addresses[0].address, '127.0.0.1');
      assert.strictEqual(addresses[0].family, 4);
    });
  });

  describe('resolve* callbacks', () => {
    it('resolve() should return placeholder IPv4 list', async () => {
      const addresses = await new Promise<string[]>((resolvePromise) => {
        resolve('example.com', (err, result) => {
          expect(err).toBeNull();
          resolvePromise(result || []);
        });
      });

      expect(addresses).toEqual(['0.0.0.0']);
    });

    it('resolve4() should return placeholder IPv4 list', async () => {
      const addresses = await new Promise<string[]>((resolvePromise) => {
        resolve4('example.com', (err, result) => {
          expect(err).toBeNull();
          resolvePromise(result || []);
        });
      });

      expect(addresses).toEqual(['0.0.0.0']);
    });

    it('resolve6() should return placeholder IPv6 list', async () => {
      const addresses = await new Promise<string[]>((resolvePromise) => {
        resolve6('example.com', (err, result) => {
          expect(err).toBeNull();
          resolvePromise(result || []);
        });
      });

      expect(addresses).toEqual(['::1']);
    });

    it('reverse() should return localhost hostname', async () => {
      const hostnames = await new Promise<string[]>((resolvePromise) => {
        reverse('127.0.0.1', (err, result) => {
          expect(err).toBeNull();
          resolvePromise(result || []);
        });
      });

      expect(hostnames).toEqual(['localhost']);
    });
  });

  describe('servers and result order', () => {
    it('setServers() should be callable', () => {
      assert.doesNotThrow(() => setServers(['8.8.8.8']));
    });

    it('getServers() should return array', () => {
      const servers = getServers();
      expect(Array.isArray(servers)).toBe(true);
      expect(servers).toEqual([]);
    });

    it('setDefaultResultOrder() should be callable', () => {
      assert.doesNotThrow(() => setDefaultResultOrder('verbatim'));
      assert.doesNotThrow(() => setDefaultResultOrder('ipv4first'));
      assert.doesNotThrow(() => setDefaultResultOrder('ipv6first'));
    });

    it('getDefaultResultOrder() should return verbatim', () => {
      assert.strictEqual(getDefaultResultOrder(), 'verbatim');
    });
  });

  describe('promises API', () => {
    it('promises.lookup(host) should return address object', async () => {
      const result = await promises.lookup('localhost');
      expect(typeof result).toBe('object');
      const addr = result as { address: string; family: number };
      assert.strictEqual(addr.address, '127.0.0.1');
      assert.strictEqual(addr.family, 4);
    });

    it('promises.lookup(host, { all: true }) should return address list', async () => {
      const result = await promises.lookup('localhost', { all: true });
      expect(Array.isArray(result)).toBe(true);
      const addresses = result as Array<{ address: string; family: number }>;
      expect(addresses.length).toBeGreaterThan(0);
      assert.strictEqual(addresses[0].address, '127.0.0.1');
      assert.strictEqual(addresses[0].family, 4);
    });

    it('promises.resolve() should return IPv4 list', async () => {
      await expect(promises.resolve('example.com')).resolves.toEqual(['0.0.0.0']);
    });

    it('promises.resolve4() should return IPv4 list', async () => {
      await expect(promises.resolve4('example.com')).resolves.toEqual(['0.0.0.0']);
    });

    it('promises.resolve6() should return IPv6 list', async () => {
      await expect(promises.resolve6('example.com')).resolves.toEqual(['::1']);
    });

    it('promises.reverse() should return localhost hostname', async () => {
      await expect(promises.reverse('127.0.0.1')).resolves.toEqual(['localhost']);
    });

    it('promises server helpers should be callable', () => {
      assert.doesNotThrow(() => promises.setServers(['1.1.1.1']));
      expect(promises.getServers()).toEqual([]);
    });
  });

  describe('default export', () => {
    it('should expose key APIs', () => {
      expect(dns.lookup).toBe(lookup);
      expect(dns.resolve).toBe(resolve);
      expect(dns.promises).toBe(promises);
      expect(dns.ADDRCONFIG).toBe(ADDRCONFIG);
    });
  });

  describe('known limitations (documented)', () => {
    it.skip('should resolve public hostnames using real DNS infrastructure', async () => {
      const result = await promises.lookup('nodejs.org');
      const addr = result as { address: string };
      expect(addr.address).not.toBe('0.0.0.0');
    });

    it.skip('should return Node-style DNS error codes (e.g. ENOTFOUND)', async () => {
      await expect(promises.resolve('definitely-not-a-real-domain.invalid')).rejects.toMatchObject({
        code: 'ENOTFOUND',
      });
    });
  });
});
