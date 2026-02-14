/**
 * Integration tests for the Vercel AI SDK demo.
 *
 * Verifies that:
 * 1. The project structure is created correctly
 * 2. The API route can be loaded and executed
 * 3. Messages in both old ({content}) and new ({parts}) formats are handled
 * 4. The response uses real AI SDK streaming (toUIMessageStreamResponse)
 */
import { describe, it, expect } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import { createAIChatbotProject, PACKAGE_JSON } from '../src/vercel-ai-sdk-demo';
import { Buffer } from '../src/shims/stream';
import {
  createMockRequest,
  createMockResponse,
  createStreamingMockResponse,
  createBuiltinModules,
  executeApiHandler,
} from '../src/frameworks/next-api-handler';
import { transformEsmToCjsSimple } from '../src/frameworks/code-transforms';

// ── Project structure ─────────────────────────────────────────────────────

describe('createAIChatbotProject', () => {
  it('creates all required files', () => {
    const vfs = new VirtualFS();
    createAIChatbotProject(vfs);

    expect(vfs.existsSync('/package.json')).toBe(true);
    expect(vfs.existsSync('/app/layout.tsx')).toBe(true);
    expect(vfs.existsSync('/app/page.tsx')).toBe(true);
    expect(vfs.existsSync('/app/globals.css')).toBe(true);
    expect(vfs.existsSync('/pages/api/chat.ts')).toBe(true);
    expect(vfs.existsSync('/tsconfig.json')).toBe(true);
  });

  it('package.json lists AI SDK dependencies', () => {
    expect(PACKAGE_JSON.dependencies).toHaveProperty('ai');
    expect(PACKAGE_JSON.dependencies).toHaveProperty('@ai-sdk/openai');
    expect(PACKAGE_JSON.dependencies).toHaveProperty('@ai-sdk/react');
  });

  it('page imports useChat from @ai-sdk/react', () => {
    const vfs = new VirtualFS();
    createAIChatbotProject(vfs);
    const page = vfs.readFileSync('/app/page.tsx', 'utf8');
    expect(page).toContain("from '@ai-sdk/react'");
    expect(page).toContain('useChat');
    expect(page).toContain('sendMessage');
  });

  it('API route imports streamText from ai', () => {
    const vfs = new VirtualFS();
    createAIChatbotProject(vfs);
    const api = vfs.readFileSync('/pages/api/chat.ts', 'utf8');
    expect(api).toContain("from 'ai'");
    expect(api).toContain('streamText');
    expect(api).toContain('toUIMessageStreamResponse');
  });

  it('API route does NOT use convertToModelMessages', () => {
    const vfs = new VirtualFS();
    createAIChatbotProject(vfs);
    const api = vfs.readFileSync('/pages/api/chat.ts', 'utf8');
    expect(api).not.toContain('convertToModelMessages');
  });
});

// ── API route handler ─────────────────────────────────────────────────────

describe('chat API route handler', () => {
  // In test env (isBrowser=false), we can't install real ai/openai packages.
  // Instead, we mock them to verify the handler logic: body parsing,
  // message extraction, error handling, and streaming response wiring.

  function createMockAiModules() {
    // Track what streamText receives
    let streamTextCalls: any[] = [];

    const mockStreamText = (opts: any) => {
      streamTextCalls.push(opts);
      // Return a mock result with toUIMessageStreamResponse
      return {
        toUIMessageStreamResponse: () => {
          return new Response('mock-stream', {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        },
      };
    };

    const mockCreateOpenAI = (opts: any) => {
      return (model: string) => ({ provider: 'openai', model });
    };

    return {
      streamTextCalls,
      builtins: {
        ai: {
          streamText: mockStreamText,
          __esModule: true,
          default: { streamText: mockStreamText },
        },
        '@ai-sdk/openai': {
          createOpenAI: mockCreateOpenAI,
          __esModule: true,
          default: { createOpenAI: mockCreateOpenAI },
        },
      },
    };
  }

  function getTransformedCode(vfs: VirtualFS): string {
    const raw = vfs.readFileSync('/pages/api/chat.ts', 'utf8');
    return transformEsmToCjsSimple(raw);
  }

  it('returns 405 for non-POST requests', async () => {
    const vfs = new VirtualFS();
    createAIChatbotProject(vfs);
    const code = getTransformedCode(vfs);
    const { builtins } = createMockAiModules();

    const req = createMockRequest('GET', '/api/chat', {});
    const res = createMockResponse();
    const allBuiltins = await createBuiltinModules();
    Object.assign(allBuiltins, builtins);

    await executeApiHandler(code, req, res, { NODE_ENV: 'test' }, allBuiltins);
    await res.waitForEnd();

    const response = res.toResponse();
    expect(response.statusCode).toBe(405);
  });

  it('returns 500 when API key is not set', async () => {
    const vfs = new VirtualFS();
    createAIChatbotProject(vfs);
    const code = getTransformedCode(vfs);
    const { builtins } = createMockAiModules();

    const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] });
    const req = createMockRequest('POST', '/api/chat', { 'content-type': 'application/json' }, Buffer.from(body));
    const res = createMockResponse();
    const allBuiltins = await createBuiltinModules();
    Object.assign(allBuiltins, builtins);

    // No OPENAI_API_KEY in env
    await executeApiHandler(code, req, res, { NODE_ENV: 'test' }, allBuiltins);
    await res.waitForEnd();

    const response = res.toResponse();
    expect(response.statusCode).toBe(500);
    const json = JSON.parse(response.body.toString());
    expect(json.error).toContain('API key');
  });

  it('returns 400 for missing messages', async () => {
    const vfs = new VirtualFS();
    createAIChatbotProject(vfs);
    const code = getTransformedCode(vfs);
    const { builtins } = createMockAiModules();

    const body = JSON.stringify({ something: 'else' });
    const req = createMockRequest('POST', '/api/chat', { 'content-type': 'application/json' }, Buffer.from(body));
    const res = createMockResponse();
    const allBuiltins = await createBuiltinModules();
    Object.assign(allBuiltins, builtins);

    await executeApiHandler(code, req, res, { NODE_ENV: 'test', OPENAI_API_KEY: 'sk-test' }, allBuiltins);
    await res.waitForEnd();

    const response = res.toResponse();
    expect(response.statusCode).toBe(400);
  });

  it('calls streamText with messages in {content} format', async () => {
    const vfs = new VirtualFS();
    createAIChatbotProject(vfs);
    const code = getTransformedCode(vfs);
    const { builtins, streamTextCalls } = createMockAiModules();

    const body = JSON.stringify({
      messages: [
        { id: '1', role: 'user', content: 'Hello there' },
      ],
    });
    const req = createMockRequest('POST', '/api/chat', { 'content-type': 'application/json' }, Buffer.from(body));
    const res = createStreamingMockResponse(() => {}, () => {}, () => {});
    const allBuiltins = await createBuiltinModules();
    Object.assign(allBuiltins, builtins);

    const result = await executeApiHandler(code, req, res, { NODE_ENV: 'test', OPENAI_API_KEY: 'sk-test' }, allBuiltins);

    // streamText should have been called
    expect(streamTextCalls.length).toBe(1);
    expect(streamTextCalls[0].messages).toEqual([
      { role: 'user', content: 'Hello there' },
    ]);

    // Handler should return a Response (from toUIMessageStreamResponse)
    expect(result).toBeInstanceOf(Response);
  });

  it('calls streamText with messages in {parts} format (AI SDK v5)', async () => {
    const vfs = new VirtualFS();
    createAIChatbotProject(vfs);
    const code = getTransformedCode(vfs);
    const { builtins, streamTextCalls } = createMockAiModules();

    // AI SDK v5 @ai-sdk/react sends messages with parts instead of content
    const body = JSON.stringify({
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Tell me a joke' }],
        },
      ],
    });
    const req = createMockRequest('POST', '/api/chat', { 'content-type': 'application/json' }, Buffer.from(body));
    const res = createStreamingMockResponse(() => {}, () => {}, () => {});
    const allBuiltins = await createBuiltinModules();
    Object.assign(allBuiltins, builtins);

    const result = await executeApiHandler(code, req, res, { NODE_ENV: 'test', OPENAI_API_KEY: 'sk-test' }, allBuiltins);

    expect(streamTextCalls.length).toBe(1);
    // getContent() should extract text from parts
    expect(streamTextCalls[0].messages).toEqual([
      { role: 'user', content: 'Tell me a joke' },
    ]);
    expect(result).toBeInstanceOf(Response);
  });

  it('handles multi-turn conversation', async () => {
    const vfs = new VirtualFS();
    createAIChatbotProject(vfs);
    const code = getTransformedCode(vfs);
    const { builtins, streamTextCalls } = createMockAiModules();

    const body = JSON.stringify({
      messages: [
        { id: '1', role: 'user', content: 'Hi' },
        { id: '2', role: 'assistant', parts: [{ type: 'text', text: 'Hello! How can I help?' }] },
        { id: '3', role: 'user', content: 'Tell me about cats' },
      ],
    });
    const req = createMockRequest('POST', '/api/chat', { 'content-type': 'application/json' }, Buffer.from(body));
    const res = createStreamingMockResponse(() => {}, () => {}, () => {});
    const allBuiltins = await createBuiltinModules();
    Object.assign(allBuiltins, builtins);

    await executeApiHandler(code, req, res, { NODE_ENV: 'test', OPENAI_API_KEY: 'sk-test' }, allBuiltins);

    expect(streamTextCalls.length).toBe(1);
    expect(streamTextCalls[0].messages).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello! How can I help?' },
      { role: 'user', content: 'Tell me about cats' },
    ]);
  });
});
