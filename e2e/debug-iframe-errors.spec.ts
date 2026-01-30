import { test, expect } from '@playwright/test';

test('Debug iframe JavaScript errors', async ({ page }) => {
  const errors: string[] = [];
  const logs: string[] = [];

  page.on('console', (msg) => {
    const text = '[' + msg.type() + '] ' + msg.text();
    logs.push(text);
    console.log(text);
  });

  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error('[Page Error]', error.message);
  });

  await page.goto('/examples/demo-convex-app.html');

  // Wait for initialization
  await expect(page.locator('#statusText')).toContainText('Running', { timeout: 30000 });

  // Wait for iframe to load
  await page.waitForTimeout(8000);

  const iframe = page.locator('#preview-iframe');
  const iframeHandle = await iframe.elementHandle();
  const frame = await iframeHandle?.contentFrame();

  if (frame) {
    // Try to check for React errors in the iframe itself
    const iframeErrors = await frame.evaluate(() => {
      const errors: string[] = [];
      // Check if React is loaded
      errors.push('React loaded: ' + (typeof (window as any).React !== 'undefined'));
      errors.push('ReactDOM loaded: ' + (typeof (window as any).ReactDOM !== 'undefined'));

      // Check if modules are loaded
      errors.push('$RefreshRuntime loaded: ' + (typeof (window as any).$RefreshRuntime$ !== 'undefined'));

      // Check __next content
      const nextDiv = document.getElementById('__next');
      errors.push('__next children: ' + (nextDiv?.children.length || 0));
      errors.push('__next innerHTML length: ' + (nextDiv?.innerHTML.length || 0));

      return errors;
    });

    console.log('\n[Iframe Errors Check]');
    iframeErrors.forEach(e => console.log('  ' + e));

    // Get any script errors
    const scriptContent = await frame.locator('script[type="module"]').last().textContent();
    console.log('\n[Render script content]:\n', scriptContent);
  }

  console.log('\n[Total page errors]:', errors.length);
  errors.forEach(e => console.log('  ERROR: ' + e));

  console.log('\n[Error logs from console]:');
  logs.filter(l => l.includes('error') || l.includes('Error') || l.includes('fail') || l.includes('Fail'))
    .forEach(l => console.log('  ' + l));
});
