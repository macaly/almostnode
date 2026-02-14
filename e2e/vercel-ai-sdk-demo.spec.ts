import { test, expect } from '@playwright/test';

const API_KEY = process.env.OPENAI_API_KEY || '';
const PROXY_URL = encodeURIComponent('http://localhost:8787/?');

test.describe('Vercel AI SDK Demo', () => {
  let pageErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on('console', (msg) => {
      console.log(`[Browser ${msg.type()}]`, msg.text());
    });
    page.on('pageerror', (error) => {
      console.error('[Page Error]', error.message);
      pageErrors.push(error.message);
    });
  });

  test('should load the demo page', async ({ page }) => {
    await page.goto('/examples/demo-vercel-ai-sdk.html');
    await expect(page.locator('.demo-topbar .title')).toContainText('Vercel AI SDK');
    await expect(page.locator('#setupOverlay')).toBeVisible();
    await expect(page.locator('#setupKeyInput')).toBeVisible();
    await expect(page.locator('#setupKeyBtn')).toBeVisible();
  });

  test('should initialize dev server and show Running status', async ({ page }) => {
    await page.goto('/examples/demo-vercel-ai-sdk.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 120000 });

    const logs = page.locator('#logs');
    await expect(logs).toContainText('All packages installed');
    await expect(logs).toContainText('Service Worker ready');
    await expect(logs).toContainText('Demo ready');
  });

  test('should bundle @ai-sdk/react npm module without errors', async ({ page }) => {
    await page.goto('/examples/demo-vercel-ai-sdk.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 120000 });

    // Directly fetch the bundled npm module. If resolution/bundling fails, returns 500.
    const result = await page.evaluate(async () => {
      const res = await fetch('/__virtual__/3003/_npm/@ai-sdk/react');
      const text = await res.text();
      return {
        status: res.status,
        contentType: res.headers.get('content-type'),
        length: text.length,
        hasExport: text.includes('export '),
        hasError: text.includes('Failed to bundle'),
      };
    });

    console.log('[/_npm/@ai-sdk/react]', { status: result.status, length: result.length });
    expect(result.status).toBe(200);
    expect(result.contentType).toContain('javascript');
    expect(result.hasError).toBe(false);
    expect(result.hasExport).toBe(true);
    expect(result.length).toBeGreaterThan(500);
  });

  test('should bundle ai npm module without errors', async ({ page }) => {
    await page.goto('/examples/demo-vercel-ai-sdk.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 120000 });

    const result = await page.evaluate(async () => {
      const res = await fetch('/__virtual__/3003/_npm/ai');
      const text = await res.text();
      return {
        status: res.status,
        contentType: res.headers.get('content-type'),
        length: text.length,
        hasError: text.includes('Failed to bundle'),
      };
    });

    console.log('[/_npm/ai]', { status: result.status, length: result.length });
    expect(result.status).toBe(200);
    expect(result.contentType).toContain('javascript');
    expect(result.hasError).toBe(false);
    expect(result.length).toBeGreaterThan(500);
  });

  test('should render chat interface in iframe', async ({ page }) => {
    await page.goto('/examples/demo-vercel-ai-sdk.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 120000 });

    // Enter API key and connect
    await page.fill('#setupKeyInput', API_KEY || 'sk-fake-key-for-testing');
    await page.click('#setupKeyBtn');
    await expect(page.locator('#setupOverlay')).toHaveClass(/hidden/, { timeout: 5000 });

    // Wait for iframe
    const iframe = page.locator('#previewContainer iframe');
    await expect(iframe).toBeVisible({ timeout: 10000 });

    // Get iframe content — React must render the chat UI
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();
    expect(frame).toBeTruthy();

    // The chat page shows "Start a conversation" when empty.
    // This proves React mounted AND @ai-sdk/react loaded (useChat hook didn't crash).
    await frame!.waitForSelector('input[type="text"]', { timeout: 20000 });
    const bodyText = await frame!.locator('body').innerText();
    expect(bodyText).toContain('Start a conversation');

    // No page errors from failed imports or runtime crashes
    const relevantErrors = pageErrors.filter(e =>
      !e.includes('favicon') && !e.includes('robots.txt')
    );
    expect(relevantErrors).toEqual([]);
  });

  test('should enable Connect button when API key is entered', async ({ page }) => {
    await page.goto('/examples/demo-vercel-ai-sdk.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 120000 });

    await expect(page.locator('#setupKeyBtn')).toBeDisabled();
    await page.fill('#setupKeyInput', 'sk-test-fake-key');
    await expect(page.locator('#setupKeyBtn')).not.toBeDisabled();
  });

  test('should send message and get AI response', async ({ page }) => {
    test.skip(!API_KEY, 'OPENAI_API_KEY not set — skipping live chat test');
    test.setTimeout(90000);

    await page.goto(`/examples/demo-vercel-ai-sdk.html?corsProxy=${PROXY_URL}`);
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 120000 });

    // Connect with real API key
    await page.fill('#setupKeyInput', API_KEY);
    await page.click('#setupKeyBtn');
    await expect(page.locator('#setupOverlay')).toHaveClass(/hidden/, { timeout: 5000 });

    // Wait for chat UI in iframe
    const iframe = page.frameLocator('#previewContainer iframe');
    const chatInput = iframe.locator('input[type="text"]').first();
    await expect(chatInput).toBeVisible({ timeout: 30000 });

    // Send a message
    await chatInput.fill('say hello in one word');
    const submitBtn = iframe.locator('button[type="submit"]').first();
    await submitBtn.click();

    // Wait for AI response
    await page.waitForTimeout(15000);

    const chatText = await iframe.locator('body').innerText();
    console.log('[Test] Chat text:', chatText.substring(0, 500));
    expect(chatText).toContain('say hello in one word');
    expect(chatText.length).toBeGreaterThan(50);
  });
});
