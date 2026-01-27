/**
 * cluster shim - Clustering is not available in browser
 */

import { EventEmitter } from './events';

export const isMaster = true;
export const isPrimary = true;
export const isWorker = false;

export class Worker extends EventEmitter {
  id = 0;
  process = null;
  send(_message: unknown, _callback?: (error: Error | null) => void): boolean {
    return false;
  }
  kill(_signal?: string): void {}
  disconnect(): void {}
  isDead(): boolean { return false; }
  isConnected(): boolean { return false; }
}

export const worker: Worker | null = null;
export const workers: Record<number, Worker> = {};

export function fork(_env?: object): Worker {
  return new Worker();
}

export function disconnect(_callback?: () => void): void {
  if (_callback) setTimeout(_callback, 0);
}

export const settings = {};
export const SCHED_NONE = 1;
export const SCHED_RR = 2;
export let schedulingPolicy = SCHED_RR;

export function setupMaster(_settings?: object): void {}
export function setupPrimary(_settings?: object): void {}

const clusterEmitter = new EventEmitter();
export const on = clusterEmitter.on.bind(clusterEmitter);
export const once = clusterEmitter.once.bind(clusterEmitter);
export const emit = clusterEmitter.emit.bind(clusterEmitter);
export const removeListener = clusterEmitter.removeListener.bind(clusterEmitter);

export default {
  isMaster,
  isPrimary,
  isWorker,
  Worker,
  worker,
  workers,
  fork,
  disconnect,
  settings,
  SCHED_NONE,
  SCHED_RR,
  schedulingPolicy,
  setupMaster,
  setupPrimary,
  on,
  once,
  emit,
  removeListener,
};
