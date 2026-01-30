import { test, expect } from '@playwright/test';

test.describe('Sandbox Demo', () => {
  test('should connect to sandbox and execute code', async ({ page }) => {
    // Navigate to sandbox demo
    await page.goto('http://localhost:5173/examples/sandbox-next-demo.html');

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Sandbox Mode');

    // Check initial status
    await expect(page.locator('#status-text')).toHaveText('Connecting...');

    // Click connect button
    await page.click('#init-btn');

    // Wait for connection (with longer timeout for sandbox init)
    await expect(page.locator('#status-text')).toHaveText('Connected', { timeout: 30000 });

    // Check that security info is displayed
    await expect(page.locator('#iframe-origin')).toContainText('localhost:3002');

    // Check console output shows connection success
    await expect(page.locator('#console-output')).toContainText('Sandbox connected successfully');

    // Run the code
    await page.click('#run-btn');

    // Wait for execution to complete
    await expect(page.locator('#result-output')).toContainText('success', { timeout: 10000 });
    await expect(page.locator('#result-output')).toContainText('Code executed in isolated sandbox');

    // Check console shows execution logs
    await expect(page.locator('#console-output')).toContainText('Hello from the sandbox');
  });

  test('should show cross-origin isolation', async ({ page }) => {
    await page.goto('http://localhost:5173/examples/sandbox-next-demo.html');

    // Connect to sandbox
    await page.click('#init-btn');
    await expect(page.locator('#status-text')).toHaveText('Connected', { timeout: 30000 });

    // Verify different origins are displayed
    const iframeInfo = await page.locator('#iframe-origin').textContent();
    expect(iframeInfo).toContain('localhost:3002');
    expect(iframeInfo).toContain('different from');
    expect(iframeInfo).toContain('localhost:5173');
  });
});
