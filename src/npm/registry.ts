/**
 * npm Registry Client
 * Fetches package metadata from npm registry
 */

export interface PackageVersion {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  optionalDependencies?: Record<string, string>;
  dist: {
    tarball: string;
    shasum: string;
    integrity?: string;
  };
  main?: string;
  module?: string;
  exports?: Record<string, unknown>;
  bin?: Record<string, string> | string;
}

export interface PackageManifest {
  name: string;
  'dist-tags': {
    latest: string;
    [tag: string]: string;
  };
  versions: Record<string, PackageVersion>;
  time?: Record<string, string>;
}

export interface RegistryOptions {
  registry?: string;
  cache?: Map<string, PackageManifest>;
}

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

export class Registry {
  private registryUrl: string;
  private cache: Map<string, PackageManifest>;

  constructor(options: RegistryOptions = {}) {
    this.registryUrl = options.registry || DEFAULT_REGISTRY;
    this.cache = options.cache || new Map();
  }

  /**
   * Fetch package manifest (all versions metadata)
   */
  async getPackageManifest(packageName: string): Promise<PackageManifest> {
    // Check cache first
    if (this.cache.has(packageName)) {
      return this.cache.get(packageName)!;
    }

    const url = `${this.registryUrl}/${encodePackageName(packageName)}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Package not found: ${packageName}`);
      }
      throw new Error(`Failed to fetch package ${packageName}: ${response.status}`);
    }

    const manifest = (await response.json()) as PackageManifest;

    // Cache the result
    this.cache.set(packageName, manifest);

    return manifest;
  }

  /**
   * Get specific version metadata
   */
  async getPackageVersion(
    packageName: string,
    version: string
  ): Promise<PackageVersion> {
    const manifest = await this.getPackageManifest(packageName);

    // Handle dist-tags (like "latest", "next", etc.)
    if (manifest['dist-tags'][version]) {
      version = manifest['dist-tags'][version];
    }

    const versionData = manifest.versions[version];
    if (!versionData) {
      throw new Error(`Version ${version} not found for package ${packageName}`);
    }

    return versionData;
  }

  /**
   * Get latest version number
   */
  async getLatestVersion(packageName: string): Promise<string> {
    const manifest = await this.getPackageManifest(packageName);
    return manifest['dist-tags'].latest;
  }

  /**
   * Get all available versions
   */
  async getVersions(packageName: string): Promise<string[]> {
    const manifest = await this.getPackageManifest(packageName);
    return Object.keys(manifest.versions);
  }

  /**
   * Download tarball as ArrayBuffer
   */
  async downloadTarball(tarballUrl: string): Promise<ArrayBuffer> {
    const response = await fetch(tarballUrl);

    if (!response.ok) {
      throw new Error(`Failed to download tarball: ${response.status}`);
    }

    return response.arrayBuffer();
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Encode scoped package names for URL
 * @scoped/package -> @scoped%2fpackage
 */
function encodePackageName(name: string): string {
  return name.replace('/', '%2f');
}

// Default registry instance
export const registry = new Registry();

export default Registry;
