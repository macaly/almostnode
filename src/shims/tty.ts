/**
 * Node.js tty module shim
 * Provides terminal detection utilities
 */

import { Readable, Writable } from './stream';

export class ReadStream extends Readable {
  isTTY: boolean = false;
  isRaw: boolean = false;

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }
}

export class WriteStream extends Writable {
  isTTY: boolean = false;
  columns: number = 80;
  rows: number = 24;

  clearLine(dir: number, callback?: () => void): boolean {
    if (callback) callback();
    return true;
  }

  clearScreenDown(callback?: () => void): boolean {
    if (callback) callback();
    return true;
  }

  cursorTo(x: number, y?: number, callback?: () => void): boolean {
    if (callback) callback();
    return true;
  }

  moveCursor(dx: number, dy: number, callback?: () => void): boolean {
    if (callback) callback();
    return true;
  }

  getColorDepth(env?: object): number {
    return 1; // No color support in browser
  }

  hasColors(count?: number | object, env?: object): boolean {
    return false;
  }

  getWindowSize(): [number, number] {
    return [this.columns, this.rows];
  }
}

export function isatty(fd: number): boolean {
  return false; // Browser is never a TTY
}

export default {
  ReadStream,
  WriteStream,
  isatty,
};
