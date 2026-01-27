/**
 * Node.js url module shim
 * Uses browser's built-in URL API
 */

export interface UrlObject {
  protocol?: string | null;
  slashes?: boolean | null;
  auth?: string | null;
  host?: string | null;
  port?: string | null;
  hostname?: string | null;
  hash?: string | null;
  search?: string | null;
  query?: string | Record<string, string | string[]> | null;
  pathname?: string | null;
  path?: string | null;
  href?: string;
}

export function parse(
  urlString: string,
  parseQueryString: boolean = false,
  slashesDenoteHost: boolean = false
): UrlObject {
  try {
    const url = new URL(urlString, 'http://localhost');
    const result: UrlObject = {
      protocol: url.protocol,
      slashes: url.protocol.endsWith(':'),
      auth: url.username ? `${url.username}:${url.password}` : null,
      host: url.host,
      port: url.port || null,
      hostname: url.hostname,
      hash: url.hash || null,
      search: url.search || null,
      query: parseQueryString ? Object.fromEntries(url.searchParams) : url.search?.slice(1) || null,
      pathname: url.pathname,
      path: url.pathname + url.search,
      href: url.href,
    };
    return result;
  } catch {
    // Handle relative URLs
    return {
      protocol: null,
      slashes: null,
      auth: null,
      host: null,
      port: null,
      hostname: null,
      hash: null,
      search: null,
      query: null,
      pathname: urlString,
      path: urlString,
      href: urlString,
    };
  }
}

export function format(urlObject: UrlObject): string {
  if (urlObject.href) {
    return urlObject.href;
  }

  let result = '';

  if (urlObject.protocol) {
    result += urlObject.protocol;
    if (!urlObject.protocol.endsWith(':')) {
      result += ':';
    }
  }

  if (urlObject.slashes || urlObject.protocol === 'http:' || urlObject.protocol === 'https:') {
    result += '//';
  }

  if (urlObject.auth) {
    result += urlObject.auth + '@';
  }

  if (urlObject.hostname) {
    result += urlObject.hostname;
  } else if (urlObject.host) {
    result += urlObject.host;
  }

  if (urlObject.port) {
    result += ':' + urlObject.port;
  }

  if (urlObject.pathname) {
    result += urlObject.pathname;
  }

  if (urlObject.search) {
    result += urlObject.search;
  } else if (urlObject.query) {
    if (typeof urlObject.query === 'string') {
      result += '?' + urlObject.query;
    } else {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(urlObject.query)) {
        if (Array.isArray(value)) {
          for (const v of value) {
            params.append(key, v);
          }
        } else {
          params.set(key, value);
        }
      }
      const search = params.toString();
      if (search) {
        result += '?' + search;
      }
    }
  }

  if (urlObject.hash) {
    result += urlObject.hash;
  }

  return result;
}

export function resolve(from: string, to: string): string {
  try {
    return new URL(to, from).href;
  } catch {
    return to;
  }
}

// Re-export URL and URLSearchParams from globals
export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;

/**
 * Convert a file:// URL to a file path
 * Node.js: url.fileURLToPath('file:///home/user/file.txt') -> '/home/user/file.txt'
 */
export function fileURLToPath(url: string | URL): string {
  const urlObj = typeof url === 'string' ? new globalThis.URL(url) : url;
  if (urlObj.protocol !== 'file:') {
    throw new TypeError('The URL must be of scheme file');
  }
  // Decode percent-encoded characters and return pathname
  return decodeURIComponent(urlObj.pathname);
}

/**
 * Convert a file path to a file:// URL
 * Node.js: url.pathToFileURL('/home/user/file.txt') -> URL { href: 'file:///home/user/file.txt' }
 */
export function pathToFileURL(path: string): URL {
  // Encode special characters in path
  const encoded = encodeURIComponent(path).replace(/%2F/g, '/');
  return new globalThis.URL('file://' + encoded);
}

export default {
  parse,
  format,
  resolve,
  URL,
  URLSearchParams,
  fileURLToPath,
  pathToFileURL,
};
