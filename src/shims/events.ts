/**
 * Node.js EventEmitter shim
 * Basic event emitter implementation for browser environment
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventListener = (...args: any[]) => void;

// Symbol for storing events on arbitrary objects (like Express app function)
const kEvents = Symbol('events');
const kMaxListeners = Symbol('maxListeners');

interface EventStorage {
  [kEvents]?: Map<string, EventListener[]>;
  [kMaxListeners]?: number;
}

export class EventEmitter {
  [kEvents]?: Map<string, EventListener[]>;
  [kMaxListeners]?: number;

  // Helper to get events map, creating it if needed
  private _getEvents(): Map<string, EventListener[]> {
    const self = this as EventStorage;
    if (!self[kEvents]) {
      self[kEvents] = new Map();
    }
    return self[kEvents]!;
  }

  on(event: string, listener: EventListener): this {
    return this.addListener(event, listener);
  }

  addListener(event: string, listener: EventListener): this {
    const events = this._getEvents();
    if (!events.has(event)) {
      events.set(event, []);
    }
    events.get(event)!.push(listener);
    return this;
  }

  once(event: string, listener: EventListener): this {
    const onceWrapper = (...args: unknown[]) => {
      this.removeListener(event, onceWrapper);
      listener.apply(this, args);
    };
    return this.addListener(event, onceWrapper);
  }

  off(event: string, listener: EventListener): this {
    return this.removeListener(event, listener);
  }

  removeListener(event: string, listener: EventListener): this {
    const events = this._getEvents();
    const listeners = events.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }

  removeAllListeners(event?: string): this {
    const events = this._getEvents();
    if (event) {
      events.delete(event);
    } else {
      events.clear();
    }
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const events = this._getEvents();
    const listeners = events.get(event);
    if (!listeners || listeners.length === 0) {
      // Special handling for 'error' event
      if (event === 'error') {
        const err = args[0];
        if (err instanceof Error) {
          throw err;
        }
        throw new Error('Unhandled error event');
      }
      return false;
    }

    for (const listener of [...listeners]) {
      try {
        listener.apply(this, args);
      } catch (err) {
        console.error('Error in event listener:', err);
      }
    }
    return true;
  }

  listeners(event: string): EventListener[] {
    const events = this._getEvents();
    return [...(events.get(event) || [])];
  }

  rawListeners(event: string): EventListener[] {
    return this.listeners(event);
  }

  listenerCount(event: string): number {
    const events = this._getEvents();
    return events.get(event)?.length || 0;
  }

  eventNames(): string[] {
    const events = this._getEvents();
    return [...events.keys()];
  }

  setMaxListeners(n: number): this {
    (this as EventStorage)[kMaxListeners] = n;
    return this;
  }

  getMaxListeners(): number {
    return (this as EventStorage)[kMaxListeners] || 10;
  }

  prependListener(event: string, listener: EventListener): this {
    const events = this._getEvents();
    if (!events.has(event)) {
      events.set(event, []);
    }
    events.get(event)!.unshift(listener);
    return this;
  }

  prependOnceListener(event: string, listener: EventListener): this {
    const onceWrapper = (...args: unknown[]) => {
      this.removeListener(event, onceWrapper);
      listener.apply(this, args);
    };
    return this.prependListener(event, onceWrapper);
  }

  // Static methods for compatibility
  static listenerCount(emitter: EventEmitter, event: string): number {
    return emitter.listenerCount(event);
  }
}

// For Node.js compatibility, the module itself should be the EventEmitter class
// but also have EventEmitter as a property
// This allows both: `const EE = require('events')` and `const { EventEmitter } = require('events')`
const events = EventEmitter as typeof EventEmitter & {
  EventEmitter: typeof EventEmitter;
  once: (emitter: EventEmitter, event: string) => Promise<unknown[]>;
  on: (emitter: EventEmitter, event: string) => AsyncIterable<unknown[]>;
  getEventListeners: (emitter: EventEmitter, event: string) => EventListener[];
  listenerCount: (emitter: EventEmitter, event: string) => number;
};

events.EventEmitter = EventEmitter;
events.once = async (emitter: EventEmitter, event: string): Promise<unknown[]> => {
  return new Promise((resolve, reject) => {
    const onEvent: EventListener = (...args: unknown[]) => {
      emitter.removeListener('error', onError);
      resolve(args);
    };
    const onError: EventListener = (...args: unknown[]) => {
      emitter.removeListener(event, onEvent);
      reject(args[0] as Error);
    };
    emitter.once(event, onEvent);
    emitter.once('error', onError);
  });
};
events.on = (emitter: EventEmitter, event: string) => {
  const iterator = {
    async next() {
      return new Promise<{ value: unknown[]; done: boolean }>((resolve) => {
        emitter.once(event, (...args) => resolve({ value: args, done: false }));
      });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  return iterator as AsyncIterable<unknown[]>;
};
events.getEventListeners = (emitter: EventEmitter, event: string) => emitter.listeners(event);
events.listenerCount = (emitter: EventEmitter, event: string) => emitter.listenerCount(event);

export default events;
