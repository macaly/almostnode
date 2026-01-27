/**
 * Node.js buffer module shim
 * Provides Buffer class for browser environment
 */

// Re-export Buffer from stream where it's defined
import { Buffer as BufferClass } from './stream';

// The buffer module exports Buffer as a named export
export const Buffer = BufferClass;

// SlowBuffer is deprecated but some packages still use it
export const SlowBuffer = BufferClass;

// kMaxLength is the maximum size of a Buffer
export const kMaxLength = 2147483647;

// INSPECT_MAX_BYTES controls how many bytes are shown when calling inspect()
export const INSPECT_MAX_BYTES = 50;

// Constants for Buffer pooling
export const constants = {
  MAX_LENGTH: kMaxLength,
  MAX_STRING_LENGTH: 536870888,
};

// transcode function - simplified
export function transcode(
  source: Uint8Array,
  fromEnc: string,
  toEnc: string
): Buffer {
  // Simplified - just return a copy
  return Buffer.from(source);
}

// resolveObjectURL - returns undefined (no blob support)
export function resolveObjectURL(id: string): undefined {
  return undefined;
}

// atob and btoa wrappers
export function atob(data: string): string {
  return globalThis.atob(data);
}

export function btoa(data: string): string {
  return globalThis.btoa(data);
}

// Default export as a plain object with all exports
// Using Object.create(null) and then assigning doesn't work well,
// so we use a regular object that has hasOwnProperty
const bufferModule: Record<string, unknown> = {
  Buffer,
  SlowBuffer,
  kMaxLength,
  INSPECT_MAX_BYTES,
  constants,
  transcode,
  resolveObjectURL,
  atob,
  btoa,
};

// Ensure hasOwnProperty is accessible (should already be from Object.prototype)
// but we make it explicit
Object.defineProperty(bufferModule, 'hasOwnProperty', {
  value: Object.prototype.hasOwnProperty,
  enumerable: false,
  configurable: true,
  writable: true,
});

export default bufferModule;
