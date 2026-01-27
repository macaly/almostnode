import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import {
  parseVersion,
  compareVersions,
  satisfies,
  findBestVersion,
} from '../src/npm/resolver';
import { extractTarball, decompress } from '../src/npm/tarball';
import { parsePackageSpec, PackageManager } from '../src/npm';
import pako from 'pako';

describe('npm', () => {
  describe('semver', () => {
    describe('parseVersion', () => {
      it('should parse standard versions', () => {
        expect(parseVersion('1.2.3')).toEqual({
          major: 1,
          minor: 2,
          patch: 3,
          prerelease: undefined,
        });
      });

      it('should parse prerelease versions', () => {
        expect(parseVersion('1.0.0-alpha.1')).toEqual({
          major: 1,
          minor: 0,
          patch: 0,
          prerelease: 'alpha.1',
        });
      });

      it('should return null for invalid versions', () => {
        expect(parseVersion('invalid')).toBeNull();
        expect(parseVersion('1.2')).toBeNull();
        expect(parseVersion('v1.2.3')).toBeNull();
      });
    });

    describe('compareVersions', () => {
      it('should compare major versions', () => {
        expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
        expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
      });

      it('should compare minor versions', () => {
        expect(compareVersions('1.2.0', '1.1.0')).toBeGreaterThan(0);
        expect(compareVersions('1.1.0', '1.2.0')).toBeLessThan(0);
      });

      it('should compare patch versions', () => {
        expect(compareVersions('1.0.2', '1.0.1')).toBeGreaterThan(0);
        expect(compareVersions('1.0.1', '1.0.2')).toBeLessThan(0);
      });

      it('should return 0 for equal versions', () => {
        expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
      });

      it('should rank prerelease lower than release', () => {
        expect(compareVersions('1.0.0-alpha', '1.0.0')).toBeLessThan(0);
        expect(compareVersions('1.0.0', '1.0.0-alpha')).toBeGreaterThan(0);
      });
    });

    describe('satisfies', () => {
      it('should match exact versions', () => {
        expect(satisfies('1.2.3', '1.2.3')).toBe(true);
        expect(satisfies('1.2.3', '1.2.4')).toBe(false);
      });

      it('should match caret ranges', () => {
        expect(satisfies('1.2.3', '^1.0.0')).toBe(true);
        expect(satisfies('1.9.9', '^1.0.0')).toBe(true);
        expect(satisfies('2.0.0', '^1.0.0')).toBe(false);
        expect(satisfies('0.9.0', '^1.0.0')).toBe(false);
      });

      it('should match tilde ranges', () => {
        expect(satisfies('1.2.3', '~1.2.0')).toBe(true);
        expect(satisfies('1.2.9', '~1.2.0')).toBe(true);
        expect(satisfies('1.3.0', '~1.2.0')).toBe(false);
      });

      it('should match >= ranges', () => {
        expect(satisfies('1.2.3', '>=1.0.0')).toBe(true);
        expect(satisfies('1.0.0', '>=1.0.0')).toBe(true);
        expect(satisfies('0.9.9', '>=1.0.0')).toBe(false);
      });

      it('should match > ranges', () => {
        expect(satisfies('1.0.1', '>1.0.0')).toBe(true);
        expect(satisfies('1.0.0', '>1.0.0')).toBe(false);
      });

      it('should match <= ranges', () => {
        expect(satisfies('1.0.0', '<=1.0.0')).toBe(true);
        expect(satisfies('0.9.9', '<=1.0.0')).toBe(true);
        expect(satisfies('1.0.1', '<=1.0.0')).toBe(false);
      });

      it('should match < ranges', () => {
        expect(satisfies('0.9.9', '<1.0.0')).toBe(true);
        expect(satisfies('1.0.0', '<1.0.0')).toBe(false);
      });

      it('should match * and latest', () => {
        expect(satisfies('1.0.0', '*')).toBe(true);
        expect(satisfies('999.0.0', '*')).toBe(true);
        expect(satisfies('1.0.0', 'latest')).toBe(true);
      });

      it('should match || ranges', () => {
        expect(satisfies('1.0.0', '1.0.0 || 2.0.0')).toBe(true);
        expect(satisfies('2.0.0', '1.0.0 || 2.0.0')).toBe(true);
        expect(satisfies('3.0.0', '1.0.0 || 2.0.0')).toBe(false);
      });

      it('should match hyphen ranges', () => {
        expect(satisfies('1.5.0', '1.0.0 - 2.0.0')).toBe(true);
        expect(satisfies('1.0.0', '1.0.0 - 2.0.0')).toBe(true);
        expect(satisfies('2.0.0', '1.0.0 - 2.0.0')).toBe(true);
        expect(satisfies('2.0.1', '1.0.0 - 2.0.0')).toBe(false);
      });

      it('should skip prerelease versions by default', () => {
        expect(satisfies('1.0.0-alpha', '^1.0.0')).toBe(false);
      });
    });

    describe('findBestVersion', () => {
      const versions = ['1.0.0', '1.1.0', '1.2.0', '2.0.0', '2.1.0'];

      it('should find highest matching version for caret', () => {
        expect(findBestVersion(versions, '^1.0.0')).toBe('1.2.0');
      });

      it('should find highest matching version for tilde', () => {
        expect(findBestVersion(versions, '~1.0.0')).toBe('1.0.0');
        expect(findBestVersion(versions, '~1.1.0')).toBe('1.1.0');
      });

      it('should return null if no match', () => {
        expect(findBestVersion(versions, '^3.0.0')).toBeNull();
      });
    });
  });

  describe('parsePackageSpec', () => {
    it('should parse package name only', () => {
      expect(parsePackageSpec('express')).toEqual({ name: 'express' });
    });

    it('should parse package with version', () => {
      expect(parsePackageSpec('express@4.18.2')).toEqual({
        name: 'express',
        version: '4.18.2',
      });
    });

    it('should parse scoped package', () => {
      expect(parsePackageSpec('@types/node')).toEqual({
        name: '@types/node',
      });
    });

    it('should parse scoped package with version', () => {
      expect(parsePackageSpec('@types/node@18.0.0')).toEqual({
        name: '@types/node',
        version: '18.0.0',
      });
    });

    it('should parse version ranges', () => {
      expect(parsePackageSpec('express@^4.0.0')).toEqual({
        name: 'express',
        version: '^4.0.0',
      });
    });
  });

  describe('tarball extraction', () => {
    let vfs: VirtualFS;

    beforeEach(() => {
      vfs = new VirtualFS();
    });

    it('should decompress gzipped data', () => {
      const original = new TextEncoder().encode('hello world');
      const compressed = pako.gzip(original);
      const decompressed = decompress(compressed);
      expect(new TextDecoder().decode(decompressed)).toBe('hello world');
    });

    it('should extract tarball to VFS', () => {
      // Create a minimal tar archive with package/ prefix
      const tarball = createMinimalTarball({
        'package/package.json': '{"name":"test","version":"1.0.0"}',
        'package/index.js': 'module.exports = 42;',
      });

      // Gzip it
      const compressed = pako.gzip(tarball);

      // Extract to /node_modules/test
      const files = extractTarball(compressed, vfs, '/node_modules/test');

      expect(vfs.existsSync('/node_modules/test/package.json')).toBe(true);
      expect(vfs.existsSync('/node_modules/test/index.js')).toBe(true);

      const pkgJson = JSON.parse(
        vfs.readFileSync('/node_modules/test/package.json', 'utf8')
      );
      expect(pkgJson.name).toBe('test');
      expect(pkgJson.version).toBe('1.0.0');

      expect(vfs.readFileSync('/node_modules/test/index.js', 'utf8')).toBe(
        'module.exports = 42;'
      );
    });

    it('should strip leading path components', () => {
      const tarball = createMinimalTarball({
        'package/lib/utils.js': 'exports.util = true;',
      });
      const compressed = pako.gzip(tarball);

      extractTarball(compressed, vfs, '/pkg', { stripComponents: 1 });

      expect(vfs.existsSync('/pkg/lib/utils.js')).toBe(true);
      expect(vfs.existsSync('/pkg/package')).toBe(false);
    });

    it('should apply filter function', () => {
      const tarball = createMinimalTarball({
        'package/index.js': 'code',
        'package/test.js': 'test code',
        'package/README.md': 'readme',
      });
      const compressed = pako.gzip(tarball);

      extractTarball(compressed, vfs, '/pkg', {
        stripComponents: 1,
        filter: (path) => path.endsWith('.js'),
      });

      expect(vfs.existsSync('/pkg/index.js')).toBe(true);
      expect(vfs.existsSync('/pkg/test.js')).toBe(true);
      expect(vfs.existsSync('/pkg/README.md')).toBe(false);
    });
  });

  describe('PackageManager', () => {
    let vfs: VirtualFS;
    let pm: PackageManager;

    beforeEach(() => {
      vfs = new VirtualFS();
      pm = new PackageManager(vfs);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should list installed packages', () => {
      // Manually set up installed packages
      vfs.writeFileSync(
        '/node_modules/express/package.json',
        '{"name":"express","version":"4.18.2"}'
      );
      vfs.writeFileSync(
        '/node_modules/lodash/package.json',
        '{"name":"lodash","version":"4.17.21"}'
      );

      const packages = pm.list();

      expect(packages).toEqual({
        express: '4.18.2',
        lodash: '4.17.21',
      });
    });

    it('should list scoped packages', () => {
      vfs.writeFileSync(
        '/node_modules/@types/node/package.json',
        '{"name":"@types/node","version":"18.0.0"}'
      );

      const packages = pm.list();

      expect(packages).toEqual({
        '@types/node': '18.0.0',
      });
    });

    it('should return empty object when no packages installed', () => {
      expect(pm.list()).toEqual({});
    });

    it('should install package with mocked fetch', async () => {
      // Mock fetch responses
      const mockManifest = {
        name: 'tiny-pkg',
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': {
            name: 'tiny-pkg',
            version: '1.0.0',
            dist: {
              tarball: 'https://registry.npmjs.org/tiny-pkg/-/tiny-pkg-1.0.0.tgz',
              shasum: 'abc123',
            },
            dependencies: {},
          },
        },
      };

      const tarballContent = createMinimalTarball({
        'package/package.json': '{"name":"tiny-pkg","version":"1.0.0"}',
        'package/index.js': 'module.exports = "tiny";',
      });
      const compressedTarball = pako.gzip(tarballContent);

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const urlStr = url.toString();
        if (urlStr.includes('registry.npmjs.org/tiny-pkg') && !urlStr.includes('.tgz')) {
          return new Response(JSON.stringify(mockManifest), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.includes('.tgz')) {
          return new Response(compressedTarball, { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const result = await pm.install('tiny-pkg');

      expect(result.installed.size).toBe(1);
      expect(result.installed.has('tiny-pkg')).toBe(true);
      expect(vfs.existsSync('/node_modules/tiny-pkg/package.json')).toBe(true);
      expect(vfs.existsSync('/node_modules/tiny-pkg/index.js')).toBe(true);

      const pkgJson = JSON.parse(
        vfs.readFileSync('/node_modules/tiny-pkg/package.json', 'utf8')
      );
      expect(pkgJson.version).toBe('1.0.0');
    });

    it('should resolve and install dependencies', async () => {
      const manifestA = {
        name: 'pkg-a',
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': {
            name: 'pkg-a',
            version: '1.0.0',
            dist: {
              tarball: 'https://registry.npmjs.org/pkg-a/-/pkg-a-1.0.0.tgz',
              shasum: 'abc',
            },
            dependencies: {
              'pkg-b': '^1.0.0',
            },
          },
        },
      };

      const manifestB = {
        name: 'pkg-b',
        'dist-tags': { latest: '1.2.0' },
        versions: {
          '1.0.0': {
            name: 'pkg-b',
            version: '1.0.0',
            dist: {
              tarball: 'https://registry.npmjs.org/pkg-b/-/pkg-b-1.0.0.tgz',
              shasum: 'def',
            },
            dependencies: {},
          },
          '1.2.0': {
            name: 'pkg-b',
            version: '1.2.0',
            dist: {
              tarball: 'https://registry.npmjs.org/pkg-b/-/pkg-b-1.2.0.tgz',
              shasum: 'ghi',
            },
            dependencies: {},
          },
        },
      };

      const tarballA = pako.gzip(
        createMinimalTarball({
          'package/package.json': '{"name":"pkg-a","version":"1.0.0"}',
        })
      );

      const tarballB = pako.gzip(
        createMinimalTarball({
          'package/package.json': '{"name":"pkg-b","version":"1.2.0"}',
        })
      );

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const urlStr = url.toString();
        if (urlStr.includes('/pkg-a') && !urlStr.includes('.tgz')) {
          return new Response(JSON.stringify(manifestA), { status: 200 });
        }
        if (urlStr.includes('/pkg-b') && !urlStr.includes('.tgz')) {
          return new Response(JSON.stringify(manifestB), { status: 200 });
        }
        if (urlStr.includes('pkg-a-1.0.0.tgz')) {
          return new Response(tarballA, { status: 200 });
        }
        if (urlStr.includes('pkg-b-1.2.0.tgz')) {
          return new Response(tarballB, { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const result = await pm.install('pkg-a');

      expect(result.installed.size).toBe(2);
      expect(result.installed.has('pkg-a')).toBe(true);
      expect(result.installed.has('pkg-b')).toBe(true);

      // Should install the highest compatible version of pkg-b
      const pkgB = result.installed.get('pkg-b');
      expect(pkgB?.version).toBe('1.2.0');

      expect(vfs.existsSync('/node_modules/pkg-a/package.json')).toBe(true);
      expect(vfs.existsSync('/node_modules/pkg-b/package.json')).toBe(true);
    });
  });
});

/**
 * Create a minimal tar archive for testing
 */
function createMinimalTarball(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  for (const [filename, content] of Object.entries(files)) {
    const contentBytes = encoder.encode(content);

    // Create 512-byte header
    const header = new Uint8Array(512);

    // Filename (0-100)
    const nameBytes = encoder.encode(filename);
    header.set(nameBytes.slice(0, 100), 0);

    // File mode (100-108) - octal "0000644\0"
    header.set(encoder.encode('0000644\0'), 100);

    // UID (108-116) - octal "0000000\0"
    header.set(encoder.encode('0000000\0'), 108);

    // GID (116-124) - octal "0000000\0"
    header.set(encoder.encode('0000000\0'), 116);

    // Size (124-136) - octal, 11 digits + space
    const sizeOctal = contentBytes.length.toString(8).padStart(11, '0') + ' ';
    header.set(encoder.encode(sizeOctal), 124);

    // Mtime (136-148) - octal "00000000000\0"
    header.set(encoder.encode('00000000000\0'), 136);

    // Initially set checksum field to spaces for calculation
    header.set(encoder.encode('        '), 148);

    // Type flag (156) - '0' for regular file
    header[156] = 48; // '0'

    // Calculate checksum (sum of all bytes in header)
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += header[i];
    }
    // Write checksum as 6 octal digits + null + space
    const checksumStr = checksum.toString(8).padStart(6, '0') + '\0 ';
    header.set(encoder.encode(checksumStr), 148);

    chunks.push(header);

    // Add content padded to 512-byte boundary
    const paddedSize = Math.ceil(contentBytes.length / 512) * 512;
    const paddedContent = new Uint8Array(paddedSize);
    paddedContent.set(contentBytes);
    chunks.push(paddedContent);
  }

  // Add two 512-byte blocks of zeros to mark end of archive
  chunks.push(new Uint8Array(1024));

  // Concatenate all chunks
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}
