/**
 * async_hooks shim - Async tracking is not available in browser
 */

export class AsyncResource {
  constructor(_type: string, _options?: object) {}

  runInAsyncScope<T>(fn: (...args: unknown[]) => T, thisArg?: unknown, ...args: unknown[]): T {
    return fn.apply(thisArg, args);
  }

  emitDestroy(): this { return this; }
  asyncId(): number { return 0; }
  triggerAsyncId(): number { return 0; }

  static bind<T extends (...args: unknown[]) => unknown>(fn: T, _type?: string): T {
    return fn;
  }
}

export class AsyncLocalStorage<T> {
  private store: T | undefined;

  disable(): void {}

  getStore(): T | undefined {
    return this.store;
  }

  run<R>(store: T, callback: () => R): R {
    const prev = this.store;
    this.store = store;
    try {
      return callback();
    } finally {
      this.store = prev;
    }
  }

  exit<R>(callback: () => R): R {
    const prev = this.store;
    this.store = undefined;
    try {
      return callback();
    } finally {
      this.store = prev;
    }
  }

  enterWith(store: T): void {
    this.store = store;
  }
}

export interface AsyncHook {
  enable(): this;
  disable(): this;
}

export function createHook(_callbacks: object): AsyncHook {
  return {
    enable(): AsyncHook { return this; },
    disable(): AsyncHook { return this; },
  };
}

export function executionAsyncId(): number {
  return 0;
}

export function executionAsyncResource(): object {
  return {};
}

export function triggerAsyncId(): number {
  return 0;
}

export default {
  AsyncResource,
  AsyncLocalStorage,
  createHook,
  executionAsyncId,
  executionAsyncResource,
  triggerAsyncId,
};
