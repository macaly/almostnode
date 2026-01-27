/**
 * Service Worker for Mini WebContainers
 * Intercepts fetch requests and routes them to virtual servers
 * Version: 12 - add COEP/COOP headers for iframe embedding
 */

// Communication port with main thread
let mainPort = null;

// Pending requests waiting for response
const pendingRequests = new Map();
let requestId = 0;

// Registered virtual server ports
const registeredPorts = new Set();

/**
 * Handle messages from main thread
 */
self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  console.log('[SW] Received message:', type, 'hasPort in event.ports:', event.ports?.length > 0);

  // When a MessagePort is transferred, it's in event.ports[0], not event.data.port
  if (type === 'init' && event.ports && event.ports[0]) {
    // Initialize communication channel
    mainPort = event.ports[0];
    mainPort.onmessage = handleMainMessage;
    console.log('[SW] Initialized communication channel with transferred port');
  }

  if (type === 'server-registered' && data) {
    registeredPorts.add(data.port);
    console.log(`[SW] Server registered on port ${data.port}`);
  }

  if (type === 'server-unregistered' && data) {
    registeredPorts.delete(data.port);
    console.log(`[SW] Server unregistered from port ${data.port}`);
  }
});

/**
 * Handle response messages from main thread
 */
function handleMainMessage(event) {
  const { type, id, data, error } = event.data;

  console.log('[SW] Received message from main:', type, 'id:', id, 'hasData:', !!data, 'hasError:', !!error);

  if (type === 'response') {
    const pending = pendingRequests.get(id);
    console.log('[SW] Looking for pending request:', id, 'found:', !!pending);

    if (pending) {
      pendingRequests.delete(id);

      if (error) {
        console.log('[SW] Response error:', error);
        pending.reject(new Error(error));
      } else {
        console.log('[SW] Response data:', {
          statusCode: data?.statusCode,
          statusMessage: data?.statusMessage,
          headers: data?.headers,
          bodyType: data?.body?.constructor?.name,
          bodyLength: data?.body?.length || data?.body?.byteLength,
        });
        pending.resolve(data);
      }
    }
  }
}

/**
 * Send request to main thread and wait for response
 */
async function sendRequest(port, method, url, headers, body) {
  console.log('[SW] sendRequest called, mainPort:', !!mainPort, 'url:', url);

  if (!mainPort) {
    console.error('[SW] No mainPort available! Service Worker not connected to main thread.');
    throw new Error('Service Worker not initialized - no connection to main thread');
  }

  const id = ++requestId;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });

    // Set timeout for request
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }
    }, 30000);

    mainPort.postMessage({
      type: 'request',
      id,
      data: { port, method, url, headers, body },
    });
  });
}

/**
 * Intercept fetch requests
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  console.log('[SW] Fetch:', url.pathname, 'mainPort:', !!mainPort);

  // Check if this is a virtual server request
  const match = url.pathname.match(/^\/__virtual__\/(\d+)(\/.*)?$/);

  if (!match) {
    // Not a virtual request, let it pass through
    return;
  }

  console.log('[SW] Virtual request:', url.pathname);

  const port = parseInt(match[1], 10);
  const path = match[2] || '/';

  // TEST MODE: Return hardcoded response to verify SW is working
  if (url.searchParams.has('__sw_test__')) {
    event.respondWith(new Response(
      '<!DOCTYPE html><html><body><h1>SW Test OK</h1><div id="root">Service Worker is responding correctly!</div></body></html>',
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }
    ));
    return;
  }

  // DEBUG MODE: Return info about what SW receives
  if (url.searchParams.has('__sw_debug__')) {
    event.respondWith((async () => {
      try {
        const response = await sendRequest(port, 'GET', path, {}, null);
        return new Response(
          `<!DOCTYPE html><html><body><h1>SW Debug</h1><pre>${JSON.stringify({
            statusCode: response.statusCode,
            statusMessage: response.statusMessage,
            headers: response.headers,
            bodyBase64Length: response.bodyBase64?.length,
            bodyBase64Start: response.bodyBase64?.substring(0, 100),
          }, null, 2)}</pre></body></html>`,
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      } catch (error) {
        return new Response(`Error: ${error.message}`, { status: 500 });
      }
    })());
    return;
  }

  event.respondWith(handleVirtualRequest(event.request, port, path + url.search));
});

/**
 * Handle a request to a virtual server
 */
async function handleVirtualRequest(request, port, path) {
  try {
    // Build headers object
    const headers = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Get body if present
    let body = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.arrayBuffer();
    }

    console.log('[SW] Sending request to main thread:', port, request.method, path);

    // Send to main thread
    const response = await sendRequest(port, request.method, path, headers, body);

    console.log('[SW] Got response from main thread:', {
      statusCode: response.statusCode,
      headersKeys: response.headers ? Object.keys(response.headers) : [],
      bodyBase64Length: response.bodyBase64?.length,
    });

    // Decode base64 body and create response
    let finalResponse;
    if (response.bodyBase64 && response.bodyBase64.length > 0) {
      try {
        const binary = atob(response.bodyBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        console.log('[SW] Decoded body length:', bytes.length);

        // Use Blob to ensure proper body handling
        const blob = new Blob([bytes], { type: response.headers['Content-Type'] || 'application/octet-stream' });
        console.log('[SW] Created blob size:', blob.size);

        // Merge response headers with CORP/COEP headers to allow iframe embedding
        // The parent page has COEP: credentialless, so we need matching headers
        const headers = new Headers(response.headers);
        headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
        // Remove any headers that might block iframe loading
        headers.delete('X-Frame-Options');

        finalResponse = new Response(blob, {
          status: response.statusCode,
          statusText: response.statusMessage,
          headers: headers,
        });
      } catch (decodeError) {
        console.error('[SW] Failed to decode base64 body:', decodeError);
        finalResponse = new Response(`Decode error: ${decodeError.message}`, {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    } else {
      finalResponse = new Response(null, {
        status: response.statusCode,
        statusText: response.statusMessage,
        headers: response.headers,
      });
    }

    console.log('[SW] Final Response created, status:', finalResponse.status);

    return finalResponse;
  } catch (error) {
    console.error('[SW] Error handling virtual request:', error);
    return new Response(`Service Worker Error: ${error.message}`, {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * Activate immediately
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(self.skipWaiting());
});

/**
 * Claim all clients immediately
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activated');
  event.waitUntil(self.clients.claim());
});
