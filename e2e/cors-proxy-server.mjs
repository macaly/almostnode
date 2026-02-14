/**
 * Simple CORS proxy for E2E tests.
 * Forwards requests to the target URL and adds CORS headers.
 *
 * Usage: node e2e/cors-proxy-server.mjs
 * Listens on port 8787 by default.
 *
 * Proxy URL format: http://localhost:8787/?https%3A%2F%2Fapi.openai.com%2F...
 */

import { createServer } from 'node:http';

const PORT = parseInt(process.env.CORS_PROXY_PORT || '8787', 10);

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  // Extract target URL from query string
  const targetUrl = decodeURIComponent(req.url.slice(2)); // skip /?
  if (!targetUrl || !targetUrl.startsWith('http')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request: provide target URL as query parameter');
    return;
  }

  try {
    // Read request body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

    // Forward headers (exclude host and origin)
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (['host', 'origin', 'referer', 'connection'].includes(key)) continue;
      headers[key] = value;
    }

    // Forward request to target
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    // Build response headers with CORS
    const responseHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Expose-Headers': '*',
    };

    // Copy relevant response headers
    for (const [key, value] of response.headers.entries()) {
      if (['content-encoding', 'transfer-encoding', 'connection'].includes(key)) continue;
      responseHeaders[key] = value;
    }

    // Stream response back
    res.writeHead(response.status, responseHeaders);

    if (response.body) {
      const reader = response.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };
      pump().catch(() => res.end());
    } else {
      res.end();
    }
  } catch (err) {
    res.writeHead(502, {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(`Proxy error: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`CORS proxy listening on http://localhost:${PORT}`);
});
