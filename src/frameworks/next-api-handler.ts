/**
 * Next.js API route handling
 * Standalone functions extracted from NextDevServer for creating mock
 * request/response objects and executing API handlers.
 */

import { ResponseData } from '../dev-server';
import { Buffer } from '../shims/stream';

/**
 * Parse cookie header into key-value pairs
 */
export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  });

  return cookies;
}

/**
 * Create mock Next.js request object
 */
export function createMockRequest(
  method: string,
  pathname: string,
  headers: Record<string, string>,
  body?: Buffer
) {
  const url = new URL(pathname, 'http://localhost');

  return {
    method,
    url: pathname,
    headers,
    query: Object.fromEntries(url.searchParams),
    body: body ? JSON.parse(body.toString()) : undefined,
    cookies: parseCookies(headers.cookie || ''),
  };
}

/**
 * Create mock Next.js response object with streaming support
 */
export function createMockResponse() {
  let statusCode = 200;
  let statusMessage = 'OK';
  const headers: Record<string, string> = {};
  let responseBody = '';
  let ended = false;
  let resolveEnded: (() => void) | null = null;
  let headersSent = false;

  // Promise that resolves when response is ended
  const endedPromise = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });

  const markEnded = () => {
    if (!ended) {
      ended = true;
      if (resolveEnded) resolveEnded();
    }
  };

  return {
    // Track if headers have been sent (for streaming)
    headersSent: false,

    status(code: number) {
      statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    getHeader(name: string) {
      return headers[name];
    },
    // Write data to response body (for streaming)
    write(chunk: string | Buffer): boolean {
      if (!headersSent) {
        headersSent = true;
        this.headersSent = true;
      }
      responseBody += typeof chunk === 'string' ? chunk : chunk.toString();
      return true;
    },
    // Writable stream interface for AI SDK compatibility
    get writable() {
      return true;
    },
    json(data: unknown) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      responseBody = JSON.stringify(data);
      markEnded();
      return this;
    },
    send(data: string | object) {
      if (typeof data === 'object') {
        return this.json(data);
      }
      responseBody = data;
      markEnded();
      return this;
    },
    end(data?: string) {
      if (data) responseBody += data;
      markEnded();
      return this;
    },
    redirect(statusOrUrl: number | string, url?: string) {
      if (typeof statusOrUrl === 'number') {
        statusCode = statusOrUrl;
        headers['Location'] = url || '/';
      } else {
        statusCode = 307;
        headers['Location'] = statusOrUrl;
      }
      markEnded();
      return this;
    },
    isEnded() {
      return ended;
    },
    waitForEnd() {
      return endedPromise;
    },
    toResponse(): ResponseData {
      const buffer = Buffer.from(responseBody);
      headers['Content-Length'] = String(buffer.length);
      return {
        statusCode,
        statusMessage,
        headers,
        body: buffer,
      };
    },
  };
}

/**
 * Create a streaming mock response that calls callbacks as data is written
 */
export function createStreamingMockResponse(
  onStart: (statusCode: number, statusMessage: string, headers: Record<string, string>) => void,
  onChunk: (chunk: string | Uint8Array) => void,
  onEnd: () => void
) {
  let statusCode = 200;
  let statusMessage = 'OK';
  const headers: Record<string, string> = {};
  let ended = false;
  let headersSent = false;
  let resolveEnded: (() => void) | null = null;

  const endedPromise = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });

  const sendHeaders = () => {
    if (!headersSent) {
      headersSent = true;
      onStart(statusCode, statusMessage, headers);
    }
  };

  const markEnded = () => {
    if (!ended) {
      sendHeaders();
      ended = true;
      onEnd();
      if (resolveEnded) resolveEnded();
    }
  };

  return {
    headersSent: false,

    status(code: number) {
      statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    getHeader(name: string) {
      return headers[name];
    },
    // Write data and stream it immediately
    write(chunk: string | Buffer): boolean {
      sendHeaders();
      const data = typeof chunk === 'string' ? chunk : chunk.toString();
      onChunk(data);
      return true;
    },
    get writable() {
      return true;
    },
    json(data: unknown) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      sendHeaders();
      onChunk(JSON.stringify(data));
      markEnded();
      return this;
    },
    send(data: string | object) {
      if (typeof data === 'object') {
        return this.json(data);
      }
      sendHeaders();
      onChunk(data);
      markEnded();
      return this;
    },
    end(data?: string) {
      if (data) {
        sendHeaders();
        onChunk(data);
      }
      markEnded();
      return this;
    },
    redirect(statusOrUrl: number | string, url?: string) {
      if (typeof statusOrUrl === 'number') {
        statusCode = statusOrUrl;
        headers['Location'] = url || '/';
      } else {
        statusCode = 307;
        headers['Location'] = statusOrUrl;
      }
      markEnded();
      return this;
    },
    isEnded() {
      return ended;
    },
    waitForEnd() {
      return endedPromise;
    },
    toResponse(): ResponseData {
      // This shouldn't be called for streaming responses
      return {
        statusCode,
        statusMessage,
        headers,
        body: Buffer.from(''),
      };
    },
  };
}

/** Type for mock response objects */
export type MockResponse = ReturnType<typeof createMockResponse>;
export type MockRequest = ReturnType<typeof createMockRequest>;
export type StreamingMockResponse = ReturnType<typeof createStreamingMockResponse>;

/**
 * Create builtin modules map for API handler execution.
 * Optionally includes `fs` shim if a createFsShim function is provided.
 */
export async function createBuiltinModules(
  createFsShim?: () => unknown | Promise<unknown>
): Promise<Record<string, unknown>> {
  const modules: Record<string, unknown> = {
    https: await import('../shims/https'),
    http: await import('../shims/http'),
    path: await import('../shims/path'),
    url: await import('../shims/url'),
    querystring: await import('../shims/querystring'),
    util: await import('../shims/util'),
    events: await import('../shims/events'),
    stream: await import('../shims/stream'),
    buffer: await import('../shims/buffer'),
    crypto: await import('../shims/crypto'),
  };

  if (createFsShim) {
    modules.fs = await createFsShim();
  }

  return modules;
}

/**
 * Execute API handler code in a sandboxed context
 */
export async function executeApiHandler(
  code: string,
  req: MockRequest,
  res: MockResponse | StreamingMockResponse,
  env: Record<string, string> | undefined,
  builtinModules: Record<string, unknown>
): Promise<void> {
  try {
    const require = (id: string): unknown => {
      // Handle node: prefix
      const modId = id.startsWith('node:') ? id.slice(5) : id;
      if (builtinModules[modId]) {
        return builtinModules[modId];
      }
      throw new Error(`Module not found: ${id}`);
    };

    // Create module context
    const module = { exports: {} as Record<string, unknown> };
    const exports = module.exports;

    // Create process object with environment variables
    const process = {
      env: { ...env },
      cwd: () => '/',
      platform: 'browser',
      version: 'v18.0.0',
      versions: { node: '18.0.0' },
    };

    // Execute the transformed code
    const fn = new Function('exports', 'require', 'module', 'process', code);
    fn(exports, require, module, process);

    // Get the handler - check both module.exports and module.exports.default
    let handler: unknown = module.exports.default || module.exports;

    // If handler is still an object with a default property, unwrap it
    if (typeof handler === 'object' && handler !== null && 'default' in handler) {
      handler = (handler as { default: unknown }).default;
    }

    if (typeof handler !== 'function') {
      throw new Error('No default export handler found');
    }

    // Call the handler - it may be async
    const result = (handler as (req: unknown, res: unknown) => unknown)(req, res);

    // If the handler returns a promise, wait for it
    if (result instanceof Promise) {
      await result;
    }
  } catch (error) {
    console.error('[NextDevServer] API handler error:', error);
    throw error;
  }
}
