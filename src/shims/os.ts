/**
 * Node.js os module shim
 * Provides operating system utilities
 */

export function hostname(): string {
  return 'localhost';
}

export function platform(): string {
  return 'linux';
}

export function arch(): string {
  return 'x64';
}

export function type(): string {
  return 'Linux';
}

export function release(): string {
  return '5.10.0';
}

export function version(): string {
  return '#1 SMP';
}

export function machine(): string {
  return 'x86_64';
}

export function tmpdir(): string {
  return '/tmp';
}

export function homedir(): string {
  return '/home/user';
}

export function cpus(): Array<{
  model: string;
  speed: number;
  times: { user: number; nice: number; sys: number; idle: number; irq: number };
}> {
  const cpu = {
    model: 'Virtual CPU',
    speed: 2400,
    times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
  };
  return [cpu, cpu]; // Simulate 2 CPUs
}

export function totalmem(): number {
  return 4 * 1024 * 1024 * 1024; // 4GB
}

export function freemem(): number {
  return 2 * 1024 * 1024 * 1024; // 2GB
}

export function uptime(): number {
  return Math.floor(performance.now() / 1000);
}

export function loadavg(): [number, number, number] {
  return [0.5, 0.5, 0.5];
}

export function networkInterfaces(): Record<
  string,
  Array<{
    address: string;
    netmask: string;
    family: string;
    mac: string;
    internal: boolean;
    cidr: string;
  }>
> {
  return {
    lo: [
      {
        address: '127.0.0.1',
        netmask: '255.0.0.0',
        family: 'IPv4',
        mac: '00:00:00:00:00:00',
        internal: true,
        cidr: '127.0.0.1/8',
      },
    ],
  };
}

export function userInfo(): {
  username: string;
  uid: number;
  gid: number;
  shell: string;
  homedir: string;
} {
  return {
    username: 'user',
    uid: 1000,
    gid: 1000,
    shell: '/bin/bash',
    homedir: '/home/user',
  };
}

export function endianness(): 'BE' | 'LE' {
  return 'LE';
}

export function getPriority(pid?: number): number {
  return 0;
}

export function setPriority(pid: number | number, priority?: number): void {
  // No-op
}

export const EOL = '\n';

export const constants = {
  signals: {
    SIGHUP: 1,
    SIGINT: 2,
    SIGQUIT: 3,
    SIGILL: 4,
    SIGTRAP: 5,
    SIGABRT: 6,
    SIGBUS: 7,
    SIGFPE: 8,
    SIGKILL: 9,
    SIGUSR1: 10,
    SIGSEGV: 11,
    SIGUSR2: 12,
    SIGPIPE: 13,
    SIGALRM: 14,
    SIGTERM: 15,
    SIGCHLD: 17,
    SIGCONT: 18,
    SIGSTOP: 19,
    SIGTSTP: 20,
    SIGTTIN: 21,
    SIGTTOU: 22,
    SIGURG: 23,
    SIGXCPU: 24,
    SIGXFSZ: 25,
    SIGVTALRM: 26,
    SIGPROF: 27,
    SIGWINCH: 28,
    SIGIO: 29,
    SIGPWR: 30,
    SIGSYS: 31,
  },
  errno: {},
  priority: {
    PRIORITY_LOW: 19,
    PRIORITY_BELOW_NORMAL: 10,
    PRIORITY_NORMAL: 0,
    PRIORITY_ABOVE_NORMAL: -7,
    PRIORITY_HIGH: -14,
    PRIORITY_HIGHEST: -20,
  },
};

export const devNull = '/dev/null';

export default {
  hostname,
  platform,
  arch,
  type,
  release,
  version,
  machine,
  tmpdir,
  homedir,
  cpus,
  totalmem,
  freemem,
  uptime,
  loadavg,
  networkInterfaces,
  userInfo,
  endianness,
  getPriority,
  setPriority,
  EOL,
  constants,
  devNull,
};
