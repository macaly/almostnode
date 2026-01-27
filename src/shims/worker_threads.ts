/**
 * worker_threads shim - Worker threads API
 * Stub implementation for browser environment
 */

import { EventEmitter } from './events';

export const isMainThread = true;
export const parentPort = null;
export const workerData = null;
export const threadId = 0;

export class Worker extends EventEmitter {
  threadId = 0;
  resourceLimits = {};

  constructor(filename: string, options?: { workerData?: unknown }) {
    super();
    console.warn('Worker threads are not fully supported in browser environment');
  }

  postMessage(value: unknown, transferList?: unknown[]): void {
    // No-op
  }

  terminate(): Promise<number> {
    return Promise.resolve(0);
  }

  ref(): void {}
  unref(): void {}

  getHeapSnapshot(): Promise<unknown> {
    return Promise.resolve({});
  }
}

export class MessageChannel {
  port1 = new MessagePort();
  port2 = new MessagePort();
}

export class MessagePort extends EventEmitter {
  postMessage(value: unknown, transferList?: unknown[]): void {
    // No-op
  }

  start(): void {}
  close(): void {}
  ref(): void {}
  unref(): void {}
}

export class BroadcastChannel extends EventEmitter {
  name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  postMessage(message: unknown): void {
    // No-op in single-threaded environment
  }

  close(): void {}
  ref(): void {}
  unref(): void {}
}

export function moveMessagePortToContext(
  port: MessagePort,
  contextifiedSandbox: unknown
): MessagePort {
  return port;
}

export function receiveMessageOnPort(port: MessagePort): { message: unknown } | undefined {
  return undefined;
}

export const SHARE_ENV = Symbol.for('nodejs.worker_threads.SHARE_ENV');

export function markAsUntransferable(object: unknown): void {
  // No-op
}

export function getEnvironmentData(key: unknown): unknown {
  return undefined;
}

export function setEnvironmentData(key: unknown, value: unknown): void {
  // No-op
}

export default {
  isMainThread,
  parentPort,
  workerData,
  threadId,
  Worker,
  MessageChannel,
  MessagePort,
  BroadcastChannel,
  moveMessagePortToContext,
  receiveMessageOnPort,
  SHARE_ENV,
  markAsUntransferable,
  getEnvironmentData,
  setEnvironmentData,
};
