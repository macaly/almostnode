/**
 * readline shim - Terminal readline is not available in browser
 * Provides stubs for common usage patterns
 */

import { EventEmitter } from './events';

export interface ReadLineOptions {
  input?: unknown;
  output?: unknown;
  terminal?: boolean;
  prompt?: string;
}

export class Interface extends EventEmitter {
  private promptText: string;

  constructor(_options?: ReadLineOptions) {
    super();
    this.promptText = _options?.prompt ?? '';
  }

  prompt(_preserveCursor?: boolean): void {
    // No-op in browser
  }

  setPrompt(prompt: string): void {
    this.promptText = prompt;
  }

  getPrompt(): string {
    return this.promptText;
  }

  question(_query: string, callback: (answer: string) => void): void {
    // In browser, we can't get input - just call callback with empty
    setTimeout(() => callback(''), 0);
  }

  pause(): this {
    return this;
  }

  resume(): this {
    return this;
  }

  close(): void {
    this.emit('close');
  }

  write(_data: string, _key?: { ctrl?: boolean; name?: string }): void {
    // No-op
  }

  line: string = '';
  cursor: number = 0;

  getCursorPos(): { rows: number; cols: number } {
    return { rows: 0, cols: 0 };
  }
}

export function createInterface(options?: ReadLineOptions): Interface {
  return new Interface(options);
}

export function clearLine(_stream: unknown, _dir: number, _callback?: () => void): boolean {
  _callback?.();
  return true;
}

export function clearScreenDown(_stream: unknown, _callback?: () => void): boolean {
  _callback?.();
  return true;
}

export function cursorTo(_stream: unknown, _x: number, _y?: number, _callback?: () => void): boolean {
  _callback?.();
  return true;
}

export function moveCursor(_stream: unknown, _dx: number, _dy: number, _callback?: () => void): boolean {
  _callback?.();
  return true;
}

export function emitKeypressEvents(_stream: unknown, _interface?: Interface): void {
  // No-op
}

// Promises API
export const promises = {
  createInterface: (options?: ReadLineOptions) => {
    const rl = createInterface(options);
    return {
      question: (query: string) => new Promise<string>((resolve) => {
        rl.question(query, resolve);
      }),
      close: () => rl.close(),
      [Symbol.asyncIterator]: async function* () {
        // No lines in browser
      },
    };
  },
};

export default {
  Interface,
  createInterface,
  clearLine,
  clearScreenDown,
  cursorTo,
  moveCursor,
  emitKeypressEvents,
  promises,
};
