# Just Node + AI Chatbot Tutorial

Build a streaming AI chatbot entirely in the browser using Just Node's virtual Node.js runtime, Next.js, and Vercel AI SDK.

## Table of Contents

- [Introduction](#introduction)
- [Quick Start](#quick-start)
- [How Streaming Works](#how-streaming-works)
- [Complete Example](#complete-example)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

---

## Introduction

This tutorial shows how to build a real-time streaming AI chatbot that runs entirely in the browser. The chatbot uses:

- **Next.js** - React framework with App Router
- **Vercel AI SDK** - `useChat` hook for streaming chat UI
- **OpenAI API** - GPT-4o-mini for AI responses
- **CORS Proxy** - Enables browser-based API calls

All code runs client-side - no backend server required.

### What You'll Build

- A chat interface where users can send messages
- Real-time streaming responses that appear word-by-word
- Integration with OpenAI's API via CORS proxy

---

## Quick Start

### Prerequisites

- An OpenAI API key ([get one here](https://platform.openai.com/api-keys))

### Run the Demo

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open `http://localhost:5173/examples/demo-ai-chatbot.html`

3. Enter your OpenAI API key and click "Connect"

4. Start chatting!

---

## How Streaming Works

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────────┐  │
│  │  React App  │───▶│ Service      │───▶│ Server Bridge     │  │
│  │  (useChat)  │◀───│ Worker       │◀───│ (MessageChannel)  │  │
│  └─────────────┘    └──────────────┘    └───────────────────┘  │
│                                                │                 │
│                                         ┌──────▼──────┐         │
│                                         │ NextDev     │         │
│                                         │ Server      │         │
│                                         └──────┬──────┘         │
│                                                │                 │
│  ┌─────────────────────────────────────────────▼───────────────┐│
│  │                    API Route Handler                         ││
│  │  - Receives messages from useChat                           ││
│  │  - Calls OpenAI API via CORS proxy                          ││
│  │  - Streams response chunks back                             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  CORS Proxy     │
                    │ (corsproxy.io)  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  OpenAI API     │
                    └─────────────────┘
```

### Streaming Flow

1. **User sends message** → `useChat` hook makes POST to `/api/chat`
2. **Service Worker intercepts** → Detects streaming request (POST to /api/*)
3. **Server Bridge receives** → Creates streaming response with callbacks
4. **API Handler executes** → Calls OpenAI via CORS proxy
5. **Chunks stream back** → Each `res.write()` sends a `stream-chunk` message
6. **UI updates** → `useChat` parses chunks and updates messages state

### CORS Proxy

Since browsers block direct API calls to `api.openai.com`, we use a CORS proxy:

```typescript
const CORS_PROXY = 'https://corsproxy.io/?';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Proxied request
fetch(CORS_PROXY + encodeURIComponent(OPENAI_API_URL), {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ model: 'gpt-4o-mini', messages, stream: true }),
});
```

**Note**: The CORS proxy buffers the entire OpenAI response before returning it. To achieve word-by-word streaming in the UI, we collect all tokens and then replay them with delays.

---

## Complete Example

### Step 1: Create Project Structure

```typescript
import { VirtualFS } from 'just-node';

const vfs = new VirtualFS();

// Create directories
vfs.mkdirSync('/app', { recursive: true });
vfs.mkdirSync('/pages/api', { recursive: true });

// Package.json
vfs.writeFileSync('/package.json', JSON.stringify({
  name: 'ai-chatbot',
  dependencies: {
    'next': '^14.0.0',
    'react': '^18.2.0',
    'ai': '^4.0.0',
  }
}, null, 2));
```

### Step 2: Create the API Route

The API route handles chat requests and streams responses:

```typescript
// /pages/api/chat.ts
vfs.writeFileSync('/pages/api/chat.ts', `
import type { NextApiRequest, NextApiResponse } from 'next';

const CORS_PROXY = 'https://corsproxy.io/?';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { messages } = req.body;

  // Call OpenAI via CORS proxy
  const response = await fetch(CORS_PROXY + encodeURIComponent(OPENAI_API_URL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${apiKey}\`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
    }),
  });

  if (!response.ok) {
    return res.status(response.status).json({ error: 'OpenAI API error' });
  }

  // Set streaming headers
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');

  // Parse SSE and convert to AI SDK format
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const chunks: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            // AI SDK data stream format
            chunks.push(\`0:"\${content.replace(/"/g, '\\\\"').replace(/\\n/g, '\\\\n')}"\\n\`);
          }
        } catch (e) {}
      }
    }
  }

  // Stream chunks with delays for visual effect
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
  for (const chunk of chunks) {
    res.write(chunk);
    await delay(50);
  }

  res.write('d:{"finishReason":"stop"}\\n');
  res.end();
}
`);
```

### Step 3: Create the Chat UI

```typescript
// /app/page.tsx
vfs.writeFileSync('/app/page.tsx', `
"use client";

import { useChat } from 'ai/react';

// Get virtual base path for API calls
function getApiUrl(path: string): string {
  const match = window.location.pathname.match(/^(\\/__virtual__\\/\\d+)/);
  return match ? match[1] + path : path;
}

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: getApiUrl('/api/chat'),
  });

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">AI Chatbot</h1>

      <div className="space-y-4 mb-4">
        {messages.map((m) => (
          <div key={m.id} className={\`p-3 rounded \${
            m.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'
          }\`}>
            <strong>{m.role === 'user' ? 'You' : 'AI'}:</strong>
            <p>{m.content}</p>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="p-3 rounded bg-gray-100">
            <strong>AI:</strong> Thinking...
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Type a message..."
          className="flex-1 p-2 border rounded"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Send
        </button>
      </form>
    </div>
  );
}
`);

// /app/layout.tsx
vfs.writeFileSync('/app/layout.tsx', `
export default function RootLayout({ children }) {
  return (
    <div className="min-h-screen bg-white">
      {children}
    </div>
  );
}
`);
```

### Step 4: Start the Server

```typescript
import { NextDevServer } from 'just-node';
import { getServerBridge } from 'just-node/server-bridge';

// Create the dev server
const devServer = new NextDevServer(vfs, {
  port: 3000,
  preferAppRouter: true,
});

// Set the OpenAI API key
devServer.setEnv('OPENAI_API_KEY', 'sk-your-api-key');

// Initialize Service Worker and server bridge
const bridge = getServerBridge();
await bridge.initServiceWorker();

// Create HTTP server wrapper with streaming support
const httpServer = {
  handleRequest: (method, url, headers, body) =>
    devServer.handleRequest(method, url, headers, body),
  handleStreamingRequest: (method, url, headers, body, onStart, onChunk, onEnd) =>
    devServer.handleStreamingRequest(method, url, headers, body, onStart, onChunk, onEnd),
};

bridge.registerServer(httpServer, 3000);
devServer.start();

console.log(`Chatbot running at: ${bridge.getServerUrl(3000)}`);
```

---

## API Reference

### NextDevServer Streaming Methods

#### `handleStreamingRequest()`

Handle API requests that stream responses:

```typescript
async handleStreamingRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: Buffer | undefined,
  onStart: (statusCode: number, statusMessage: string, headers: Record<string, string>) => void,
  onChunk: (chunk: string | Uint8Array) => void,
  onEnd: () => void
): Promise<void>
```

**Parameters:**
- `onStart` - Called when response headers are ready
- `onChunk` - Called for each chunk of data
- `onEnd` - Called when response is complete

#### `setEnv()`

Set environment variables available to API routes:

```typescript
devServer.setEnv('OPENAI_API_KEY', 'sk-...');
```

### Server Bridge Streaming

The server bridge automatically detects streaming requests (POST to /api/*) and routes them through the streaming handler.

```typescript
// Service Worker detection
const isStreamingCandidate = request.method === 'POST' && path.startsWith('/api/');
```

### AI SDK Data Stream Format

The API route must output data in AI SDK format:

```
0:"text content"\n     # Text chunk
d:{"finishReason":"stop"}\n  # End of stream
```

---

## Troubleshooting

### "API key not configured" Error

**Cause**: Environment variable not set before making request.

**Solution**: Call `devServer.setEnv('OPENAI_API_KEY', key)` before the first chat request.

### Response Appears All At Once

**Cause**: The HTTP server wrapper is missing `handleStreamingRequest`.

**Solution**: Ensure your server wrapper includes both methods:

```typescript
const httpServer = {
  handleRequest: ...,
  handleStreamingRequest: ...,  // Required for streaming!
};
```

### CORS Errors

**Cause**: Direct API calls to OpenAI are blocked by browsers.

**Solution**: Use a CORS proxy like `corsproxy.io`:

```typescript
const url = 'https://corsproxy.io/?' + encodeURIComponent('https://api.openai.com/v1/...');
```

### "Thinking" Indicator Shows With Streaming Message

**Cause**: Loading state overlaps with streaming content.

**Solution**: Only show loading when the last message is from the user:

```tsx
{isLoading && messages[messages.length - 1]?.role === 'user' && (
  <div>Thinking...</div>
)}
```

### Streaming Chunks Arrive As Single Message

**Cause**: Message channel batches rapid `postMessage` calls.

**Solution**: Add delays between chunk writes:

```typescript
for (const chunk of chunks) {
  res.write(chunk);
  await delay(50);  // 50ms between chunks
}
```

---

## Additional Resources

- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Just Node API Documentation](./API.md)
