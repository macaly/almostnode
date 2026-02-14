import { test, expect } from '@playwright/test';

const API_KEY = process.env.OPENAI_API_KEY || '';
const PROXY_URL = encodeURIComponent('http://localhost:8787/?');

test.describe('Agent Workbench with /_npm/ bundling', () => {
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

  test('should load workbench and install packages', async ({ page }) => {
    await page.goto('/examples/agent-workbench.html');

    // Wait for all packages to be installed and workbench ready
    await expect(page.locator('#logs')).toContainText('Workbench ready!', { timeout: 30000 });
    await expect(page.locator('#logs')).toContainText('All packages installed');
    await expect(page.locator('#logs')).toContainText('@ai-sdk/react');
  });

  test('should serve /_npm/ bundles with correct exports', async ({ page }) => {
    await page.goto('/examples/agent-workbench.html');
    await expect(page.locator('#logs')).toContainText('Workbench ready!', { timeout: 30000 });

    // Start agent to activate the iframe + service worker
    await page.fill('#setupKeyInput', API_KEY || 'sk-fake-key-for-testing');
    await page.click('#setupKeyBtn');
    await expect(page.locator('#logs')).toContainText('Agent ready', { timeout: 10000 });

    // Wait a bit for SW to be fully ready
    await page.waitForTimeout(3000);

    // Fetch the /_npm/@ai-sdk/react bundle directly via the service worker
    const bundleInfo = await page.evaluate(async () => {
      try {
        const res = await fetch('/__virtual__/3004/_npm/@ai-sdk/react');
        const text = await res.text();
        // Find all lines containing 'react' (not inside function bodies)
        const lines = text.split('\n');
        const reactLines = lines
          .map((l, i) => ({ line: i+1, text: l.trim() }))
          .filter(l => /\breact\b/.test(l.text) && l.text.length < 200)
          .slice(0, 30);
        return {
          status: res.status,
          length: text.length,
          first2000: text.slice(0, 2000),
          last2000: text.slice(-2000),
          hasExportUseChat: text.includes('export var useChat'),
          hasImportReact: text.includes('from "react"') || text.includes("from 'react'"),
          hasRequireReact: text.includes('require("react")') || text.includes("require('react')"),
          has__require: text.includes('__require'),
          reactLines: reactLines,
        };
      } catch (e) {
        return { error: String(e) };
      }
    });

    console.log('[Test] Bundle info:', {
      length: bundleInfo.length,
      hasExportUseChat: (bundleInfo as any).hasExportUseChat,
      has__require: (bundleInfo as any).has__require,
    });
    expect(bundleInfo.status).toBe(200);
    expect(bundleInfo.length).toBeGreaterThan(500); // Real bundle, not error message
    expect((bundleInfo as any).hasExportUseChat).toBe(true);
  });

  test('should serve /_npm/ bundles from VFS via esbuild', async ({ page }) => {
    await page.goto('/examples/agent-workbench.html');

    // Wait for workbench ready
    await expect(page.locator('#logs')).toContainText('Workbench ready!', { timeout: 30000 });

    // Enter API key and start agent
    await page.fill('#setupKeyInput', API_KEY || 'sk-fake-key-for-testing');
    await page.click('#setupKeyBtn');

    // Wait for agent ready
    await expect(page.locator('#logs')).toContainText('Agent ready', { timeout: 10000 });

    // The overlay should be hidden
    await expect(page.locator('#setupOverlay')).toHaveClass(/hidden/);

    // Wait for iframe to load
    const iframe = page.frameLocator('#preview-iframe');

    // Monitor network requests for /_npm/ endpoint
    const npmRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/_npm/')) {
        npmRequests.push(req.url());
      }
    });

    const npmResponses: { url: string; status: number }[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/_npm/')) {
        npmResponses.push({ url: res.url(), status: res.status() });
      }
    });

    // Wait for the page to render in iframe — this triggers /_npm/@ai-sdk/react loading
    // The chat UI uses useChat from @ai-sdk/react which is now served via /_npm/
    await page.waitForTimeout(10000);

    // Check that the iframe loaded something (not blank)
    const iframeEl = page.locator('#preview-iframe');
    await expect(iframeEl).toBeVisible();

    // The chat form MUST be visible — proves React mounted with @ai-sdk/react
    const chatForm = iframe.locator('form');
    await expect(chatForm).toBeVisible({ timeout: 15000 });
    console.log('[Test] Chat form is visible in iframe — /_npm/ bundling works!');

    // Verify no npm bundle requests failed
    const failedNpm = npmResponses.filter(r => r.status >= 400);
    expect(failedNpm).toEqual([]);

    // No page errors during rendering
    const relevantErrors = pageErrors.filter(e =>
      !e.includes('favicon') && !e.includes('robots.txt')
    );
    expect(relevantErrors).toEqual([]);
  });

  test('should send a message and get AI response', async ({ page }) => {
    test.skip(!API_KEY, 'OPENAI_API_KEY not set');
    test.setTimeout(90000);

    await page.goto(`/examples/agent-workbench.html?corsProxy=${PROXY_URL}`);
    await expect(page.locator('#logs')).toContainText('Workbench ready!', { timeout: 30000 });

    // Start agent
    await page.fill('#setupKeyInput', API_KEY);
    await page.click('#setupKeyBtn');
    await expect(page.locator('#logs')).toContainText('Agent ready', { timeout: 10000 });

    // Wait for iframe chat UI to load
    const iframe = page.frameLocator('#preview-iframe');
    const chatInput = iframe.locator('input[type="text"], textarea').first();
    await expect(chatInput).toBeVisible({ timeout: 30000 });

    // Type a message
    await chatInput.fill('say hello in one word');

    // Submit the form
    const submitBtn = iframe.locator('button[type="submit"], form button').first();
    await submitBtn.click();

    // Wait for response (either AI response or error from CORS)
    await page.waitForTimeout(15000);

    // User message must be visible
    const userMessage = iframe.locator('text=say hello in one word');
    await expect(userMessage).toBeVisible({ timeout: 5000 });

    // Should have a real AI response, not an error
    const pageText = await iframe.locator('body').innerText();
    console.log('[Test] Chat text:', pageText.substring(0, 500));
    expect(pageText).toContain('say hello in one word');
    expect(pageText).not.toContain('Failed to fetch');
    // AI should have responded with something beyond just the user message
    expect(pageText.length).toBeGreaterThan(40);
  });
});
