/**
 * Service Worker for Vite dev server in browser
 * Intercepts requests to the virtual Vite server and forwards them to the main thread
 */

const VITE_ORIGIN = self.location.origin;
const CACHE_NAME = 'vite-sw-v1';

// Map of pending requests
const pendingRequests = new Map();
let requestId = 0;

// BroadcastChannel for communication with main thread
const channel = new BroadcastChannel('vite-server');

// Listen for messages from main thread
channel.addEventListener('message', (event) => {
  const { type, requestId: reqId, response, error } = event.data;

  if (type === 'response' && pendingRequests.has(reqId)) {
    const { resolve, reject } = pendingRequests.get(reqId);
    pendingRequests.delete(reqId);

    if (error) {
      reject(new Error(error));
    } else {
      resolve(
        new Response(response.body, {
          status: response.status || 200,
          statusText: response.statusText || 'OK',
          headers: new Headers(response.headers || {}),
        })
      );
    }
  }
});

// Install event - take control immediately
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

// Activate event - claim all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Clear old caches
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      ),
    ])
  );
});

// Fetch event - intercept requests to Vite dev server paths
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only intercept requests to our origin
  if (url.origin !== VITE_ORIGIN) {
    return;
  }

  // Check if this is a Vite-related path
  const vitePatterns = [
    /^\/@vite\//,
    /^\/@id\//,
    /^\/@fs\//,
    /^\/node_modules\/.vite\//,
    /^\/src\//,
    /\.(js|ts|jsx|tsx|css|scss|sass|less|vue|svelte)(\?.*)?$/,
    /^\/\?.*$/,
    /^\/__vite_/,
  ];

  const isViteRequest = vitePatterns.some((pattern) => pattern.test(url.pathname));

  if (!isViteRequest) {
    return;
  }

  event.respondWith(handleViteRequest(event.request, url));
});

async function handleViteRequest(request, url) {
  const reqId = ++requestId;

  // Create a promise that will be resolved when we get a response
  const responsePromise = new Promise((resolve, reject) => {
    pendingRequests.set(reqId, { resolve, reject });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(reqId)) {
        pendingRequests.delete(reqId);
        reject(new Error('Request timeout'));
      }
    }, 30000);
  });

  // Send request to main thread
  channel.postMessage({
    type: 'request',
    requestId: reqId,
    url: url.href,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    // Note: We can't easily clone the body in all cases, handle in main thread
  });

  try {
    return await responsePromise;
  } catch (error) {
    console.error('[vite-sw] Request failed:', error);
    return new Response(`Service Worker Error: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

// Handle messages from clients (pages)
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
