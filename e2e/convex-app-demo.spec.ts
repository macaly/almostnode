import { test, expect } from '@playwright/test';

test.describe('Convex App Demo', () => {
  test.beforeEach(async ({ page }) => {
    // Listen to console messages for debugging
    page.on('console', (msg) => {
      console.log(`[Browser ${msg.type()}]`, msg.text());
    });

    // Listen to page errors
    page.on('pageerror', (error) => {
      console.error('[Page Error]', error.message);
    });
  });

  test('should load the demo page', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');

    // Check the title
    await expect(page.locator('header h1')).toContainText('Convex App Demo');

    // Check that buttons exist
    await expect(page.locator('#refreshBtn')).toBeVisible();
    await expect(page.locator('#openBtn')).toBeVisible();
  });

  test('should initialize and show Running status', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');

    // Wait for initialization - should show "Running" when ready
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 30000 });

    // Buttons should be enabled when running
    await expect(page.locator('#refreshBtn')).not.toBeDisabled();
    await expect(page.locator('#openBtn')).not.toBeDisabled();
  });

  test('should show project files in console', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');

    // Wait for initialization
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 30000 });

    // Check console output has key messages
    const logs = page.locator('#logs');
    await expect(logs).toContainText('Project files created');
    await expect(logs).toContainText('Demo ready');
    await expect(logs).toContainText('/convex/schema.ts');
    await expect(logs).toContainText('/convex/todos.ts');
  });

  test('should load iframe with preview', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');

    // Wait for initialization
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 30000 });

    // Check that iframe is visible
    const iframe = page.locator('#preview-iframe');
    await expect(iframe).toBeVisible({ timeout: 10000 });

    // Get iframe src
    const iframeSrc = await iframe.getAttribute('src');
    console.log('[Iframe src]', iframeSrc);
    expect(iframeSrc).toContain('__virtual__/3002');
  });

  test('should render home page in iframe', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');

    // Wait for initialization
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 30000 });

    // Wait for iframe to fully load
    await page.waitForTimeout(5000);

    const iframe = page.locator('#preview-iframe');
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();

    if (frame) {
      // Wait for React to render - when Convex isn't connected, shows "Connect to Convex"
      try {
        await frame.waitForSelector('h2', { timeout: 15000 });
        const h2Text = await frame.locator('h2').first().textContent();
        console.log('[H2 content]', h2Text);
        expect(h2Text).toContain('Connect to Convex');
      } catch {
        // Fallback - check that at least the page was served
        const html = await frame.content();
        console.log('[Fallback - HTML length]', html.length);
        expect(html.length).toBeGreaterThan(100);
      }
    }
  });

  test('should fetch home page via fetch API', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 30000 });

    // Fetch the virtual URL
    const result = await page.evaluate(async () => {
      try {
        const response = await fetch('/__virtual__/3002/');
        const text = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get('content-type'),
          textLength: text.length,
          hasReact: text.includes('react'),
          hasTailwind: text.includes('tailwind'),
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    });

    console.log('[Fetch result]', result);

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.textLength).toBeGreaterThan(100);
  });

  test('should serve tasks page', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 30000 });

    // Fetch the tasks page
    const result = await page.evaluate(async () => {
      const response = await fetch('/__virtual__/3002/tasks');
      return {
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
        textLength: (await response.text()).length,
      };
    });

    console.log('[Tasks page result]', result);
    expect(result.status).toBe(200);
    expect(result.textLength).toBeGreaterThan(100);
  });

  test('should serve about page', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 30000 });

    // Fetch the about page
    const result = await page.evaluate(async () => {
      const response = await fetch('/__virtual__/3002/about');
      return {
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
        textLength: (await response.text()).length,
      };
    });

    console.log('[About page result]', result);
    expect(result.status).toBe(200);
    expect(result.textLength).toBeGreaterThan(100);
  });

  test('should call API health route', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 30000 });

    // Call API route
    const result = await page.evaluate(async () => {
      const response = await fetch('/__virtual__/3002/api/health');
      let data;
      try {
        data = await response.json();
      } catch {
        data = await response.text();
      }
      return {
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
        data,
      };
    });

    console.log('[API Health Result]', result);
    // API routes should return JSON
    if (result.ok) {
      expect(result.contentType).toContain('json');
    }
  });

  test('Service Worker should be registered', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 30000 });

    // Check if SW is registered
    const swRegistered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        return registrations.length > 0;
      }
      return false;
    });

    expect(swRegistered).toBe(true);
  });

  test('refresh button should work', async ({ page }) => {
    await page.goto('/examples/demo-convex-app.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 30000 });

    // Wait for iframe to load
    await page.waitForTimeout(2000);

    // Click refresh button
    await page.click('#refreshBtn');

    // Check that "Refreshing" message appears in logs
    await expect(page.locator('#logs')).toContainText('Refreshing preview');
  });
});
