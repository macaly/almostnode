/**
 * Node.js path module shim
 * Implements POSIX path operations for virtual file system
 */

export const sep = '/';
export const delimiter = ':';

export function normalize(path: string): string {
  if (!path) return '.';

  const isAbsolute = path.startsWith('/');
  const parts = path.split('/').filter(Boolean);
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      if (resolved.length > 0 && resolved[resolved.length - 1] !== '..') {
        resolved.pop();
      } else if (!isAbsolute) {
        resolved.push('..');
      }
    } else if (part !== '.') {
      resolved.push(part);
    }
  }

  let result = resolved.join('/');
  if (isAbsolute) {
    result = '/' + result;
  }

  return result || '.';
}

export function join(...paths: string[]): string {
  if (paths.length === 0) return '.';
  return normalize(paths.filter(Boolean).join('/'));
}

export function resolve(...paths: string[]): string {
  let resolvedPath = '';

  for (let i = paths.length - 1; i >= 0 && !resolvedPath.startsWith('/'); i--) {
    const path = paths[i];
    if (!path) continue;
    resolvedPath = path + (resolvedPath ? '/' + resolvedPath : '');
  }

  if (!resolvedPath.startsWith('/')) {
    resolvedPath = '/' + resolvedPath;
  }

  return normalize(resolvedPath);
}

export function isAbsolute(path: string): boolean {
  return path.startsWith('/');
}

export function dirname(path: string): string {
  if (!path) return '.';

  const normalized = normalize(path);
  const lastSlash = normalized.lastIndexOf('/');

  if (lastSlash === -1) return '.';
  if (lastSlash === 0) return '/';

  return normalized.slice(0, lastSlash);
}

export function basename(path: string, ext?: string): string {
  if (!path) return '';

  const normalized = normalize(path);
  let base = normalized.slice(normalized.lastIndexOf('/') + 1);

  if (ext && base.endsWith(ext)) {
    base = base.slice(0, -ext.length);
  }

  return base;
}

export function extname(path: string): string {
  const base = basename(path);
  const dotIndex = base.lastIndexOf('.');

  if (dotIndex <= 0) return '';

  return base.slice(dotIndex);
}

export function relative(from: string, to: string): string {
  from = resolve(from);
  to = resolve(to);

  if (from === to) return '';

  const fromParts = from.split('/').filter(Boolean);
  const toParts = to.split('/').filter(Boolean);

  let commonLength = 0;
  for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
    if (fromParts[i] !== toParts[i]) break;
    commonLength++;
  }

  const upCount = fromParts.length - commonLength;
  const remainingPath = toParts.slice(commonLength);

  const result = [...Array(upCount).fill('..'), ...remainingPath];

  return result.join('/') || '.';
}

export function parse(path: string): {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
} {
  const normalized = normalize(path);
  const isAbs = isAbsolute(normalized);
  const dir = dirname(normalized);
  const base = basename(normalized);
  const ext = extname(normalized);
  const name = base.slice(0, base.length - ext.length);

  return {
    root: isAbs ? '/' : '',
    dir,
    base,
    ext,
    name,
  };
}

export function format(pathObject: {
  root?: string;
  dir?: string;
  base?: string;
  ext?: string;
  name?: string;
}): string {
  const dir = pathObject.dir || pathObject.root || '';
  const base = pathObject.base || (pathObject.name || '') + (pathObject.ext || '');

  if (!dir) return base;
  if (dir === pathObject.root) return dir + base;

  return dir + '/' + base;
}

// POSIX interface (we only support POSIX)
export const posix = {
  sep,
  delimiter,
  normalize,
  join,
  resolve,
  isAbsolute,
  dirname,
  basename,
  extname,
  relative,
  parse,
  format,
};

// Default export for CommonJS compatibility
export default {
  sep,
  delimiter,
  normalize,
  join,
  resolve,
  isAbsolute,
  dirname,
  basename,
  extname,
  relative,
  parse,
  format,
  posix,
};
