/**
 * AI Chatbot Demo with Next.js + Vercel AI SDK
 *
 * This demo creates a chatbot application using:
 * - Next.js App Router for the frontend
 * - Pages Router API routes for the streaming endpoint
 * - Vercel AI SDK with useChat hook
 * - OpenAI (via CORS proxy for browser environment)
 */

import { VirtualFS } from './virtual-fs';

/**
 * Package.json for the AI chatbot app
 */
const PACKAGE_JSON = {
  name: "ai-chatbot-demo",
  version: "0.1.0",
  private: true,
  scripts: {
    dev: "next dev",
    build: "next build",
    start: "next start",
  },
  dependencies: {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "ai": "^5.0.0",
    "@ai-sdk/openai": "^2.0.0",
    "@ai-sdk/react": "^2.0.0",
    "zod": "^3.0.0",
  },
  devDependencies: {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5.9.3",
  }
};

/**
 * Create the AI chatbot project structure in the virtual filesystem
 */
export function createAIChatbotProject(vfs: VirtualFS): void {
  // Create package.json
  vfs.writeFileSync('/package.json', JSON.stringify(PACKAGE_JSON, null, 2));

  // Create directories - App Router + Pages Router (for API)
  vfs.mkdirSync('/app', { recursive: true });
  vfs.mkdirSync('/pages/api', { recursive: true });
  vfs.mkdirSync('/public', { recursive: true });

  // Create TypeScript config
  vfs.writeFileSync('/tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: "es5",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      paths: {
        "@/*": ["./*"]
      }
    },
    include: ["**/*.ts", "**/*.tsx"],
    exclude: ["node_modules"]
  }, null, 2));

  // Create global CSS with Tailwind
  vfs.writeFileSync('/app/globals.css', `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}

.chat-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.message-bubble {
  padding: 1rem;
  border-radius: 1rem;
  margin-bottom: 0.75rem;
  max-width: 80%;
  animation: fadeIn 0.3s ease-out;
}

.message-user {
  background: #3b82f6;
  color: white;
  margin-left: auto;
  border-bottom-right-radius: 0.25rem;
}

.message-assistant {
  background: white;
  color: #1f2937;
  margin-right: auto;
  border-bottom-left-radius: 0.25rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.loading-dots::after {
  content: '';
  animation: dots 1.5s steps(5, end) infinite;
}

@keyframes dots {
  0%, 20% { content: '.'; }
  40% { content: '..'; }
  60%, 100% { content: '...'; }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.input-container {
  position: sticky;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 1rem;
  padding: 1rem;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
}
`);

  // Create root layout (App Router)
  vfs.writeFileSync('/app/layout.tsx', `import React from 'react';
import './globals.css';

export const metadata = {
  title: 'AI Chatbot Demo',
  description: 'A chatbot demo using Next.js and Vercel AI SDK',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="bg-white/10 backdrop-blur-sm border-b border-white/20">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>🤖</span>
            AI Chatbot Demo
          </h1>
          <p className="text-white/70 text-sm mt-1">
            Powered by Vercel AI SDK + OpenAI
          </p>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
`);

  // Create home page with chat UI (App Router)
  // Uses @ai-sdk/react useChat hook (AI SDK v5 API: sendMessage, status)
  vfs.writeFileSync('/app/page.tsx', `"use client";

import React from 'react';
import { useChat } from '@ai-sdk/react';

export default function ChatPage() {
  var loc = typeof window !== 'undefined' ? window.location : null;
  var basePath = loc
    ? (loc.pathname.endsWith('/') ? loc.pathname.slice(0, -1) : loc.pathname)
    : '';

  var [input, setInput] = React.useState('');
  var bottomRef = React.useRef(null);

  var { messages, sendMessage, status, error } = useChat({
    api: basePath + '/api/chat',
  });

  var isLoading = status === 'submitted' || status === 'streaming';

  React.useEffect(function() {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ role: 'user', content: input });
    setInput('');
  }

  function getMessageText(msg) {
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.parts)) {
      return msg.parts
        .filter(function(p) { return p.type === 'text'; })
        .map(function(p) { return p.text; })
        .join('');
    }
    return '';
  }

  return (
    <div className="chat-container">
      {messages.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">💬</div>
          <h2 className="text-2xl font-semibold text-white mb-2">
            Start a conversation
          </h2>
          <p className="text-white/70 max-w-md mx-auto">
            Type a message below to chat with the AI assistant.
            Your conversation will stream in real-time.
          </p>
        </div>
      )}

      <div className="space-y-4 pb-32">
        {messages.map(function(message) {
          return (
            <div
              key={message.id}
              className={'message-bubble ' + (message.role === 'user' ? 'message-user' : 'message-assistant')}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg">
                  {message.role === 'user' ? '👤' : '🤖'}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-sm opacity-70 mb-1">
                    {message.role === 'user' ? 'You' : 'Assistant'}
                  </p>
                  <div className="whitespace-pre-wrap">{getMessageText(message)}</div>
                </div>
              </div>
            </div>
          );
        })}

        {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <div className="message-bubble message-assistant">
            <div className="flex items-start gap-3">
              <span className="text-lg">🤖</span>
              <div className="flex-1">
                <p className="font-medium text-sm opacity-70 mb-1">Assistant</p>
                <div className="loading-dots text-gray-500">Thinking</div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="message-bubble bg-red-100 text-red-700">
            <div className="flex items-start gap-3">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="font-medium">Error</p>
                <p>{error.message}</p>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="input-container">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={function(e) { setInput(e.target.value); }}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1 px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-6 py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-2 text-center">
          Press Enter to send • Streaming responses powered by Vercel AI SDK
        </p>
      </div>
    </div>
  );
}
`);

  // Create API route for chat (Pages Router — proven streaming pattern)
  // Uses real AI SDK with CORS proxy for OpenAI calls from browser.
  // For this simple chatbot (no tools) we skip convertToModelMessages and
  // pass {role, content} CoreMessages directly to streamText.
  vfs.writeFileSync('/pages/api/chat.ts', `import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

var CORS_PROXY = process.env.CORS_PROXY_URL || 'https://corsproxy.io/?';

var openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
  fetch: function(url, init) {
    var proxiedUrl = CORS_PROXY + encodeURIComponent(String(url));
    return globalThis.fetch(proxiedUrl, init);
  },
});

// Extract text content from a UIMessage (handles both content string and parts array)
function getContent(m) {
  if (typeof m.content === 'string' && m.content) return m.content;
  if (Array.isArray(m.parts)) {
    return m.parts
      .filter(function(p) { return p.type === 'text'; })
      .map(function(p) { return p.text; })
      .join('');
  }
  return '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: 'OpenAI API key not configured. Please enter your API key in the demo panel.'
    });
  }

  try {
    var uiMessages = req.body.messages;
    if (!uiMessages || !Array.isArray(uiMessages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    // Convert UIMessages to simple CoreMessages for streamText
    var messages = uiMessages.map(function(m) {
      return { role: m.role, content: getContent(m) };
    });

    var result = streamText({
      model: openai('gpt-4o-mini'),
      messages: messages,
      onError: function(info) {
        console.error('[API /chat] Stream error:', info.error);
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error && error.message ? error.message : 'Internal server error'
      });
    }
  }
}
`);

  // Create public files
  vfs.writeFileSync('/public/favicon.ico', 'favicon placeholder');
  vfs.writeFileSync('/public/robots.txt', 'User-agent: *\nAllow: /');
}

// Export for use in HTML demos
export { PACKAGE_JSON };
