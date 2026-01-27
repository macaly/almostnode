/**
 * Next.js Demo - Running Next.js-style app in the browser using our Node.js shims
 */

import { VirtualFS } from './virtual-fs';
import { Runtime } from './runtime';
import { NextDevServer } from './frameworks/next-dev-server';
import { getServerBridge } from './server-bridge';
import { Buffer } from './shims/stream';
import { PackageManager, InstallOptions, InstallResult } from './npm';

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

        {/* Tailwind CSS Demo Section */}
        <div className="mt-6 p-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl shadow-lg text-white">
          <h3 className="text-xl font-bold mb-2">Tailwind CSS is Ready!</h3>
          <p className="opacity-90 mb-4">
            This section uses Tailwind utility classes. Install a package to see more Tailwind demos.
          </p>
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-white/20 rounded-full text-sm">p-6</span>
            <span className="px-3 py-1 bg-white/20 rounded-full text-sm">rounded-xl</span>
            <span className="px-3 py-1 bg-white/20 rounded-full text-sm">shadow-lg</span>
            <span className="px-3 py-1 bg-white/20 rounded-full text-sm">gradient</span>
          </div>
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
      // Use relative path (remove leading slash) so it resolves relative to current page
      const relativePath = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
      const response = await fetch(relativePath);
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
          <h3>Node.js https Module Demo</h3>
          <p style={{ marginBottom: '1rem' }}>
            This endpoint uses Node.js <code>https.get()</code> to fetch data server-side.
            Requires CORS proxy to be configured.
          </p>

          <div className="counter-buttons">
            <button onClick={() => callApi('/api/github-proxy?username=octocat')} disabled={loading}>
              GET /api/github-proxy (Node.js https)
            </button>
          </div>
        </div>

        <div className="card">
          <h3>About API Routes</h3>
          <p>
            API routes are defined in <code>/pages/api/</code> directory.
            Each file exports a handler function that receives request and response objects.
          </p>
          <p style={{ marginTop: '0.5rem', color: '#666' }}>
            The github-proxy endpoint demonstrates using Node.js <code>https</code> module
            to make outbound HTTP requests, similar to how it works in real Node.js.
          </p>
        </div>
      </div>
    </div>
  );
}
`
  );

  // Create external API demo page
  vfs.writeFileSync(
    '/pages/external-api.jsx',
    `import React, { useState } from 'react';
import Link from 'next/link';

export default function ExternalApiDemo() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchGitHubUser = async () => {
    setLoading(true);
    setError(null);
    try {
      // Uses proxyFetch from window - will use proxy if configured
      const response = await window.__proxyFetch('https://api.github.com/users/octocat');
      if (!response.ok) {
        throw new Error('Failed to fetch: ' + response.status);
      }
      const data = await response.json();
      setUser(data);
    } catch (err) {
      setError(err.message);
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
          <li><Link href="/external-api">External API</Link></li>
        </ul>
      </nav>

      <div className="container">
        <h1>External API Demo</h1>

        <div className="p-6 bg-gradient-to-r from-green-400 to-blue-500 rounded-xl text-white mb-6">
          <h2 className="text-xl font-bold mb-2">CORS Proxy Demo</h2>
          <p className="opacity-90">
            This page demonstrates fetching from external APIs.
            Configure a CORS proxy in the editor panel if you encounter CORS errors.
          </p>
        </div>

        <div className="card">
          <h3>GitHub User API</h3>
          <p style={{ marginBottom: '1rem', color: '#666' }}>
            Fetches user data from the GitHub API. If CORS errors occur,
            set a proxy URL like <code>https://corsproxy.io/?</code> in the settings.
          </p>

          <button
            onClick={fetchGitHubUser}
            disabled={loading}
            style={{ marginBottom: '1rem' }}
          >
            {loading ? 'Loading...' : 'Fetch GitHub User (octocat)'}
          </button>

          {error && (
            <div style={{
              background: '#fee2e2',
              color: '#dc2626',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '1rem'
            }}>
              <strong>Error:</strong> {error}
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                Try setting a CORS proxy in the editor panel.
              </p>
            </div>
          )}

          {user && (
            <div style={{
              background: '#f3f4f6',
              padding: '1.5rem',
              borderRadius: '12px',
              display: 'flex',
              gap: '1rem',
              alignItems: 'flex-start'
            }}>
              <img
                src={user.avatar_url}
                alt={user.login}
                style={{ width: '80px', height: '80px', borderRadius: '50%' }}
              />
              <div>
                <h4 style={{ margin: 0, fontSize: '1.25rem' }}>{user.name || user.login}</h4>
                <p style={{ color: '#666', margin: '0.25rem 0' }}>@{user.login}</p>
                {user.bio && <p style={{ margin: '0.5rem 0' }}>{user.bio}</p>}
                <p style={{ fontSize: '0.875rem', color: '#888' }}>
                  Followers: {user.followers} | Public Repos: {user.public_repos}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3>How it works</h3>
          <p>
            External API calls from the browser may be blocked by CORS if the server
            doesn't allow your origin. A CORS proxy forwards your request through a
            server that adds the appropriate headers.
          </p>
          <pre style={{
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: '1rem',
            borderRadius: '8px',
            overflow: 'auto',
            fontSize: '0.875rem'
          }}>
{String.raw\`// Without proxy (may fail with CORS error)
fetch('https://api.github.com/users/octocat')

// With proxy configured
setCorsProxy('https://corsproxy.io/?');
proxyFetch('https://api.github.com/users/octocat')\`}
          </pre>
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

  // Create API route that demonstrates Node.js https module
  vfs.writeFileSync(
    '/pages/api/github-proxy.js',
    `// This API route uses Node.js https module to make server-side requests
import https from 'https';

export default function handler(req, res) {
  const username = req.query.username || 'octocat';

  // Use Node.js https.get() to fetch from GitHub API
  https.get(\`https://api.github.com/users/\${username}\`, {
    headers: {
      'User-Agent': 'Node.js-Browser-Runtime',
      'Accept': 'application/json'
    }
  }, (response) => {
    let data = '';

    response.on('data', (chunk) => {
      data += chunk;
    });

    response.on('end', () => {
      try {
        const user = JSON.parse(data);
        res.status(200).json({
          success: true,
          message: 'Fetched using Node.js https module!',
          user: {
            login: user.login,
            name: user.name,
            bio: user.bio,
            avatar_url: user.avatar_url,
            followers: user.followers,
            public_repos: user.public_repos,
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Failed to parse response',
          raw: data.substring(0, 200)
        });
      }
    });
  }).on('error', (error) => {
    res.status(500).json({
      success: false,
      error: error.message,
      hint: 'Make sure CORS proxy is configured for https.get() to work'
    });
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

  // Create TypeScript example page
  vfs.mkdirSync('/pages/typescript', { recursive: true });
  vfs.writeFileSync(
    '/pages/typescript/index.tsx',
    `import React, { useState, useCallback } from 'react';
import Link from 'next/link';

// TypeScript interfaces
interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}

// Typed component with props
function TodoItem({ todo, onToggle, onDelete }: TodoItemProps): JSX.Element {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem',
      background: todo.completed ? '#e8f5e9' : '#fff',
      borderRadius: '4px',
      marginBottom: '0.5rem',
    }}>
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onToggle(todo.id)}
      />
      <span style={{
        flex: 1,
        textDecoration: todo.completed ? 'line-through' : 'none',
        color: todo.completed ? '#888' : '#000',
      }}>
        {todo.text}
      </span>
      <button
        onClick={() => onDelete(todo.id)}
        style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
      >
        Delete
      </button>
    </div>
  );
}

// Main page component with TypeScript
export default function TypeScriptDemo(): JSX.Element {
  const [todos, setTodos] = useState<Todo[]>([
    { id: 1, text: 'Learn TypeScript', completed: true },
    { id: 2, text: 'Build with Next.js', completed: false },
    { id: 3, text: 'Try HMR with types', completed: false },
  ]);
  const [newTodo, setNewTodo] = useState<string>('');

  const addTodo = useCallback((): void => {
    if (!newTodo.trim()) return;
    const todo: Todo = {
      id: Date.now(),
      text: newTodo.trim(),
      completed: false,
    };
    setTodos((prev: Todo[]) => [...prev, todo]);
    setNewTodo('');
  }, [newTodo]);

  const toggleTodo = useCallback((id: number): void => {
    setTodos((prev: Todo[]) =>
      prev.map((t: Todo) => t.id === id ? { ...t, completed: !t.completed } : t)
    );
  }, []);

  const deleteTodo = useCallback((id: number): void => {
    setTodos((prev: Todo[]) => prev.filter((t: Todo) => t.id !== id));
  }, []);

  const completedCount: number = todos.filter((t: Todo) => t.completed).length;

  return (
    <div>
      <nav>
        <ul>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/about">About</Link></li>
          <li><Link href="/typescript">TypeScript Demo</Link></li>
        </ul>
      </nav>

      <div className="container">
        <h1>TypeScript Demo</h1>
        <p>This page is written in <code>.tsx</code> with full type annotations!</p>

        <div className="card">
          <h3>Todo List ({completedCount}/{todos.length} completed)</h3>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              value={newTodo}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTodo(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && addTodo()}
              placeholder="Add a new todo..."
              style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
            />
            <button onClick={addTodo}>Add</button>
          </div>

          {todos.map((todo: Todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={toggleTodo}
              onDelete={deleteTodo}
            />
          ))}
        </div>

        <div className="card">
          <h3>TypeScript Features Used</h3>
          <ul>
            <li><code>interface Todo</code> - Type definition</li>
            <li><code>useState&lt;Todo[]&gt;</code> - Generic state</li>
            <li><code>JSX.Element</code> - Return type annotation</li>
            <li><code>React.ChangeEvent</code> - Event types</li>
            <li><code>useCallback</code> with typed parameters</li>
          </ul>
          <p style={{ marginTop: '1rem', color: '#666' }}>
            Edit this file and save - HMR will preserve your todo list state!
          </p>
        </div>
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

      {/* Tailwind CSS Demo Section */}
      <div className="mt-6 p-6 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl shadow-lg text-white">
        <h3 className="text-xl font-bold mb-2">Tailwind CSS is Ready!</h3>
        <p className="opacity-90 mb-4">
          This section uses Tailwind utility classes. Install a package to see more Tailwind demos.
        </p>
        <div className="flex gap-2 flex-wrap">
          <span className="px-3 py-1 bg-white/20 rounded-full text-sm">p-6</span>
          <span className="px-3 py-1 bg-white/20 rounded-full text-sm">rounded-xl</span>
          <span className="px-3 py-1 bg-white/20 rounded-full text-sm">shadow-lg</span>
          <span className="px-3 py-1 bg-white/20 rounded-full text-sm">gradient</span>
        </div>
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

  // Create TypeScript example page
  vfs.mkdirSync('/app/typescript', { recursive: true });
  vfs.writeFileSync(
    '/app/typescript/page.tsx',
    `'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// TypeScript types
type FilterType = 'all' | 'active' | 'completed';

interface Task {
  id: number;
  title: string;
  priority: 'low' | 'medium' | 'high';
  done: boolean;
  createdAt: Date;
}

interface TaskListProps {
  tasks: Task[];
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}

// Priority badge component with typed props
function PriorityBadge({ priority }: { priority: Task['priority'] }): JSX.Element {
  const colors: Record<Task['priority'], string> = {
    low: '#4caf50',
    medium: '#ff9800',
    high: '#f44336',
  };

  return (
    <span style={{
      background: colors[priority],
      color: 'white',
      padding: '2px 8px',
      borderRadius: '12px',
      fontSize: '0.7rem',
      textTransform: 'uppercase',
    }}>
      {priority}
    </span>
  );
}

// Task list component
function TaskList({ tasks, onToggle, onDelete }: TaskListProps): JSX.Element {
  if (tasks.length === 0) {
    return <p style={{ color: '#888', fontStyle: 'italic' }}>No tasks to show</p>;
  }

  return (
    <div>
      {tasks.map((task: Task) => (
        <div
          key={task.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem',
            background: task.done ? '#f5f5f5' : 'white',
            borderRadius: '8px',
            marginBottom: '0.5rem',
            border: '1px solid #e0e0e0',
          }}
        >
          <input
            type="checkbox"
            checked={task.done}
            onChange={() => onToggle(task.id)}
            style={{ width: '18px', height: '18px' }}
          />
          <div style={{ flex: 1 }}>
            <div style={{
              textDecoration: task.done ? 'line-through' : 'none',
              color: task.done ? '#888' : '#333',
            }}>
              {task.title}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px' }}>
              Created: {task.createdAt.toLocaleDateString()}
            </div>
          </div>
          <PriorityBadge priority={task.priority} />
          <button
            onClick={() => onDelete(task.id)}
            style={{
              padding: '4px 12px',
              background: '#ffebee',
              border: 'none',
              borderRadius: '4px',
              color: '#c62828',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// Main page component
export default function TypeScriptAppRouterDemo(): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();

  const [tasks, setTasks] = useState<Task[]>([
    { id: 1, title: 'Learn TypeScript generics', priority: 'high', done: false, createdAt: new Date() },
    { id: 2, title: 'Build App Router pages', priority: 'medium', done: true, createdAt: new Date() },
    { id: 3, title: 'Test HMR with types', priority: 'low', done: false, createdAt: new Date() },
  ]);

  const [newTask, setNewTask] = useState<string>('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [filter, setFilter] = useState<FilterType>('all');

  // Typed callbacks
  const addTask = useCallback((): void => {
    if (!newTask.trim()) return;

    const task: Task = {
      id: Date.now(),
      title: newTask.trim(),
      priority,
      done: false,
      createdAt: new Date(),
    };

    setTasks((prev: Task[]) => [...prev, task]);
    setNewTask('');
  }, [newTask, priority]);

  const toggleTask = useCallback((id: number): void => {
    setTasks((prev: Task[]) =>
      prev.map((t: Task) => t.id === id ? { ...t, done: !t.done } : t)
    );
  }, []);

  const deleteTask = useCallback((id: number): void => {
    setTasks((prev: Task[]) => prev.filter((t: Task) => t.id !== id));
  }, []);

  // Memoized filtered tasks
  const filteredTasks = useMemo((): Task[] => {
    switch (filter) {
      case 'active': return tasks.filter((t: Task) => !t.done);
      case 'completed': return tasks.filter((t: Task) => t.done);
      default: return tasks;
    }
  }, [tasks, filter]);

  // Stats with explicit types
  const stats: { total: number; done: number; pending: number } = useMemo(() => ({
    total: tasks.length,
    done: tasks.filter((t: Task) => t.done).length,
    pending: tasks.filter((t: Task) => !t.done).length,
  }), [tasks]);

  return (
    <div className="container">
      <h1>TypeScript + App Router</h1>
      <p>Path: <code>{pathname}</code> | This is <code>/app/typescript/page.tsx</code></p>

      <div className="card">
        <h3>Task Manager ({stats.done}/{stats.total} done)</h3>

        {/* Add task form */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="text"
            value={newTask}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTask(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && addTask()}
            placeholder="Add a new task..."
            style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
          />
          <select
            value={priority}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setPriority(e.target.value as Task['priority'])
            }
            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button onClick={addTask}>Add</button>
        </div>

        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {(['all', 'active', 'completed'] as FilterType[]).map((f: FilterType) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? '#0070f3' : '#e0e0e0',
                color: filter === f ? 'white' : '#333',
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'all' ? \` (\${stats.total})\` : f === 'active' ? \` (\${stats.pending})\` : \` (\${stats.done})\`}
            </button>
          ))}
        </div>

        <TaskList tasks={filteredTasks} onToggle={toggleTask} onDelete={deleteTask} />
      </div>

      <div className="card">
        <h3>TypeScript Features Demonstrated</h3>
        <ul>
          <li><code>type FilterType = 'all' | 'active' | 'completed'</code> - Union types</li>
          <li><code>interface Task</code> with typed properties</li>
          <li><code>Task['priority']</code> - Indexed access types</li>
          <li><code>Record&lt;Task['priority'], string&gt;</code> - Utility types</li>
          <li><code>useMemo&lt;Task[]&gt;</code> - Generic hooks</li>
          <li><code>React.ChangeEvent&lt;HTMLInputElement&gt;</code> - Event types</li>
        </ul>
        <button onClick={() => router.push('/')} style={{ marginTop: '1rem' }}>
          ← Back to Home
        </button>
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
export { VirtualFS, Runtime, NextDevServer, PackageManager };
export type { InstallOptions, InstallResult };
