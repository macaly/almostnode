/**
 * npm Package Manager
 * Orchestrates package installation into the virtual file system
 */

import { VirtualFS } from '../virtual-fs';
import { Registry, RegistryOptions } from './registry';
import {
  resolveDependencies,
  resolveFromPackageJson,
  ResolvedPackage,
  ResolveOptions,
} from './resolver';
import { downloadAndExtract, extractTarball } from './tarball';
import * as path from '../shims/path';
import { initTransformer, transformPackage, isTransformerReady } from '../transform';

export interface InstallOptions {
  registry?: string;
  save?: boolean;
  saveDev?: boolean;
  includeDev?: boolean;
  includeOptional?: boolean;
  onProgress?: (message: string) => void;
  /** Transform ESM packages to CJS after install (default: true) */
  transform?: boolean;
}

export interface InstallResult {
  installed: Map<string, ResolvedPackage>;
  added: string[];
}

/**
 * npm Package Manager for VirtualFS
 */
export class PackageManager {
  private vfs: VirtualFS;
  private registry: Registry;
  private cwd: string;

  constructor(vfs: VirtualFS, options: { cwd?: string } & RegistryOptions = {}) {
    this.vfs = vfs;
    this.registry = new Registry(options);
    this.cwd = options.cwd || '/';
  }

  /**
   * Install a package and its dependencies
   */
  async install(
    packageSpec: string,
    options: InstallOptions = {}
  ): Promise<InstallResult> {
    const { onProgress } = options;

    // Parse package spec (name@version)
    const { name, version } = parsePackageSpec(packageSpec);

    onProgress?.(`Resolving ${name}@${version || 'latest'}...`);

    // Resolve dependencies
    const resolved = await resolveDependencies(name, version || 'latest', {
      registry: this.registry,
      includeDev: options.includeDev,
      includeOptional: options.includeOptional,
      onProgress,
    });

    // Install all resolved packages
    const added = await this.installResolved(resolved, options);

    // Update package.json if save option is set
    if (options.save || options.saveDev) {
      const pkgToAdd = resolved.get(name);
      if (pkgToAdd) {
        await this.updatePackageJson(
          name,
          `^${pkgToAdd.version}`,
          options.saveDev || false
        );
      }
    }

    onProgress?.(`Installed ${resolved.size} packages`);

    return { installed: resolved, added };
  }

  /**
   * Install all dependencies from package.json
   */
  async installFromPackageJson(options: InstallOptions = {}): Promise<InstallResult> {
    const { onProgress } = options;

    const pkgJsonPath = path.join(this.cwd, 'package.json');

    if (!this.vfs.existsSync(pkgJsonPath)) {
      throw new Error('No package.json found');
    }

    const pkgJson = JSON.parse(this.vfs.readFileSync(pkgJsonPath, 'utf8'));

    onProgress?.('Resolving dependencies...');

    // Resolve all dependencies
    const resolved = await resolveFromPackageJson(pkgJson, {
      registry: this.registry,
      includeDev: options.includeDev,
      includeOptional: options.includeOptional,
      onProgress,
    });

    // Install all resolved packages
    const added = await this.installResolved(resolved, options);

    onProgress?.(`Installed ${resolved.size} packages`);

    return { installed: resolved, added };
  }

  /**
   * Install resolved packages to node_modules
   */
  private async installResolved(
    resolved: Map<string, ResolvedPackage>,
    options: InstallOptions
  ): Promise<string[]> {
    const { onProgress } = options;
    const added: string[] = [];

    // Ensure node_modules exists
    const nodeModulesPath = path.join(this.cwd, 'node_modules');
    this.vfs.mkdirSync(nodeModulesPath, { recursive: true });

    // Filter packages that need to be installed
    const toInstall: Array<{ name: string; pkg: ResolvedPackage; pkgPath: string }> = [];

    for (const [name, pkg] of resolved) {
      const pkgPath = path.join(nodeModulesPath, name);

      // Skip if already installed with same version
      const existingPkgJson = path.join(pkgPath, 'package.json');
      if (this.vfs.existsSync(existingPkgJson)) {
        try {
          const existing = JSON.parse(
            this.vfs.readFileSync(existingPkgJson, 'utf8')
          );
          if (existing.version === pkg.version) {
            onProgress?.(`Skipping ${name}@${pkg.version} (already installed)`);
            continue;
          }
        } catch {
          // Continue with installation if package.json is invalid
        }
      }

      toInstall.push({ name, pkg, pkgPath });
    }

    // Initialize transformer if transform option is enabled (default: true)
    const shouldTransform = options.transform !== false;
    if (shouldTransform && !isTransformerReady()) {
      onProgress?.('Initializing ESM transformer...');
      await initTransformer();
    }

    // Install packages in parallel (limit concurrency to avoid overwhelming the browser)
    const CONCURRENCY = 6;
    onProgress?.(`Installing ${toInstall.length} packages...`);

    for (let i = 0; i < toInstall.length; i += CONCURRENCY) {
      const batch = toInstall.slice(i, i + CONCURRENCY);

      await Promise.all(
        batch.map(async ({ name, pkg, pkgPath }) => {
          onProgress?.(`  Downloading ${name}@${pkg.version}...`);

          // Download and extract tarball
          await downloadAndExtract(pkg.tarballUrl, this.vfs, pkgPath, {
            stripComponents: 1, // Strip "package/" prefix
          });

          // Transform ESM to CJS
          if (shouldTransform) {
            try {
              const count = await transformPackage(this.vfs, pkgPath, onProgress);
              if (count > 0) {
                onProgress?.(`  Transformed ${count} files in ${name}`);
              }
            } catch (transformError) {
              onProgress?.(`  Warning: Transform failed for ${name}: ${transformError}`);
            }
          }

          added.push(name);
        })
      );
    }

    // Create .package-lock.json for tracking
    await this.writeLockfile(resolved);

    return added;
  }

  /**
   * Write lockfile with resolved versions
   */
  private async writeLockfile(
    resolved: Map<string, ResolvedPackage>
  ): Promise<void> {
    const lockfile: Record<string, { version: string; resolved: string }> = {};

    for (const [name, pkg] of resolved) {
      lockfile[name] = {
        version: pkg.version,
        resolved: pkg.tarballUrl,
      };
    }

    const lockfilePath = path.join(this.cwd, 'node_modules', '.package-lock.json');
    this.vfs.writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2));
  }

  /**
   * Update package.json with new dependency
   */
  private async updatePackageJson(
    packageName: string,
    version: string,
    isDev: boolean
  ): Promise<void> {
    const pkgJsonPath = path.join(this.cwd, 'package.json');

    let pkgJson: Record<string, unknown> = {};

    if (this.vfs.existsSync(pkgJsonPath)) {
      pkgJson = JSON.parse(this.vfs.readFileSync(pkgJsonPath, 'utf8'));
    }

    const field = isDev ? 'devDependencies' : 'dependencies';

    if (!pkgJson[field]) {
      pkgJson[field] = {};
    }

    (pkgJson[field] as Record<string, string>)[packageName] = version;

    this.vfs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));
  }

  /**
   * List installed packages
   */
  list(): Record<string, string> {
    const nodeModulesPath = path.join(this.cwd, 'node_modules');

    if (!this.vfs.existsSync(nodeModulesPath)) {
      return {};
    }

    const packages: Record<string, string> = {};
    const entries = this.vfs.readdirSync(nodeModulesPath);

    for (const entry of entries) {
      // Skip hidden files and non-package entries
      if (entry.startsWith('.')) continue;

      // Handle scoped packages (@org/pkg)
      if (entry.startsWith('@')) {
        const scopePath = path.join(nodeModulesPath, entry);
        const scopedPkgs = this.vfs.readdirSync(scopePath);

        for (const scopedPkg of scopedPkgs) {
          const pkgJsonPath = path.join(scopePath, scopedPkg, 'package.json');
          if (this.vfs.existsSync(pkgJsonPath)) {
            const pkgJson = JSON.parse(this.vfs.readFileSync(pkgJsonPath, 'utf8'));
            packages[`${entry}/${scopedPkg}`] = pkgJson.version;
          }
        }
      } else {
        const pkgJsonPath = path.join(nodeModulesPath, entry, 'package.json');
        if (this.vfs.existsSync(pkgJsonPath)) {
          const pkgJson = JSON.parse(this.vfs.readFileSync(pkgJsonPath, 'utf8'));
          packages[entry] = pkgJson.version;
        }
      }
    }

    return packages;
  }
}

/**
 * Parse a package specifier into name and version
 * Examples: "express", "express@4.18.2", "@types/node@18"
 */
function parsePackageSpec(spec: string): { name: string; version?: string } {
  // Handle scoped packages
  if (spec.startsWith('@')) {
    const slashIndex = spec.indexOf('/');
    if (slashIndex === -1) {
      throw new Error(`Invalid package spec: ${spec}`);
    }

    const afterSlash = spec.slice(slashIndex + 1);
    const atIndex = afterSlash.indexOf('@');

    if (atIndex === -1) {
      return { name: spec };
    }

    return {
      name: spec.slice(0, slashIndex + 1 + atIndex),
      version: afterSlash.slice(atIndex + 1),
    };
  }

  // Regular packages
  const atIndex = spec.indexOf('@');
  if (atIndex === -1) {
    return { name: spec };
  }

  return {
    name: spec.slice(0, atIndex),
    version: spec.slice(atIndex + 1),
  };
}

// Convenience function for quick installs
export async function install(
  packageSpec: string,
  vfs: VirtualFS,
  options?: InstallOptions
): Promise<InstallResult> {
  const pm = new PackageManager(vfs);
  return pm.install(packageSpec, options);
}

// Re-export types and modules
export { Registry } from './registry';
export type { RegistryOptions, PackageVersion, PackageManifest } from './registry';
export type { ResolvedPackage, ResolveOptions } from './resolver';
export type { ExtractOptions } from './tarball';
export { parsePackageSpec };
