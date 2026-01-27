/**
 * Node.js util module shim
 * Basic utility functions
 */

export function format(fmt: string, ...args: unknown[]): string {
  if (typeof fmt !== 'string') {
    return args.map((arg) => inspect(arg)).join(' ');
  }

  let i = 0;
  return fmt.replace(/%[sdjifoO%]/g, (match) => {
    if (match === '%%') return '%';
    if (i >= args.length) return match;

    const arg = args[i++];

    switch (match) {
      case '%s':
        return String(arg);
      case '%d':
      case '%i':
        return String(parseInt(String(arg), 10));
      case '%f':
        return String(parseFloat(String(arg)));
      case '%j':
        try {
          return JSON.stringify(arg);
        } catch {
          return '[Circular]';
        }
      case '%o':
      case '%O':
        return inspect(arg);
      default:
        return match;
    }
  });
}

export function inspect(obj: unknown, options?: { depth?: number; colors?: boolean }): string {
  const seen = new WeakSet();
  const depth = options?.depth ?? 2;

  function inspectValue(value: unknown, currentDepth: number): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    const type = typeof value;

    if (type === 'string') {
      return `'${value}'`;
    }

    if (type === 'number' || type === 'boolean' || type === 'bigint') {
      return String(value);
    }

    if (type === 'symbol') {
      return value.toString();
    }

    if (type === 'function') {
      const name = (value as Function).name || 'anonymous';
      return `[Function: ${name}]`;
    }

    if (type !== 'object') {
      return String(value);
    }

    // Handle circular references
    if (seen.has(value as object)) {
      return '[Circular]';
    }
    seen.add(value as object);

    if (currentDepth > depth) {
      return Array.isArray(value) ? '[Array]' : '[Object]';
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      const items = value.map((v) => inspectValue(v, currentDepth + 1));
      return `[ ${items.join(', ')} ]`;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof RegExp) {
      return value.toString();
    }

    if (value instanceof Error) {
      return `${value.name}: ${value.message}`;
    }

    if (value instanceof Map) {
      const entries = [...value.entries()].map(
        ([k, v]) => `${inspectValue(k, currentDepth + 1)} => ${inspectValue(v, currentDepth + 1)}`
      );
      return `Map(${value.size}) { ${entries.join(', ')} }`;
    }

    if (value instanceof Set) {
      const items = [...value].map((v) => inspectValue(v, currentDepth + 1));
      return `Set(${value.size}) { ${items.join(', ')} }`;
    }

    // Plain object
    const keys = Object.keys(value as object);
    if (keys.length === 0) return '{}';

    const entries = keys.map((key) => {
      const val = (value as Record<string, unknown>)[key];
      return `${key}: ${inspectValue(val, currentDepth + 1)}`;
    });

    return `{ ${entries.join(', ')} }`;
  }

  return inspectValue(obj, 0);
}

export function inherits(
  ctor: Function,
  superCtor: Function
): void {
  if (ctor === undefined || ctor === null) {
    throw new TypeError('inherits: ctor must be a function');
  }
  if (superCtor === undefined || superCtor === null) {
    // Some packages call inherits with undefined as a no-op, just return
    return;
  }
  if (superCtor.prototype === undefined) {
    // Skip if superCtor doesn't have a prototype
    return;
  }
  (ctor as any).super_ = superCtor;
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
}

export function deprecate<T extends Function>(
  fn: T,
  msg: string,
  code?: string
): T {
  let warned = false;
  const deprecated = function (this: unknown, ...args: unknown[]) {
    if (!warned) {
      console.warn(`DeprecationWarning: ${msg}${code ? ` (${code})` : ''}`);
      warned = true;
    }
    return fn.apply(this, args);
  };
  return deprecated as unknown as T;
}

export function promisify<T>(
  fn: (...args: [...unknown[], (err: Error | null, result: T) => void]) => void
): (...args: unknown[]) => Promise<T> {
  return (...args: unknown[]) => {
    return new Promise((resolve, reject) => {
      fn(...args, (err: Error | null, result: T) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  };
}

export function callbackify<T>(
  fn: (...args: unknown[]) => Promise<T>
): (...args: [...unknown[], (err: Error | null, result: T) => void]) => void {
  return (...args: unknown[]) => {
    const callback = args.pop() as (err: Error | null, result: T) => void;
    fn(...args)
      .then((result) => callback(null, result))
      .catch((err) => callback(err, undefined as unknown as T));
  };
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isNull(value: unknown): value is null {
  return value === null;
}

export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

export function isRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp;
}

export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

export function isPrimitive(value: unknown): boolean {
  return value === null || (typeof value !== 'object' && typeof value !== 'function');
}

export function isBuffer(value: unknown): boolean {
  return value instanceof Uint8Array;
}

export const types = {
  isArray,
  isBoolean,
  isNull,
  isNullOrUndefined,
  isNumber,
  isString,
  isUndefined,
  isRegExp,
  isObject,
  isDate,
  isError,
  isFunction,
  isPrimitive,
  isBuffer,
};

export default {
  format,
  inspect,
  inherits,
  deprecate,
  promisify,
  callbackify,
  isArray,
  isBoolean,
  isNull,
  isNullOrUndefined,
  isNumber,
  isString,
  isUndefined,
  isRegExp,
  isObject,
  isDate,
  isError,
  isFunction,
  isPrimitive,
  isBuffer,
  types,
};
