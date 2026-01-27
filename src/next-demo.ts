/**
 * Next.js Demo - Running Next.js-style app in the browser using our Node.js shims
 */

import { VirtualFS } from './virtual-fs';
import { Runtime } from './runtime';
import { NextDevServer } from './frameworks/next-dev-server';
import { getServerBridge } from './server-bridge';
import { Buffer } from './shims/stream';

/**
 * Create a Next.js project structure in the virtual filesystem
 */
export function createNextProject(vfs: VirtualFS): void {
  // Create package.json
  vfs.writeFileSync(
    '/package.json',
    JSON.stringify(
      {
        name: 'next-browser-demo',
        version: '1.0.0',
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
        },
        dependencies: {
          next: '^14.0.0',
          react: '^18.2.0',
          'react-dom': '^18.2.0',
        },
      },
      null,
      2
    )
  );

  // Create directories
  vfs.mkdirSync('/pages', { recursive: true });
  vfs.mkdirSync('/pages/api', { recursive: true });
  vfs.mkdirSync('/pages/users', { recursive: true });
  vfs.mkdirSync('/public', { recursive: true });
  vfs.mkdirSync('/styles', { recursive: true });

  // Create global styles
  vfs.writeFileSync(
    '/styles/globals.css',
    `* {
  box-sizing: border-box;
}

:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 214, 219, 220;
  --background-end-rgb: 255, 255, 255;
}

body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: linear-gradient(
    to bottom,
    transparent,
    rgb(var(--background-end-rgb))
  ) rgb(var(--background-start-rgb));
  min-height: 100vh;
}

a {
  color: #0070f3;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 4px 14px 0 rgba(0, 0, 0, 0.1);
  margin-bottom: 1rem;
}

.counter-display {
  font-size: 4rem;
  font-weight: bold;
  text-align: center;
  padding: 1rem;
}

.counter-buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 1rem;
}

button {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  border: none;
  border-radius: 8px;
  background: #0070f3;
  color: white;
  cursor: pointer;
  transition: background 0.2s;
}

button:hover {
  background: #005cc5;
}

nav {
  background: white;
  padding: 1rem 2rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  margin-bottom: 2rem;
}

nav ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 1.5rem;
}

.api-result {
  background: #f5f5f5;
  padding: 1rem;
  border-radius: 8px;
  font-family: monospace;
  margin-top: 1rem;
}
`
  );

  // Create index page
  vfs.writeFileSync(
    '/pages/index.jsx',
    `import React, { useState } from 'react';
import Link from 'next/link';

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className="card">
      <h2>Interactive Counter</h2>
      <div className="counter-display">{count}</div>
      <div className="counter-buttons">
        <button onClick={() => setCount(c => c - 1)}>-</button>
        <button onClick={() => setCount(0)}>Reset</button>
        <button onClick={() => setCount(c => c + 1)}>+</button>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div>
      <nav>
        <ul>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/about">About</Link></li>
          <li><Link href="/users/1">User 1</Link></li>
          <li><Link href="/api-demo">API Demo</Link></li>
        </ul>
      </nav>

      <div className="container">
        <h1>Welcome to Next.js in Browser!</h1>
        <p>This is a Next.js-style app running entirely in your browser.</p>

        <Counter />

        <div className="card">
          <h3>Features</h3>
          <ul>
            <li>File-based routing (/pages directory)</li>
            <li>Dynamic routes (/users/[id])</li>
            <li>API routes (/api/*)</li>
            <li>Hot Module Replacement</li>
            <li>React Refresh (preserves state)</li>
          </ul>
        </div>

        <div className="card">
          <h3>How it works</h3>
          <p>
            This demo uses a Service Worker to intercept requests and serve files
            from a virtual filesystem. JSX is transformed to JavaScript using esbuild-wasm,
            and React Refresh enables state-preserving HMR.
          </p>
        </div>
      </div>
    </div>
  );
}
`
  );

  // Create about page
  vfs.writeFileSync(
    '/pages/about.jsx',
    `import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function About() {
  const router = useRouter();

  return (
    <div>
      <nav>
        <ul>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/about">About</Link></li>
          <li><Link href="/users/1">User 1</Link></li>
          <li><Link href="/api-demo">API Demo</Link></li>
        </ul>
      </nav>

      <div className="container">
        <h1>About Page</h1>

        <div className="card">
          <p>Current path: <code>{router.pathname}</code></p>
          <p>This page demonstrates:</p>
          <ul>
            <li>File-based routing</li>
            <li>next/router hook</li>
            <li>Client-side navigation</li>
          </ul>
        </div>

        <div className="card">
          <h3>Navigation</h3>
          <p>Try clicking the links above to navigate between pages without full page reloads.</p>
          <button onClick={() => router.push('/')}>
            Go Home (using router.push)
          </button>
        </div>
      </div>
    </div>
  );
}
`
  );

  // Create dynamic user page
  vfs.writeFileSync(
    '/pages/users/[id].jsx',
    `import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const users = {
  '1': { name: 'Alice Johnson', email: 'alice@example.com', role: 'Developer' },
  '2': { name: 'Bob Smith', email: 'bob@example.com', role: 'Designer' },
  '3': { name: 'Carol Williams', email: 'carol@example.com', role: 'Manager' },
};

export default function UserPage() {
  const router = useRouter();
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    // Extract user ID from pathname
    const match = window.location.pathname.match(/\\/users\\/([^\\/]+)/);
    if (match) {
      setUserId(match[1]);
    }
  }, [router.pathname]);

  const user = userId ? users[userId] : null;

  return (
    <div>
      <nav>
        <ul>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/about">About</Link></li>
          <li><Link href="/users/1">User 1</Link></li>
          <li><Link href="/users/2">User 2</Link></li>
          <li><Link href="/users/3">User 3</Link></li>
        </ul>
      </nav>

      <div className="container">
        <h1>User Profile</h1>

        {user ? (
          <div className="card">
            <h2>{user.name}</h2>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Role:</strong> {user.role}</p>
            <p><strong>User ID:</strong> {userId}</p>
          </div>
        ) : (
          <div className="card">
            <p>Loading user... (ID: {userId || 'unknown'})</p>
          </div>
        )}

        <div className="card">
          <h3>Dynamic Routing</h3>
          <p>This page uses the <code>[id]</code> dynamic segment.</p>
          <p>The route <code>/users/[id].jsx</code> matches any <code>/users/*</code> path.</p>
        </div>
      </div>
    </div>
  );
}
`
  );

  // Create API demo page
  vfs.writeFileSync(
    '/pages/api-demo.jsx',
    `import React, { useState } from 'react';
import Link from 'next/link';

export default function ApiDemo() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const callApi = async (endpoint) => {
    setLoading(true);
    try {
      const response = await fetch(endpoint);
      const data = await response.json();
      setResult({ endpoint, data, status: response.status });
    } catch (error) {
      setResult({ endpoint, error: error.message, status: 'error' });
    }
    setLoading(false);
  };

  return (
    <div>
      <nav>
        <ul>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/about">About</Link></li>
          <li><Link href="/api-demo">API Demo</Link></li>
        </ul>
      </nav>

      <div className="container">
        <h1>API Routes Demo</h1>

        <div className="card">
          <h3>Test API Endpoints</h3>
          <p>Click a button to call an API route:</p>

          <div className="counter-buttons">
            <button onClick={() => callApi('/api/hello')} disabled={loading}>
              GET /api/hello
            </button>
            <button onClick={() => callApi('/api/users')} disabled={loading}>
              GET /api/users
            </button>
            <button onClick={() => callApi('/api/time')} disabled={loading}>
              GET /api/time
            </button>
          </div>

          {result && (
            <div className="api-result">
              <strong>Endpoint:</strong> {result.endpoint}<br/>
              <strong>Status:</strong> {result.status}<br/>
              <strong>Response:</strong>
              <pre>{JSON.stringify(result.data || result.error, null, 2)}</pre>
            </div>
          )}
        </div>

        <div className="card">
          <h3>About API Routes</h3>
          <p>
            API routes are defined in <code>/pages/api/</code> directory.
            Each file exports a handler function that receives request and response objects.
          </p>
        </div>
      </div>
    </div>
  );
}
`
  );

  // Create API routes
  vfs.writeFileSync(
    '/pages/api/hello.js',
    `export default function handler(req, res) {
  res.status(200).json({
    message: 'Hello from Next.js API!',
    timestamp: new Date().toISOString(),
  });
}
`
  );

  vfs.writeFileSync(
    '/pages/api/users.js',
    `export default function handler(req, res) {
  const users = [
    { id: 1, name: 'Alice Johnson', email: 'alice@example.com' },
    { id: 2, name: 'Bob Smith', email: 'bob@example.com' },
    { id: 3, name: 'Carol Williams', email: 'carol@example.com' },
  ];

  res.status(200).json({ users, count: users.length });
}
`
  );

  vfs.writeFileSync(
    '/pages/api/time.js',
    `export default function handler(req, res) {
  const now = new Date();

  res.status(200).json({
    iso: now.toISOString(),
    local: now.toLocaleString(),
    unix: Math.floor(now.getTime() / 1000),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}
`
  );

  // Create 404 page
  vfs.writeFileSync(
    '/pages/404.jsx',
    `import React from 'react';
import Link from 'next/link';

export default function Custom404() {
  return (
    <div className="container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
      <h1 style={{ fontSize: '4rem', margin: 0 }}>404</h1>
      <p style={{ fontSize: '1.5rem', color: '#666' }}>Page Not Found</p>
      <p>
        <Link href="/">Go back home</Link>
      </p>
    </div>
  );
}
`
  );

  // Create public files
  vfs.writeFileSync('/public/favicon.ico', 'favicon placeholder');
  vfs.writeFileSync('/public/robots.txt', 'User-agent: *\nAllow: /');
}

/**
 * Create a Next.js App Router project structure in the virtual filesystem
 */
export function createNextAppRouterProject(vfs: VirtualFS): void {
  // Create package.json
  vfs.writeFileSync(
    '/package.json',
    JSON.stringify(
      {
        name: 'next-app-router-demo',
        version: '1.0.0',
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
        },
        dependencies: {
          next: '^14.0.0',
          react: '^18.2.0',
          'react-dom': '^18.2.0',
        },
      },
      null,
      2
    )
  );

  // Create directories
  vfs.mkdirSync('/app', { recursive: true });
  vfs.mkdirSync('/app/about', { recursive: true });
  vfs.mkdirSync('/app/dashboard', { recursive: true });
  vfs.mkdirSync('/app/users', { recursive: true });
  vfs.mkdirSync('/app/users/[id]', { recursive: true });
  vfs.mkdirSync('/public', { recursive: true });

  // Create global styles
  vfs.writeFileSync(
    '/app/globals.css',
    `* {
  box-sizing: border-box;
}

:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 214, 219, 220;
  --background-end-rgb: 255, 255, 255;
}

body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(
    to bottom,
    transparent,
    rgb(var(--background-end-rgb))
  ) rgb(var(--background-start-rgb));
  min-height: 100vh;
}

a {
  color: #0070f3;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 4px 14px 0 rgba(0, 0, 0, 0.1);
  margin-bottom: 1rem;
}

nav {
  background: white;
  padding: 1rem 2rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

nav ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 1.5rem;
}

button {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  border: none;
  border-radius: 8px;
  background: #0070f3;
  color: white;
  cursor: pointer;
  transition: background 0.2s;
}

button:hover {
  background: #005cc5;
}

.counter {
  text-align: center;
  padding: 2rem;
}

.counter-display {
  font-size: 4rem;
  font-weight: bold;
}

.counter-buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 1rem;
}

.layout-indicator {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  background: #333;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-size: 0.75rem;
}
`
  );

  // Create root layout
  vfs.writeFileSync(
    '/app/layout.jsx',
    `import React from 'react';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <title>Next.js App Router Demo</title>
      </head>
      <body>
        <nav>
          <ul>
            <li><a href="/">Home</a></li>
            <li><a href="/about">About</a></li>
            <li><a href="/dashboard">Dashboard</a></li>
            <li><a href="/users/1">User 1</a></li>
          </ul>
        </nav>
        <main>
          {children}
        </main>
        <div className="layout-indicator">Root Layout</div>
      </body>
    </html>
  );
}
`
  );

  // Create home page
  vfs.writeFileSync(
    '/app/page.jsx',
    `'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className="counter card">
      <h2>Interactive Counter</h2>
      <div className="counter-display">{count}</div>
      <div className="counter-buttons">
        <button onClick={() => setCount(c => c - 1)}>-</button>
        <button onClick={() => setCount(0)}>Reset</button>
        <button onClick={() => setCount(c => c + 1)}>+</button>
      </div>
      <p style={{ marginTop: '1rem', color: '#666' }}>
        Edit this file and save - counter state will be preserved!
      </p>
    </div>
  );
}

export default function HomePage() {
  const pathname = usePathname();

  return (
    <div className="container">
      <h1>Welcome to Next.js App Router!</h1>
      <p>Current path: <code>{pathname}</code></p>

      <Counter />

      <div className="card">
        <h3>App Router Features</h3>
        <ul>
          <li><strong>Nested Layouts</strong> - See the layout indicator in the corner</li>
          <li><strong>usePathname()</strong> - App Router navigation hook</li>
          <li><strong>Client Components</strong> - Interactive components with 'use client'</li>
          <li><strong>Dynamic Routes</strong> - /users/[id] pattern</li>
          <li><strong>HMR</strong> - Edit files to see instant updates</li>
        </ul>
      </div>

      <div className="card">
        <h3>How it works</h3>
        <p>
          This is a browser-based Next.js-compatible environment using:
        </p>
        <ul>
          <li>Virtual file system for /app directory</li>
          <li>Service Worker for request interception</li>
          <li>esbuild-wasm for JSX/TypeScript transformation</li>
          <li>React Refresh for state-preserving HMR</li>
        </ul>
      </div>
    </div>
  );
}
`
  );

  // Create about page
  vfs.writeFileSync(
    '/app/about/page.jsx',
    `'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function AboutPage() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="container">
      <h1>About Page</h1>

      <div className="card">
        <p>Current path: <code>{pathname}</code></p>
        <p>
          This page demonstrates the <code>usePathname</code> and{' '}
          <code>useRouter</code> hooks from <code>next/navigation</code>.
        </p>

        <button onClick={() => router.push('/')}>
          Go Home (router.push)
        </button>
      </div>

      <div className="card">
        <h3>App Router vs Pages Router</h3>
        <p>
          The App Router uses <code>next/navigation</code> instead of{' '}
          <code>next/router</code>. Key differences:
        </p>
        <ul>
          <li><code>useRouter()</code> returns push, replace, refresh, back, forward</li>
          <li><code>usePathname()</code> returns current path</li>
          <li><code>useSearchParams()</code> returns URL search params</li>
          <li>No <code>query</code> object - use <code>useParams()</code> instead</li>
        </ul>
      </div>
    </div>
  );
}
`
  );

  // Create dashboard with nested layout
  vfs.writeFileSync(
    '/app/dashboard/layout.jsx',
    `import React from 'react';

export default function DashboardLayout({ children }) {
  return (
    <div>
      <div style={{
        background: '#f0f4f8',
        padding: '1rem',
        marginBottom: '1rem',
        borderRadius: '8px',
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap'
      }}>
        <a href="/dashboard" style={{ fontWeight: 'bold' }}>Dashboard Home</a>
        <span>|</span>
        <a href="/dashboard">Overview</a>
        <a href="/dashboard">Settings</a>
        <a href="/dashboard">Analytics</a>
      </div>
      {children}
      <div className="layout-indicator" style={{ bottom: '3rem' }}>
        Dashboard Layout (nested)
      </div>
    </div>
  );
}
`
  );

  vfs.writeFileSync(
    '/app/dashboard/page.jsx',
    `'use client';

import React, { useState } from 'react';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="container">
      <h1>Dashboard</h1>

      <div className="card">
        <p>
          This page demonstrates <strong>nested layouts</strong>. Notice there
          are two layout indicators - one from the root layout and one from the
          dashboard layout.
        </p>
      </div>

      <div className="card">
        <h3>Dashboard Content</h3>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            onClick={() => setActiveTab('overview')}
            style={{ opacity: activeTab === 'overview' ? 1 : 0.6 }}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            style={{ opacity: activeTab === 'stats' ? 1 : 0.6 }}
          >
            Stats
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            style={{ opacity: activeTab === 'settings' ? 1 : 0.6 }}
          >
            Settings
          </button>
        </div>

        <div style={{ padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
          {activeTab === 'overview' && (
            <div>
              <h4>Overview</h4>
              <p>Welcome to your dashboard. This is the overview tab.</p>
            </div>
          )}
          {activeTab === 'stats' && (
            <div>
              <h4>Statistics</h4>
              <p>Views: 1,234 | Visitors: 567 | Conversions: 89</p>
            </div>
          )}
          {activeTab === 'settings' && (
            <div>
              <h4>Settings</h4>
              <p>Configure your dashboard preferences here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
`
  );

  // Create dynamic user page
  vfs.writeFileSync(
    '/app/users/[id]/page.jsx',
    `'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const users = {
  '1': { name: 'Alice Johnson', email: 'alice@example.com', role: 'Developer' },
  '2': { name: 'Bob Smith', email: 'bob@example.com', role: 'Designer' },
  '3': { name: 'Carol Williams', email: 'carol@example.com', role: 'Manager' },
};

export default function UserPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    // Extract user ID from pathname
    const match = pathname.match(/\\/users\\/([^\\/]+)/);
    if (match) {
      setUserId(match[1]);
    }
  }, [pathname]);

  const user = userId ? users[userId] : null;

  return (
    <div className="container">
      <h1>User Profile</h1>

      {user ? (
        <div className="card">
          <h2>{user.name}</h2>
          <p><strong>Email:</strong> {user.email}</p>
          <p><strong>Role:</strong> {user.role}</p>
          <p><strong>User ID:</strong> {userId}</p>
        </div>
      ) : userId ? (
        <div className="card">
          <p>User not found: {userId}</p>
        </div>
      ) : (
        <div className="card">
          <p>Loading...</p>
        </div>
      )}

      <div className="card">
        <h3>Navigate to other users:</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => router.push('/users/1')}>User 1</button>
          <button onClick={() => router.push('/users/2')}>User 2</button>
          <button onClick={() => router.push('/users/3')}>User 3</button>
        </div>
      </div>

      <div className="card">
        <h3>Dynamic Routes in App Router</h3>
        <p>
          This page uses the <code>[id]</code> dynamic segment.
          The folder structure is: <code>/app/users/[id]/page.jsx</code>
        </p>
        <p>
          In the full Next.js, you'd use <code>useParams()</code> to get the ID,
          but here we're parsing it from <code>usePathname()</code>.
        </p>
      </div>
    </div>
  );
}
`
  );

  // Create public files
  vfs.writeFileSync('/public/favicon.ico', 'favicon placeholder');
  vfs.writeFileSync('/public/robots.txt', 'User-agent: *\nAllow: /');
}

/**
 * Initialize the Next.js demo
 */
export async function initNextDemo(
  outputElement: HTMLElement
): Promise<{ vfs: VirtualFS; runtime: Runtime }> {
  const log = (message: string) => {
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    outputElement.appendChild(line);
    outputElement.scrollTop = outputElement.scrollHeight;
  };

  log('Creating virtual file system...');
  const vfs = new VirtualFS();

  log('Creating Next.js project structure...');
  createNextProject(vfs);

  log('Initializing runtime...');
  const runtime = new Runtime(vfs, {
    cwd: '/',
    env: {
      NODE_ENV: 'development',
    },
    onConsole: (method, args) => {
      const prefix = method === 'error' ? '[ERROR]' : method === 'warn' ? '[WARN]' : '';
      log(`${prefix} ${args.map((a) => String(a)).join(' ')}`);
    },
  });

  log('Setting up file watcher...');
  vfs.watch('/pages', { recursive: true }, (eventType, filename) => {
    log(`File ${eventType}: ${filename}`);
  });

  log('Next.js demo initialized!');
  log('');
  log('Virtual FS contents:');
  listFiles(vfs, '/', log, '  ');

  return { vfs, runtime };
}

/**
 * Start the Next.js dev server using Service Worker approach
 */
export async function startNextDevServer(
  vfs: VirtualFS,
  options: {
    port?: number;
    log?: (message: string) => void;
  } = {}
): Promise<{
  server: NextDevServer;
  url: string;
  stop: () => void;
}> {
  const port = options.port || 3001;
  const log = options.log || console.log;

  log('Starting Next.js dev server...');

  // Create NextDevServer
  const server = new NextDevServer(vfs, { port, root: '/' });

  // Get the server bridge
  const bridge = getServerBridge();

  // Initialize Service Worker
  try {
    log('Initializing Service Worker...');
    await bridge.initServiceWorker();
    log('Service Worker ready');
  } catch (error) {
    log(`Warning: Service Worker failed to initialize: ${error}`);
    log('Falling back to direct request handling...');
  }

  // Register the server with the bridge
  bridge.on('server-ready', (p: unknown, u: unknown) => {
    log(`Server ready at ${u}`);
  });

  // Wire up the NextDevServer to handle requests through the bridge
  const httpServer = createHttpServerWrapper(server);
  bridge.registerServer(httpServer, port);

  // Start watching for file changes
  server.start();
  log('File watcher started');

  // Set up HMR event forwarding
  server.on('hmr-update', (update: unknown) => {
    log(`HMR update: ${JSON.stringify(update)}`);
  });

  const url = bridge.getServerUrl(port);
  log(`Next.js dev server running at: ${url}/`);

  return {
    server,
    url: url + '/',
    stop: () => {
      server.stop();
      bridge.unregisterServer(port);
    },
  };
}

/**
 * Create an http.Server-compatible wrapper around NextDevServer
 */
function createHttpServerWrapper(devServer: NextDevServer) {
  return {
    listening: true,
    address: () => ({ port: devServer.getPort(), address: '0.0.0.0', family: 'IPv4' }),
    async handleRequest(
      method: string,
      url: string,
      headers: Record<string, string>,
      body?: string | Buffer
    ) {
      const bodyBuffer = body
        ? typeof body === 'string'
          ? Buffer.from(body)
          : body
        : undefined;
      return devServer.handleRequest(method, url, headers, bodyBuffer);
    },
  };
}

function listFiles(
  vfs: VirtualFS,
  path: string,
  log: (msg: string) => void,
  indent: string
): void {
  try {
    const entries = vfs.readdirSync(path);
    for (const entry of entries) {
      const fullPath = path === '/' ? '/' + entry : path + '/' + entry;
      const stats = vfs.statSync(fullPath);
      if (stats.isDirectory()) {
        log(`${indent}📁 ${entry}/`);
        listFiles(vfs, fullPath, log, indent + '  ');
      } else {
        log(`${indent}📄 ${entry}`);
      }
    }
  } catch (e) {
    log(`${indent}Error: ${e}`);
  }
}

/**
 * Initialize the Next.js App Router demo
 */
export async function initNextAppRouterDemo(
  outputElement: HTMLElement
): Promise<{ vfs: VirtualFS; runtime: Runtime }> {
  const log = (message: string) => {
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    outputElement.appendChild(line);
    outputElement.scrollTop = outputElement.scrollHeight;
  };

  log('Creating virtual file system...');
  const vfs = new VirtualFS();

  log('Creating Next.js App Router project structure...');
  createNextAppRouterProject(vfs);

  log('Initializing runtime...');
  const runtime = new Runtime(vfs, {
    cwd: '/',
    env: {
      NODE_ENV: 'development',
    },
    onConsole: (method, args) => {
      const prefix = method === 'error' ? '[ERROR]' : method === 'warn' ? '[WARN]' : '';
      log(`${prefix} ${args.map((a) => String(a)).join(' ')}`);
    },
  });

  log('Setting up file watcher...');
  vfs.watch('/app', { recursive: true }, (eventType, filename) => {
    log(`File ${eventType}: ${filename}`);
  });

  log('Next.js App Router demo initialized!');
  log('');
  log('Virtual FS contents:');
  listFiles(vfs, '/', log, '  ');

  return { vfs, runtime };
}

// Export for use in the demo page
export { VirtualFS, Runtime, NextDevServer };
