/**
 * Agent Workbench - Virtual Project Seed
 *
 * Creates a Next.js project in VFS with:
 * - Chat UI using useChat from @ai-sdk/react (App Router client page, loaded from esm.sh)
 * - API route using streamText + Pages Router streaming (server, proven pattern)
 * - Tools: read_file, write_file, replace_in_file, list_files, run_bash
 */

import { VirtualFS } from './virtual-fs';

const PACKAGE_JSON = {
  name: 'agent-workbench-app',
  version: '0.1.0',
  private: true,
  scripts: {
    dev: 'next dev',
    build: 'next build',
    start: 'next start',
  },
  dependencies: {
    next: '^14.0.0',
    react: '^18.2.0',
    'react-dom': '^18.2.0',
    ai: '^6.0.0',
    '@ai-sdk/react': '^3.0.0',
  },
};

// ── API Route (/pages/api/chat.ts) — Pages Router for proven streaming ──

const API_ROUTE = `import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { readFile, writeFile, existsSync, listFiles, statSync, mkdirSync, runCommand, log } from '__project__';

var CORS_PROXY = process.env.CORS_PROXY_URL || 'https://corsproxy.io/?';

var openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
  fetch: function(url, init) {
    var proxiedUrl = CORS_PROXY + encodeURIComponent(String(url));
    return globalThis.fetch(proxiedUrl, init);
  },
});

var SYSTEM_PROMPT = 'You are a frontend developer agent. You help users build and modify a Next.js App Router application running in the browser.\\n\\nAvailable tools:\\n- read_file: Read file contents at a given path\\n- write_file: Create or overwrite a file (parent directories are created automatically)\\n- replace_in_file: Make a targeted text replacement in a file (first occurrence)\\n- list_files: List files and directories at a path\\n- run_bash: Run a shell command (e.g. ls, cat, echo, node scripts)\\n\\nThe project uses Next.js App Router. Current structure:\\n- /app/layout.tsx — Root layout\\n- /app/page.tsx — Root page (the chat UI, but you can replace it)\\n- /public/ — Static assets\\n- /package.json — Project config\\n\\nGuidelines:\\n- You can modify ANY file in the project, including the root page (/app/page.tsx) and layout\\n- The only protected file is /pages/api/chat.ts (the agent API route)\\n- Create new pages under /app/ (e.g. /app/about/page.tsx, /app/dashboard/page.tsx)\\n- After creating a page, tell the user to type the path (e.g. /about) in the preview URL bar and click Go\\n- Use inline styles for styling\\n- Write clean, modern React (JSX/TSX) code\\n- Keep responses concise — explain what you did briefly';

function validatePath(path, isWrite) {
  if (!path.startsWith('/')) return 'Path must be absolute (start with /)';
  if (path.includes('..')) return 'Path must not contain ..';
  if (path.startsWith('/node_modules')) return 'Cannot access /node_modules';
  if (isWrite && path === '/pages/api/chat.ts') return 'Cannot modify the agent API route';
  return null;
}

var agentTools = {
  read_file: tool({
    description: 'Read the contents of a file at the given path',
    inputSchema: z.object({
      path: z.string().describe('Absolute path to the file (e.g. /app/page.tsx)'),
    }),
    execute: async function(args) {
      var err = validatePath(args.path, false);
      if (err) return 'Error: ' + err;
      if (!existsSync(args.path)) return 'Error: File not found: ' + args.path;
      return readFile(args.path);
    },
  }),

  write_file: tool({
    description: 'Write content to a file. Creates the file if it does not exist, or overwrites it. Parent directories are created automatically.',
    inputSchema: z.object({
      path: z.string().describe('Absolute path to the file'),
      content: z.string().describe('Full file content to write'),
    }),
    execute: async function(args) {
      var err = validatePath(args.path, true);
      if (err) return 'Error: ' + err;
      if (args.content.length > 50000) return 'Error: File content too large (max 50KB)';
      var dir = args.path.substring(0, args.path.lastIndexOf('/'));
      if (dir && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFile(args.path, args.content);
      log('File written: ' + args.path + ' (' + args.content.length + ' chars)');
      return 'File written successfully';
    },
  }),

  replace_in_file: tool({
    description: 'Replace the first occurrence of old_text with new_text in a file. Use this for targeted edits instead of rewriting the whole file.',
    inputSchema: z.object({
      path: z.string().describe('Absolute path to the file'),
      old_text: z.string().describe('Exact text to find in the file'),
      new_text: z.string().describe('Replacement text'),
    }),
    execute: async function(args) {
      var err = validatePath(args.path, true);
      if (err) return 'Error: ' + err;
      if (!existsSync(args.path)) return 'Error: File not found: ' + args.path;
      var fileContent = readFile(args.path);
      if (!fileContent.includes(args.old_text)) return 'Error: old_text not found in file';
      var newContent = fileContent.replace(args.old_text, args.new_text);
      writeFile(args.path, newContent);
      log('File edited: ' + args.path);
      return 'Replacement made successfully';
    },
  }),

  list_files: tool({
    description: 'List files and directories at the given path. Directories end with /',
    inputSchema: z.object({
      path: z.string().describe('Directory path to list (e.g. / or /app)'),
    }),
    execute: async function(args) {
      var err = validatePath(args.path, false);
      if (err) return 'Error: ' + err;
      if (!existsSync(args.path)) return 'Error: Directory not found: ' + args.path;
      var entries = listFiles(args.path);
      var result = entries.map(function(entry) {
        var fullPath = args.path.endsWith('/') ? args.path + entry : args.path + '/' + entry;
        try {
          var stat = statSync(fullPath);
          return stat.isDirectory() ? entry + '/' : entry;
        } catch (e) {
          return entry;
        }
      });
      return result.join('\\n') || '(empty directory)';
    },
  }),

  run_bash: tool({
    description: 'Run a shell command in the virtual environment. Supports basic commands like ls, cat, echo, mkdir, cp, mv, node. Output is captured and returned.',
    inputSchema: z.object({
      command: z.string().describe('The shell command to run (e.g. "ls -la /app")'),
    }),
    execute: async function(args) {
      if (!args.command) return 'Error: No command provided';
      log('Bash: ' + args.command);
      var result = await runCommand(args.command);
      return result;
    },
  }),
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var uiMessages = req.body.messages;
    if (!uiMessages || !Array.isArray(uiMessages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    var messages = await convertToModelMessages(uiMessages);

    var result = streamText({
      model: openai('gpt-4.1'),
      system: SYSTEM_PROMPT,
      messages: messages,
      tools: agentTools,
      stopWhen: stepCountIs(15),
      onStepFinish: function(step) {
        if (step.toolCalls && step.toolCalls.length > 0) {
          log(step.toolCalls.map(function(tc) { return tc.toolName; }).join(', ') + ' (' + (step.usage.totalTokens || 0) + ' tokens)');
        }
      },
      onError: function(info) {
        log('Stream error: ' + info.error);
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    log('API error: ' + (error && error.message ? error.message : String(error)));
    if (!res.headersSent) {
      res.status(500).json({ error: error && error.message ? error.message : 'Internal server error' });
    }
  }
}
`;

// ── Page (/app/page.tsx) — Chat UI with embedded preview ──
// This runs entirely inside the virtual Next.js via esm.sh imports.

const PAGE = `'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';

function formatToolArgs(toolName, args) {
  if (!args) return '';
  if (toolName === 'write_file') return args.path + ' (' + (args.content || '').length + ' chars)';
  if (toolName === 'run_bash') return args.command || '';
  if (toolName === 'replace_in_file') return args.path || '';
  return args.path || JSON.stringify(args).slice(0, 120);
}

export default function AgentWorkbench() {
  var loc = typeof window !== 'undefined' ? window.location : null;
  var basePath = loc
    ? (loc.pathname.endsWith('/') ? loc.pathname.slice(0, -1) : loc.pathname)
    : '';

  var [input, setInput] = useState('');
  var [pathInput, setPathInput] = useState('/welcome');
  var [previewSrc, setPreviewSrc] = useState(basePath + '/welcome');
  var bottomRef = useRef(null);
  var iframeRef = useRef(null);

  var { messages, sendMessage, status, error } = useChat({
    api: basePath + '/api/chat',
  });

  var isLoading = status === 'submitted' || status === 'streaming';

  useEffect(function() {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Relay HMR messages from parent window to preview iframe
  useEffect(function() {
    function onMessage(event) {
      if (event.data && event.data.channel === 'next-hmr' && iframeRef.current && iframeRef.current.contentWindow) {
        try { iframeRef.current.contentWindow.postMessage(event.data, '*'); } catch(e) {}
      }
    }
    window.addEventListener('message', onMessage);
    return function() { window.removeEventListener('message', onMessage); };
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput('');
  }

  function navigatePreview(path) {
    if (!path) return;
    var p = path.startsWith('/') ? path : '/' + path;
    setPathInput(p);
    setPreviewSrc(basePath + p);
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#0a0a0a', color: '#e0e0e0' }}>
      {/* Chat panel */}
      <div style={{ width: 420, minWidth: 320, display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e1e1e' }}>
        {/* Header */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agent Chat</span>
          <span style={{ fontSize: 10, color: '#444' }}>gpt-4.1</span>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, scrollbarWidth: 'thin' }}>
          {messages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: 24, color: '#666' }}>
              <p style={{ fontSize: 14, color: '#aaa', marginBottom: 6, fontWeight: 500 }}>What do you want to build?</p>
              <p style={{ fontSize: 12, lineHeight: 1.7, maxWidth: 280 }}>I can create pages, components, and layouts. The preview updates live via HMR.</p>
            </div>
          )}

          {messages.map(function(m) {
            return (
              <div key={m.id} style={{ marginBottom: 10 }}>
                {m.role === 'user' ? (
                  <div style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.12)', padding: '8px 12px', fontSize: 13, color: '#00ff88', lineHeight: 1.5, marginLeft: 32 }}>
                    {m.parts && m.parts.filter(function(p) { return p.type === 'text'; }).map(function(p, i) {
                      return <span key={i}>{p.text}</span>;
                    })}
                  </div>
                ) : (
                  <div>
                    {m.parts && m.parts.map(function(part, i) {
                      if (part.type === 'text' && part.text) {
                        return (
                          <div key={i} style={{ padding: '8px 12px', background: '#111', border: '1px solid #1e1e1e', marginBottom: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, lineHeight: 1.6 }}>
                            {part.text}
                          </div>
                        );
                      }
                      var toolMatch = part.type && part.type.match(/^tool-(.+)$/);
                      if (toolMatch) {
                        var toolName = toolMatch[1];
                        var done = part.state === 'result';
                        return (
                          <div key={i} style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 11, margin: '4px 0', padding: '6px 10px', background: '#111', border: '1px solid #1e1e1e', borderLeft: '3px solid ' + (done ? '#00ff88' : '#333') }}>
                            <div style={{ fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#00aa66', marginBottom: 2 }}>{toolName}</div>
                            <div style={{ color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatToolArgs(toolName, part.args)}</div>
                            {done && <div style={{ color: '#444', marginTop: 3, maxHeight: 48, overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 10 }}>{String(part.result).slice(0, 200)}</div>}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && messages.length > 0 && (
            <div style={{ fontSize: 12, color: '#666', fontStyle: 'italic', padding: '8px 12px' }}>Thinking...</div>
          )}

          {error && (
            <div style={{ fontSize: 12, color: '#ff6b6b', padding: '8px 12px', background: 'rgba(255,107,107,0.05)', border: '1px solid rgba(255,107,107,0.12)' }}>{error.message}</div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} style={{ padding: '10px 12px', borderTop: '1px solid #1e1e1e', background: '#0d0d0d', display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={input}
            onChange={function(e) { setInput(e.target.value); }}
            placeholder="Ask the agent to build something..."
            disabled={isLoading}
            style={{ flex: 1, padding: '9px 12px', background: '#151515', border: '1px solid #2a2a2a', color: '#e5e5e5', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            style={{ padding: '9px 16px', background: (isLoading || !input.trim()) ? '#333' : '#00ff88', color: '#000', border: 'none', fontWeight: 600, fontSize: 12, cursor: (isLoading || !input.trim()) ? 'default' : 'pointer' }}
          >Send</button>
        </form>
      </div>

      {/* Preview panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#111' }}>
        {/* Preview URL bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #1e1e1e', background: '#0d0d0d' }}>
          <span style={{ fontSize: 10, color: '#555', fontFamily: 'ui-monospace, monospace', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>Preview</span>
          <input
            type="text"
            value={pathInput}
            onChange={function(e) { setPathInput(e.target.value); }}
            onKeyDown={function(e) { if (e.key === 'Enter') navigatePreview(pathInput); }}
            placeholder="/about"
            style={{ flex: 1, padding: '5px 10px', background: '#151515', border: '1px solid #2a2a2a', color: '#e5e5e5', fontSize: 12, fontFamily: 'ui-monospace, monospace', outline: 'none' }}
          />
          <button
            onClick={function() { navigatePreview(pathInput); }}
            style={{ padding: '5px 12px', background: '#1e1e1e', color: '#999', border: 'none', fontSize: 11, cursor: 'pointer', fontFamily: 'ui-monospace, monospace' }}
          >Go</button>
          <button
            onClick={function() { if (iframeRef.current) iframeRef.current.src = iframeRef.current.src; }}
            style={{ padding: '5px 8px', background: '#1e1e1e', color: '#999', border: 'none', fontSize: 13, cursor: 'pointer' }}
          >\\u21bb</button>
        </div>

        {/* Preview content */}
        <div style={{ flex: 1 }}>
          <iframe
            ref={iframeRef}
            src={previewSrc}
            style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
          />
        </div>
      </div>
    </div>
  );
}
`;

export function createAgentWorkbenchProject(vfs: VirtualFS): void {
  vfs.writeFileSync('/package.json', JSON.stringify(PACKAGE_JSON, null, 2));

  vfs.mkdirSync('/app', { recursive: true });
  vfs.mkdirSync('/pages/api', { recursive: true });
  vfs.mkdirSync('/public', { recursive: true });

  vfs.writeFileSync(
    '/tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'es5',
          lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'preserve',
          paths: { '@/*': ['./*'] },
        },
        include: ['**/*.ts', '**/*.tsx'],
        exclude: ['node_modules'],
      },
      null,
      2
    )
  );

  vfs.writeFileSync(
    '/app/layout.tsx',
    `import React from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{\`html, body, #__next { margin: 0; padding: 0; height: 100%; } *, *::before, *::after { box-sizing: border-box; }\`}</style>
      <div style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {children}
      </div>
    </>
  );
}
`
  );

  vfs.writeFileSync('/app/page.tsx', PAGE);
  vfs.writeFileSync('/pages/api/chat.ts', API_ROUTE);

  // Welcome page — shown in the preview iframe by default
  vfs.mkdirSync('/app/welcome', { recursive: true });
  vfs.writeFileSync(
    '/app/welcome/page.tsx',
    `import React from 'react';

export default function WelcomePage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fafafa', color: '#333' }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Welcome</h1>
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6 }}>
          Ask the agent to create a page, then navigate here to see it.
        </p>
      </div>
    </div>
  );
}
`
  );

  vfs.writeFileSync('/public/favicon.ico', 'favicon');
}
