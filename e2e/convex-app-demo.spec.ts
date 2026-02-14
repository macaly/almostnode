import { test, expect } from '@playwright/test';

test.describe('Convex App Demo', () => {
  // Collect page errors — asserted at the end of critical tests
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
    await page.goto('/examples/demo-convex-app.html');
    await expect(page.locator('.demo-topbar .title')).toContainText('Convex App');
    await expect(page.locator('#refreshBtn')).toBeVisible();
    await expect(page.locator('#setupOverlay')).toBeVisible();
    await expect(page.locator('#setupKeyInput')).toBeVisible();
  });

  test('should initialize and show Running status with expected logs', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 120000 });

    // Verify key initialization messages appeared in order
    const logs = page.locator('#logs');
    await expect(logs).toContainText('Project files created');
    await expect(logs).toContainText('/convex/schema.ts');
    await expect(logs).toContainText('/convex/todos.ts');
    await expect(logs).toContainText('Convex package installed');
    await expect(logs).toContainText('Service Worker ready');
    await expect(logs).toContainText('Demo ready');
  });

  test('should bundle convex/react npm module without errors', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 120000 });

    // Directly fetch the npm module that caused the bug.
    // If resolvePackageEntry fails on nested exports, this returns 500.
    const result = await page.evaluate(async () => {
      const res = await fetch('/__virtual__/3002/_npm/convex/react');
      const text = await res.text();
      return {
        status: res.status,
        contentType: res.headers.get('content-type'),
        length: text.length,
        startsWithExport: text.includes('export '),
        hasError: text.includes('Failed to bundle'),
      };
    });

    console.log('[/_npm/convex/react]', { status: result.status, length: result.length });
    expect(result.status).toBe(200);
    expect(result.contentType).toContain('javascript');
    expect(result.hasError).toBe(false);
    expect(result.startsWithExport).toBe(true);
    expect(result.length).toBeGreaterThan(500); // real bundle, not an error message
  });

  test('should bundle convex/server npm module without errors', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 120000 });

    const result = await page.evaluate(async () => {
      const res = await fetch('/__virtual__/3002/_npm/convex/server');
      const text = await res.text();
      return {
        status: res.status,
        contentType: res.headers.get('content-type'),
        length: text.length,
        hasError: text.includes('Failed to bundle'),
      };
    });

    console.log('[/_npm/convex/server]', { status: result.status, length: result.length });
    expect(result.status).toBe(200);
    expect(result.contentType).toContain('javascript');
    expect(result.hasError).toBe(false);
    expect(result.length).toBeGreaterThan(500);
  });

  test('should render React app in iframe with "Connect to Convex" message', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 120000 });

    // Wait for iframe to appear
    const iframe = page.locator('#preview-iframe');
    await expect(iframe).toBeVisible({ timeout: 10000 });

    // Get iframe content frame
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();
    expect(frame).toBeTruthy();

    // The React app should render. Without a Convex URL, it shows "Connect to Convex".
    // This is the CRITICAL assertion — if JS imports fail (convex/react 500),
    // React never mounts and this h2 never appears.
    await frame!.waitForSelector('h2', { timeout: 20000 });
    const h2Text = await frame!.locator('h2').first().textContent();
    expect(h2Text).toContain('Connect to Convex');

    // No page errors should have occurred during rendering
    const relevantErrors = pageErrors.filter(e =>
      !e.includes('favicon') && !e.includes('robots.txt')
    );
    expect(relevantErrors).toEqual([]);
  });

  test('should serve home page HTML with React bootstrap', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 120000 });

    const result = await page.evaluate(async () => {
      const res = await fetch('/__virtual__/3002/');
      const text = await res.text();
      return {
        status: res.status,
        contentType: res.headers.get('content-type'),
        length: text.length,
        hasReact: text.includes('react'),
      };
    });

    expect(result.status).toBe(200);
    expect(result.contentType).toContain('text/html');
    expect(result.hasReact).toBe(true);
    expect(result.length).toBeGreaterThan(200);
  });

  test('Service Worker should be registered', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 120000 });

    const swRegistered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        return registrations.length > 0;
      }
      return false;
    });

    expect(swRegistered).toBe(true);
  });
});
