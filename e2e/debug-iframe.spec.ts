import { test, expect } from '@playwright/test';

test('Debug iframe content', async ({ page }) => {
  page.on('console', (msg) => {
    console.log('[Browser ' + msg.type() + ']', msg.text());
  });

  page.on('pageerror', (error) => {
    console.error('[Page Error]', error.message);
  });

  await page.goto('/examples/demo-convex-app.html');

  // Wait for initialization
  await expect(page.locator('#statusText')).toContainText('Running', { timeout: 30000 });
  console.log('[Status] Running');

  // Wait for iframe to load
  await page.waitForTimeout(5000);

  const iframe = page.locator('#preview-iframe');
  const iframeHandle = await iframe.elementHandle();
  const frame = await iframeHandle?.contentFrame();

  if (frame) {
    // Get full HTML content
    const html = await frame.content();
    console.log('\n[Iframe HTML length]', html.length);
    console.log('\n[Iframe HTML (first 2000 chars)]:\n', html.substring(0, 2000));

    // Check for errors in the page
    const bodyContent = await frame.locator('body').innerHTML();
    console.log('\n[Body innerHTML length]', bodyContent.length);
    console.log('\n[Body innerHTML (first 1000 chars)]:\n', bodyContent.substring(0, 1000));

    // Check if there are any visible elements
    const h1Count = await frame.locator('h1').count();
    console.log('\n[H1 count]', h1Count);

    // Check for error messages
    const errorDivs = await frame.locator('[class*="error"]').count();
    console.log('[Error divs count]', errorDivs);

    // Check the #__next container
    const nextDiv = await frame.locator('#__next').count();
    console.log('[#__next count]', nextDiv);

    if (nextDiv > 0) {
      const nextContent = await frame.locator('#__next').innerHTML();
      console.log('\n[#__next content (first 500 chars)]:\n', nextContent.substring(0, 500));
    }
  } else {
    console.log('[ERROR] Could not access iframe frame');
  }
});
