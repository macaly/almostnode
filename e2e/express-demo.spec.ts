import { test, expect } from '@playwright/test';

test.describe('Express Demo', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[Browser ${msg.type()}]`, msg.text());
    });
    page.on('pageerror', (error) => {
      console.error('[Page Error]', error.message);
    });
  });

  test('should load the demo page', async ({ page }) => {
    await page.goto('/examples/express-demo.html');

    // Check the title in topbar
    await expect(page.locator('.demo-topbar .title')).toContainText('Express');

    // Check that Run Server button exists
    await expect(page.locator('#runBtn')).toBeVisible();

    // Check editor has Express code
    const editor = page.locator('#editor');
    const content = await editor.inputValue();
    expect(content).toContain("require('express')");
    expect(content).toContain('app.listen');
  });

  test('should install express and start server', async ({ page }) => {
    await page.goto('/examples/express-demo.html');

    // Click Run Server
    await page.click('#runBtn');

    // Wait for server to be ready (includes express install)
    await expect(page.locator('#status')).toContainText('Running', { timeout: 60000 });

    // Terminal should show success
    const terminal = page.locator('#terminal');
    await expect(terminal).toContainText('Express server running on port 3000', { timeout: 60000 });
  });

  test('should load HTML page in preview iframe', async ({ page }) => {
    await page.goto('/examples/express-demo.html');

    // Start server
    await page.click('#runBtn');
    await expect(page.locator('#status')).toContainText('Running', { timeout: 60000 });

    // Wait for preview to load
    await page.waitForTimeout(2000);

    // Check iframe loaded Express content
    const iframe = page.locator('#preview');
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();
    expect(frame).toBeTruthy();

    const html = await frame!.content();
    console.log('[Iframe HTML length]', html.length);
    expect(html).toContain('Express');
    expect(html.length).toBeGreaterThan(100);
  });

  test('should navigate to API route via link click', async ({ page }) => {
    await page.goto('/examples/express-demo.html');

    // Start server
    await page.click('#runBtn');
    await expect(page.locator('#status')).toContainText('Running', { timeout: 60000 });

    // Wait for preview to load
    await page.waitForTimeout(2000);

    // Terminal should log the GET / request
    const terminal = page.locator('#terminal');
    await expect(terminal).toContainText('GET /', { timeout: 5000 });

    // Access iframe — must succeed
    const iframe = page.locator('#preview');
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();
    expect(frame).toBeTruthy();

    // The /api/users link must exist
    const usersLink = frame!.locator('a[href="/api/users"]');
    await expect(usersLink).toBeVisible({ timeout: 5000 });
    await usersLink.click();

    // Wait for navigation
    await expect(terminal).toContainText('Navigating to /api/users', { timeout: 5000 });
    await page.waitForTimeout(2000);

    // The preview should now show JSON with users
    const updatedHandle = await page.locator('#preview').elementHandle();
    const updatedFrame = await updatedHandle?.contentFrame();
    expect(updatedFrame).toBeTruthy();

    const html = await updatedFrame!.content();
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
  });

  test('should handle re-running the server', async ({ page }) => {
    await page.goto('/examples/express-demo.html');

    // First run
    await page.click('#runBtn');
    await expect(page.locator('#status')).toContainText('Running', { timeout: 60000 });

    // Run again (should reset and restart)
    await page.click('#runBtn');
    await expect(page.locator('#status')).toContainText('Running', { timeout: 60000 });

    // Terminal should show the server is running
    const terminal = page.locator('#terminal');
    await expect(terminal).toContainText('Express server running on port 3000');
  });
});
