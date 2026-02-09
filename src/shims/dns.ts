/**
 * dns shim - DNS operations are not available in browser
 * Provides stubs that work for basic use cases
 */

// DNS lookup callback type
type LookupCallback = (err: Error | null, address?: string, family?: number) => void;
type LookupAllCallback = (err: Error | null, addresses?: Array<{ address: string; family: number }>) => void;

/**
 * Lookup a hostname - returns localhost in browser
 */
export function lookup(
  hostname: string,
  callback: LookupCallback
): void;
export function lookup(
  hostname: string,
  options: { family?: number; all?: true },
  callback: LookupAllCallback
): void;
export function lookup(
  hostname: string,
  options: { family?: number; all?: boolean },
  callback: LookupCallback | LookupAllCallback
): void;
export function lookup(
  hostname: string,
  optionsOrCallback: { family?: number; all?: boolean } | LookupCallback,
  callback?: LookupCallback | LookupAllCallback
): void {
  const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
  const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : {};

  // In browser, we can't do real DNS lookups
  // Return localhost for localhost, or a fake IP for other hostnames
  setImmediate(() => {
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      if (options.all) {
        (cb as LookupAllCallback)(null, [{ address: '127.0.0.1', family: 4 }]);
      } else {
        (cb as LookupCallback)(null, '127.0.0.1', 4);
      }
    } else {
      // For other hostnames, we can't resolve them in browser
      // Return an error or a placeholder
      if (options.all) {
        (cb as LookupAllCallback)(null, [{ address: '0.0.0.0', family: 4 }]);
      } else {
        (cb as LookupCallback)(null, '0.0.0.0', 4);
      }
    }
  });
}

/**
 * Resolve hostname - stub
 */
export function resolve(
  hostname: string,
  callback: (err: Error | null, addresses?: string[]) => void
): void {
  setImmediate(() => {
    callback(null, ['0.0.0.0']);
  });
}

export function resolve4(
  hostname: string,
  callback: (err: Error | null, addresses?: string[]) => void
): void {
  resolve(hostname, callback);
}

export function resolve6(
  hostname: string,
  callback: (err: Error | null, addresses?: string[]) => void
): void {
  setImmediate(() => {
    callback(null, ['::1']);
  });
}

/**
 * Reverse lookup - stub
 */
export function reverse(
  ip: string,
  callback: (err: Error | null, hostnames?: string[]) => void
): void {
  setImmediate(() => {
    callback(null, ['localhost']);
  });
}

/**
 * Set servers - no-op in browser
 */
export function setServers(_servers: string[]): void {
  // No-op
}

/**
 * Get servers - return empty in browser
 */
export function getServers(): string[] {
  return [];
}

/**
 * Set default result order - no-op in browser
 * Order can be 'ipv4first', 'ipv6first', or 'verbatim'
 */
export function setDefaultResultOrder(_order: string): void {
  // No-op in browser
}

/**
 * Get default result order
 */
export function getDefaultResultOrder(): string {
  return 'verbatim';
}

// Promises API
export const promises = {
  lookup: (hostname: string, options?: { family?: number; all?: boolean }) => {
    return new Promise((resolve, reject) => {
      if (options?.all) {
        lookup(hostname, options, ((err: Error | null, addresses?: Array<{ address: string; family: number }>) => {
          if (err) reject(err);
          else resolve(addresses || []);
        }) as LookupAllCallback);
        return;
      }

      lookup(hostname, options || {}, (err, address, family) => {
        if (err) reject(err);
        else resolve({ address, family });
      });
    });
  },
  resolve: (hostname: string) => {
    return new Promise<string[]>((promiseResolve, promiseReject) => {
      resolve(hostname, (err, addresses) => {
        if (err) promiseReject(err);
        else promiseResolve(addresses || []);
      });
    });
  },
  resolve4: (hostname: string) => promises.resolve(hostname),
  resolve6: (hostname: string) => {
    return new Promise<string[]>((resolve) => {
      resolve(['::1']);
    });
  },
  reverse: (ip: string) => {
    return new Promise<string[]>((resolve) => {
      resolve(['localhost']);
    });
  },
  setServers: (_servers: string[]) => {},
  getServers: () => [] as string[],
};

// Constants
export const ADDRCONFIG = 0;
export const V4MAPPED = 0;
export const ALL = 0;

export default {
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
};
