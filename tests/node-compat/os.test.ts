/**
 * Node.js os module compatibility tests
 *
 * Adapted from: https://github.com/nodejs/node/blob/main/test/parallel/test-os.js
 *
 * Note: Our os shim returns simulated values since we run in a virtualized
 * environment. Tests verify the API shape and return types match Node.js.
 */

import { describe, it, expect } from 'vitest';
import os, {
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
} from '../../src/shims/os';
import { assert } from './common';

describe('os module (Node.js compat)', () => {
  describe('os.hostname()', () => {
    it('should return a string', () => {
      const result = hostname();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should be accessible from default export', () => {
      expect(os.hostname()).toBe(hostname());
    });
  });

  describe('os.platform()', () => {
    it('should return a valid platform string', () => {
      const result = platform();
      expect(typeof result).toBe('string');
      // Valid Node.js platforms
      const validPlatforms = ['aix', 'darwin', 'freebsd', 'linux', 'openbsd', 'sunos', 'win32'];
      expect(validPlatforms).toContain(result);
    });

    it('should be accessible from default export', () => {
      expect(os.platform()).toBe(platform());
    });
  });

  describe('os.arch()', () => {
    it('should return a valid architecture string', () => {
      const result = arch();
      expect(typeof result).toBe('string');
      // Valid Node.js architectures
      const validArchs = ['arm', 'arm64', 'ia32', 'mips', 'mipsel', 'ppc', 'ppc64', 's390', 's390x', 'x64'];
      expect(validArchs).toContain(result);
    });

    it('should be accessible from default export', () => {
      expect(os.arch()).toBe(arch());
    });
  });

  describe('os.type()', () => {
    it('should return a string', () => {
      const result = type();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should be accessible from default export', () => {
      expect(os.type()).toBe(type());
    });
  });

  describe('os.release()', () => {
    it('should return a string', () => {
      const result = release();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should be accessible from default export', () => {
      expect(os.release()).toBe(release());
    });
  });

  describe('os.version()', () => {
    it('should return a string', () => {
      const result = version();
      expect(typeof result).toBe('string');
    });

    it('should be accessible from default export', () => {
      expect(os.version()).toBe(version());
    });
  });

  describe('os.machine()', () => {
    it('should return a string', () => {
      const result = machine();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should be accessible from default export', () => {
      expect(os.machine()).toBe(machine());
    });
  });

  describe('os.tmpdir()', () => {
    it('should return a string path', () => {
      const result = tmpdir();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return an absolute path', () => {
      const result = tmpdir();
      expect(result.startsWith('/')).toBe(true);
    });

    it('should be accessible from default export', () => {
      expect(os.tmpdir()).toBe(tmpdir());
    });
  });

  describe('os.homedir()', () => {
    it('should return a string path', () => {
      const result = homedir();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return an absolute path', () => {
      const result = homedir();
      expect(result.startsWith('/')).toBe(true);
    });

    it('should be accessible from default export', () => {
      expect(os.homedir()).toBe(homedir());
    });
  });

  describe('os.cpus()', () => {
    it('should return an array', () => {
      const result = cpus();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return CPU info objects with correct shape', () => {
      const result = cpus();
      for (const cpu of result) {
        expect(cpu).toHaveProperty('model');
        expect(cpu).toHaveProperty('speed');
        expect(cpu).toHaveProperty('times');
        expect(typeof cpu.model).toBe('string');
        expect(typeof cpu.speed).toBe('number');
        expect(typeof cpu.times).toBe('object');
        expect(cpu.times).toHaveProperty('user');
        expect(cpu.times).toHaveProperty('nice');
        expect(cpu.times).toHaveProperty('sys');
        expect(cpu.times).toHaveProperty('idle');
        expect(cpu.times).toHaveProperty('irq');
      }
    });

    it('should be accessible from default export', () => {
      expect(os.cpus()).toEqual(cpus());
    });
  });

  describe('os.totalmem()', () => {
    it('should return a positive number', () => {
      const result = totalmem();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('should be accessible from default export', () => {
      expect(os.totalmem()).toBe(totalmem());
    });
  });

  describe('os.freemem()', () => {
    it('should return a positive number', () => {
      const result = freemem();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('should be less than or equal to totalmem', () => {
      expect(freemem()).toBeLessThanOrEqual(totalmem());
    });

    it('should be accessible from default export', () => {
      expect(os.freemem()).toBe(freemem());
    });
  });

  describe('os.uptime()', () => {
    it('should return a non-negative number', () => {
      const result = uptime();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should be accessible from default export', () => {
      // uptime changes, so just check type
      expect(typeof os.uptime()).toBe('number');
    });
  });

  describe('os.loadavg()', () => {
    it('should return an array of 3 numbers', () => {
      const result = loadavg();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
      for (const avg of result) {
        expect(typeof avg).toBe('number');
        expect(avg).toBeGreaterThanOrEqual(0);
      }
    });

    it('should be accessible from default export', () => {
      expect(os.loadavg()).toEqual(loadavg());
    });
  });

  describe('os.networkInterfaces()', () => {
    it('should return an object', () => {
      const result = networkInterfaces();
      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
    });

    it('should have interface entries with correct shape', () => {
      const result = networkInterfaces();
      for (const [name, interfaces] of Object.entries(result)) {
        expect(typeof name).toBe('string');
        expect(Array.isArray(interfaces)).toBe(true);
        for (const iface of interfaces) {
          expect(iface).toHaveProperty('address');
          expect(iface).toHaveProperty('netmask');
          expect(iface).toHaveProperty('family');
          expect(iface).toHaveProperty('mac');
          expect(iface).toHaveProperty('internal');
          expect(iface).toHaveProperty('cidr');
          expect(typeof iface.address).toBe('string');
          expect(typeof iface.netmask).toBe('string');
          expect(typeof iface.family).toBe('string');
          expect(typeof iface.mac).toBe('string');
          expect(typeof iface.internal).toBe('boolean');
          expect(typeof iface.cidr).toBe('string');
        }
      }
    });

    it('should be accessible from default export', () => {
      expect(os.networkInterfaces()).toEqual(networkInterfaces());
    });
  });

  describe('os.userInfo()', () => {
    it('should return user info object', () => {
      const result = userInfo();
      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
    });

    it('should have correct shape', () => {
      const result = userInfo();
      expect(result).toHaveProperty('username');
      expect(result).toHaveProperty('uid');
      expect(result).toHaveProperty('gid');
      expect(result).toHaveProperty('shell');
      expect(result).toHaveProperty('homedir');
      expect(typeof result.username).toBe('string');
      expect(typeof result.uid).toBe('number');
      expect(typeof result.gid).toBe('number');
      expect(typeof result.shell).toBe('string');
      expect(typeof result.homedir).toBe('string');
    });

    it('should be accessible from default export', () => {
      expect(os.userInfo()).toEqual(userInfo());
    });
  });

  describe('os.endianness()', () => {
    it('should return BE or LE', () => {
      const result = endianness();
      expect(['BE', 'LE']).toContain(result);
    });

    it('should be accessible from default export', () => {
      expect(os.endianness()).toBe(endianness());
    });
  });

  describe('os.getPriority()', () => {
    it('should return a number', () => {
      const result = getPriority();
      expect(typeof result).toBe('number');
    });

    it('should accept optional pid argument', () => {
      const result = getPriority(1);
      expect(typeof result).toBe('number');
    });

    it('should be accessible from default export', () => {
      expect(os.getPriority()).toBe(getPriority());
    });
  });

  describe('os.setPriority()', () => {
    it('should not throw', () => {
      expect(() => setPriority(0, 0)).not.toThrow();
    });

    it('should be accessible from default export', () => {
      expect(() => os.setPriority(0, 0)).not.toThrow();
    });
  });

  describe('os.EOL', () => {
    it('should be a string', () => {
      expect(typeof EOL).toBe('string');
    });

    it('should be a valid line ending', () => {
      expect(['\n', '\r\n']).toContain(EOL);
    });

    it('should be accessible from default export', () => {
      expect(os.EOL).toBe(EOL);
    });
  });

  describe('os.constants', () => {
    it('should be an object', () => {
      expect(typeof constants).toBe('object');
      expect(constants).not.toBeNull();
    });

    it('should have signals', () => {
      expect(constants).toHaveProperty('signals');
      expect(typeof constants.signals).toBe('object');
    });

    it('should have common signals', () => {
      const { signals } = constants;
      expect(signals).toHaveProperty('SIGINT');
      expect(signals).toHaveProperty('SIGTERM');
      expect(signals).toHaveProperty('SIGKILL');
      expect(typeof signals.SIGINT).toBe('number');
      expect(typeof signals.SIGTERM).toBe('number');
      expect(typeof signals.SIGKILL).toBe('number');
    });

    it('should have priority constants', () => {
      expect(constants).toHaveProperty('priority');
      expect(constants.priority).toHaveProperty('PRIORITY_LOW');
      expect(constants.priority).toHaveProperty('PRIORITY_NORMAL');
      expect(constants.priority).toHaveProperty('PRIORITY_HIGH');
    });

    it('should be accessible from default export', () => {
      expect(os.constants).toBe(constants);
    });
  });

  describe('os.devNull', () => {
    it('should be a string', () => {
      expect(typeof devNull).toBe('string');
    });

    it('should be a valid dev null path', () => {
      expect(['/dev/null', '\\\\.\\nul']).toContain(devNull);
    });

    it('should be accessible from default export', () => {
      expect(os.devNull).toBe(devNull);
    });
  });

  describe('default export', () => {
    it('should have all functions', () => {
      expect(os.hostname).toBe(hostname);
      expect(os.platform).toBe(platform);
      expect(os.arch).toBe(arch);
      expect(os.type).toBe(type);
      expect(os.release).toBe(release);
      expect(os.version).toBe(version);
      expect(os.machine).toBe(machine);
      expect(os.tmpdir).toBe(tmpdir);
      expect(os.homedir).toBe(homedir);
      expect(os.cpus).toBe(cpus);
      expect(os.totalmem).toBe(totalmem);
      expect(os.freemem).toBe(freemem);
      expect(os.uptime).toBe(uptime);
      expect(os.loadavg).toBe(loadavg);
      expect(os.networkInterfaces).toBe(networkInterfaces);
      expect(os.userInfo).toBe(userInfo);
      expect(os.endianness).toBe(endianness);
      expect(os.getPriority).toBe(getPriority);
      expect(os.setPriority).toBe(setPriority);
    });

    it('should have all constants', () => {
      expect(os.EOL).toBe(EOL);
      expect(os.constants).toBe(constants);
      expect(os.devNull).toBe(devNull);
    });
  });
});
