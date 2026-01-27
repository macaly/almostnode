/**
 * Base DevServer class for framework-specific dev servers
 * This is a framework-agnostic base that can be extended for Vite, Next.js, etc.
 */

import { EventEmitter } from './shims/events';
import { VirtualFS } from './virtual-fs';
import { Buffer } from './shims/stream';

export interface DevServerOptions {
  port: number;
  root?: string;
}

export interface ResponseData {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  body: Buffer;
}

export interface HMRUpdate {
  type: 'update' | 'full-reload';
  path: string;
  timestamp?: number;
}

/**
 * MIME type mapping for common file extensions
 */
const MIME_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  cjs: 'application/javascript; charset=utf-8',
  jsx: 'application/javascript; charset=utf-8',
  ts: 'application/javascript; charset=utf-8',
  tsx: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  pdf: 'application/pdf',
  xml: 'application/xml',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  wasm: 'application/wasm',
  map: 'application/json',
};

/**
 * Base class for framework-specific dev servers.
 * Extend this to create Vite, Next.js, etc. implementations.
 */
export abstract class DevServer extends EventEmitter {
  protected vfs: VirtualFS;
  protected port: number;
  protected root: string;
  protected running: boolean = false;

  constructor(vfs: VirtualFS, options: DevServerOptions) {
    super();
    this.vfs = vfs;
    this.port = options.port;
    this.root = options.root || '/';
  }

  /**
   * Handle an incoming HTTP request
   * Must be implemented by framework-specific subclass
   */
  abstract handleRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: Buffer
  ): Promise<ResponseData>;

  /**
   * Start file watching for HMR
   * Must be implemented by framework-specific subclass
   */
  abstract startWatching(): void;

  /**
   * Stop the server and cleanup
   */
  stop(): void {
    this.running = false;
    this.emit('close');
  }

  /**
   * Start the server
   */
  start(): void {
    this.running = true;
    this.startWatching();
    this.emit('listening', this.port);
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the server's port
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Serve a static file from the virtual filesystem
   */
  protected serveFile(filePath: string): ResponseData {
    try {
      // Normalize path
      const normalizedPath = this.resolvePath(filePath);
      const content = this.vfs.readFileSync(normalizedPath);
      // Ensure we have a Buffer
      const buffer = typeof content === 'string'
        ? Buffer.from(content)
        : Buffer.from(content);

      return {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'Content-Type': this.getMimeType(filePath),
          'Content-Length': String(buffer.length),
          'Cache-Control': 'no-cache',
        },
        body: buffer,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.notFound(filePath);
      }
      return this.serverError(error);
    }
  }

  /**
   * Resolve a URL path to a filesystem path
   */
  protected resolvePath(urlPath: string): string {
    // Remove query string and hash
    let path = urlPath.split('?')[0].split('#')[0];

    // Normalize path
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    // Join with root
    if (this.root !== '/') {
      path = this.root + path;
    }

    return path;
  }

  /**
   * Create a 404 Not Found response
   */
  protected notFound(path: string): ResponseData {
    const body = `Not found: ${path}`;
    return {
      statusCode: 404,
      statusMessage: 'Not Found',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(body)),
      },
      body: Buffer.from(body),
    };
  }

  /**
   * Create a 500 Server Error response
   */
  protected serverError(error: unknown): ResponseData {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const body = `Server Error: ${message}`;
    return {
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(body)),
      },
      body: Buffer.from(body),
    };
  }

  /**
   * Create a redirect response
   */
  protected redirect(location: string, status: 301 | 302 | 307 | 308 = 302): ResponseData {
    return {
      statusCode: status,
      statusMessage: status === 301 ? 'Moved Permanently' : 'Found',
      headers: {
        Location: location,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': '0',
      },
      body: Buffer.from(''),
    };
  }

  /**
   * Get MIME type for a file path
   */
  protected getMimeType(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    return MIME_TYPES[ext] || 'application/octet-stream';
  }

  /**
   * Check if a path exists in the virtual filesystem
   */
  protected exists(path: string): boolean {
    try {
      this.vfs.statSync(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a path is a directory
   */
  protected isDirectory(path: string): boolean {
    try {
      return this.vfs.statSync(path).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Emit an HMR update event
   */
  protected emitHMRUpdate(update: HMRUpdate): void {
    this.emit('hmr-update', {
      ...update,
      timestamp: update.timestamp || Date.now(),
    });
  }
}

export default DevServer;
