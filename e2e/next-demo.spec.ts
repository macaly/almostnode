import { test, expect } from '@playwright/test';

test.describe('Next.js Demo with Service Worker', () => {
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
    await page.goto('/examples/next-demo.html');

    // Check the title in topbar
    await expect(page.locator('.demo-topbar .title')).toContainText('Next.js');

    // Check that buttons exist
    await expect(page.locator('#save-btn')).toBeVisible();
    await expect(page.locator('#run-btn')).toBeVisible();
  });

  test('should initialize and enable Start Preview button', async ({ page }) => {
    await page.goto('/examples/next-demo.html');

    // Wait for initialization
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Start Preview button should be enabled
    await expect(page.locator('#run-btn')).not.toBeDisabled();
  });

  test('should start dev server and load iframe', async ({ page }) => {
    // Log virtual server requests
    page.on('request', (request) => {
      if (request.url().includes('__virtual__')) {
        console.log('[Request]', request.url(), request.resourceType());
      }
    });

    page.on('response', (response) => {
      if (response.url().includes('__virtual__')) {
        console.log('[Response]', response.url(), response.status());
      }
    });

    await page.goto('/examples/next-demo.html');

    // Wait for initialization
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Click Start Preview
    await page.click('#run-btn');

    // Wait for dev server to start
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Check that iframe is visible
    const iframe = page.locator('#preview-frame');
    await expect(iframe).toBeVisible();

    // Get iframe src
    const iframeSrc = await iframe.getAttribute('src');
    console.log('[Iframe src]', iframeSrc);
    expect(iframeSrc).toContain('__virtual__/3001');

    // Wait for iframe to load
    await page.waitForTimeout(3000);

    // Check iframe content
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();

    expect(frame).toBeTruthy();

    // Check for __next container — proves React rendered
    await frame!.waitForSelector('#__next', { timeout: 10000 });
    const hasNext = await frame!.locator('#__next').count();
    console.log('[Iframe has #__next]', hasNext);
    expect(hasNext).toBeGreaterThan(0);
  });

  test('should show console output', async ({ page }) => {
    await page.goto('/examples/next-demo.html');

    // Wait for initialization
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Check console output has initialization messages
    const output = page.locator('#output');
    await expect(output).toContainText('Click Start Preview to launch');
  });

  test('should load editor with file content', async ({ page }) => {
    await page.goto('/examples/next-demo.html');

    // Wait for initialization
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Editor should have content
    const editor = page.locator('#editor');
    const content = await editor.inputValue();

    expect(content).toContain('export default function');
    expect(content).toContain('Home');
  });

  test('should switch between files', async ({ page }) => {
    await page.goto('/examples/next-demo.html');

    // Wait for initialization
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Click on about.jsx tab
    await page.click('.file-tab[data-file="/pages/about.jsx"]');

    // Editor should now show About component
    const editor = page.locator('#editor');
    const content = await editor.inputValue();

    expect(content).toContain('About');
    expect(content).toContain('useRouter');
  });

  test('should navigate between pages in preview', async ({ page }) => {
    await page.goto('/examples/next-demo.html');

    // Wait for initialization
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Start preview
    await page.click('#run-btn');
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Wait for iframe to fully load
    await page.waitForTimeout(5000);

    const iframe = page.locator('#preview-frame');
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();

    expect(frame).toBeTruthy();

    // Wait for React to render — no fallback, must succeed
    await frame!.waitForSelector('h1', { timeout: 15000 });
    const h1Text = await frame!.locator('h1').first().textContent();
    console.log('[Initial H1]', h1Text);
    expect(h1Text).toBeTruthy();
  });

  test('should handle client-side navigation WITHOUT full reload', async ({ page }) => {
    await page.goto('/examples/next-demo.html');

    // Wait for initialization
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Start preview
    await page.click('#run-btn');
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Wait for iframe to fully load (longer wait for React hydration)
    await page.waitForTimeout(8000);

    const iframe = page.locator('#preview-frame');
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();

    if (!frame) {
      throw new Error('Could not access iframe');
    }

    // Check that the #__next container exists (React rendered)
    const hasNext = await frame.locator('#__next').count();
    console.log('[Iframe has #__next]', hasNext);
    expect(hasNext).toBeGreaterThan(0);

    // Wait for React to render on home page - look for the nav element first
    await frame.waitForSelector('nav', { timeout: 15000 });

    // Get the H1 text
    const initialH1 = await frame.locator('h1').first().textContent();
    console.log('[Initial page H1]', initialH1);
    expect(initialH1).toContain('Welcome');

    // After iframe loads, set a marker to detect reload
    const initTime = await frame.evaluate(() => {
      (window as unknown as { __NAV_TEST_MARKER__: number }).__NAV_TEST_MARKER__ = Date.now();
      return (window as unknown as { __NEXT_INITIALIZED__: number }).__NEXT_INITIALIZED__;
    });
    console.log('[Init time]', initTime);

    // Dismiss any vite-error-overlay that might intercept pointer events
    await frame.evaluate(() => {
      document.querySelectorAll('vite-error-overlay').forEach(el => el.remove());
    });

    // Find and click the "About" link in the nav
    const aboutLink = frame.locator('nav a[href="/about"]').first();
    await expect(aboutLink).toBeVisible({ timeout: 5000 });
    console.log('[Clicking About link]');
    await aboutLink.click({ force: true });

    // Wait for client-side navigation to complete
    await page.waitForTimeout(2000);

    // After navigation, the H1 should change to "About Page"
    await frame.waitForSelector('h1', { timeout: 15000 });
    const newH1 = await frame.locator('h1').first().textContent();
    console.log('[After navigation H1]', newH1);

    // Verify the page content actually changed
    expect(newH1).toContain('About');
    expect(newH1).not.toContain('Welcome');

    // Verify NO full reload happened (marker should still exist)
    const markerAfterNav = await frame.evaluate(() => {
      return (window as unknown as { __NAV_TEST_MARKER__: number }).__NAV_TEST_MARKER__;
    });
    expect(markerAfterNav).toBeTruthy(); // Would be undefined if page reloaded
    console.log('[Marker after nav]', markerAfterNav, '- NO RELOAD ✓');

    // Also check init time didn't change
    const initTimeAfter = await frame.evaluate(() => {
      return (window as unknown as { __NEXT_INITIALIZED__: number }).__NEXT_INITIALIZED__;
    });
    expect(initTimeAfter).toBe(initTime);
  });

  test('should call API route', async ({ page }) => {
    await page.goto('/examples/next-demo.html');

    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Start preview
    await page.click('#run-btn');
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Call API route directly
    const result = await page.evaluate(async () => {
      const response = await fetch('/__virtual__/3001/api/hello');
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

    console.log('[API Result]', result);
    expect(result.status).toBe(200);
    expect(result.contentType).toContain('json');
  });

  test('should serve static files from public directory', async ({ page }) => {
    await page.goto('/examples/next-demo.html');

    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Start preview
    await page.click('#run-btn');
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Request a file from public directory
    const result = await page.evaluate(async () => {
      const response = await fetch('/__virtual__/3001/favicon.ico');
      return {
        status: response.status,
        ok: response.ok,
      };
    });

    expect(result.status).toBe(200);
  });

  test('Service Worker should be registered', async ({ page }) => {
    await page.goto('/examples/next-demo.html');

    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Start preview to trigger SW registration
    await page.click('#run-btn');

    // Wait for SW to register
    await page.waitForTimeout(2000);

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

  test('should fetch virtual URL via fetch API', async ({ page }) => {
    await page.goto('/examples/next-demo.html');
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });
    await page.click('#run-btn');
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Fetch the virtual URL
    const result = await page.evaluate(async () => {
      try {
        const response = await fetch('/__virtual__/3001/');
        const text = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get('content-type'),
          textLength: text.length,
          hasNext: text.includes('__next'),
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    });

    console.log('[Fetch result]', result);

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.textLength).toBeGreaterThan(100);
    expect(result.hasNext).toBe(true);
  });

  test('should render dynamic route /users/[id]', async ({ page }) => {
    await page.goto('/examples/next-demo.html');
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });
    await page.click('#run-btn');
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Fetch the dynamic route
    const result = await page.evaluate(async () => {
      const response = await fetch('/__virtual__/3001/users/123');
      return {
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
        hasNextDiv: (await response.text()).includes('__next'),
      };
    });

    console.log('[Dynamic route result]', result);
    expect(result.status).toBe(200);
    expect(result.hasNextDiv).toBe(true);
  });

  test('HMR should update file content when saved', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (msg) => {
      const text = `[${msg.type()}] ${msg.text()}`;
      logs.push(text);
      console.log(text);
    });

    await page.goto('/examples/next-demo.html');
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });
    await page.click('#run-btn');
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Wait for iframe to load
    await page.waitForTimeout(3000);

    // Edit the index.jsx file
    await page.click('.file-tab[data-file="/pages/index.jsx"]');
    await page.waitForTimeout(500);

    const editor = page.locator('#editor');
    let content = await editor.inputValue();

    const originalText = 'Welcome to Next.js in Browser!';
    const newText = 'HMR TEST SUCCESS!';

    if (!content.includes(originalText)) {
      console.log('[Content snippet]', content.substring(0, 500));
      throw new Error(`Expected editor to contain "${originalText}" but it was not found`);
    }

    const newContent = content.replace(originalText, newText);
    await editor.fill(newContent);
    await page.click('#save-btn');
    console.log('[Clicked save]');

    // Wait for file to be saved
    await page.waitForTimeout(1000);

    // Check logs for HMR messages
    const hmrLogs = logs.filter(l => l.includes('HMR'));
    console.log('[HMR logs]', hmrLogs);
    expect(hmrLogs.length).toBeGreaterThan(0);

    // Verify file was saved by checking the server response
    const appContent = await page.evaluate(async () => {
      const response = await fetch('/__virtual__/3001/pages/index.jsx?t=' + Date.now());
      return await response.text();
    });
    console.log('[Updated file has new text?]', appContent.includes('HMR TEST SUCCESS'));
    expect(appContent).toContain('HMR TEST SUCCESS');
  });

  test.describe('Service Worker navigation redirect', () => {
    test('should redirect plain anchor navigation to include virtual prefix', async ({ page }) => {
      await page.goto('/examples/next-demo.html');
      await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

      // Start preview
      await page.click('#run-btn');
      await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

      // Wait for iframe to load
      await page.waitForTimeout(5000);

      const iframe = page.locator('#preview-frame');
      const iframeHandle = await iframe.elementHandle();
      const frame = await iframeHandle?.contentFrame();

      if (!frame) {
        throw new Error('Could not access iframe');
      }

      await frame.waitForSelector('#__next', { timeout: 15000 });

      // Inject a plain anchor tag (not a Next.js Link) and click it
      // This tests the service worker redirect for plain <a href="/path"> tags
      await frame.evaluate(() => {
        const link = document.createElement('a');
        link.href = '/about'; // Plain path without virtual prefix
        link.id = 'test-plain-link';
        link.textContent = 'Test Plain Link';
        link.style.cssText = 'position:fixed;top:10px;left:10px;z-index:9999;background:red;padding:10px;';
        document.body.appendChild(link);
      });

      // Get initial URL
      const initialUrl = await frame.evaluate(() => window.location.href);
      console.log('[Initial URL]', initialUrl);
      expect(initialUrl).toContain('__virtual__/3001');

      // Dismiss any vite-error-overlay that might intercept pointer events
      await frame.evaluate(() => {
        document.querySelectorAll('vite-error-overlay').forEach(el => el.remove());
      });

      // Click the plain link - this should trigger the SW redirect
      await frame.click('#test-plain-link', { force: true });

      // Wait for navigation to complete
      await page.waitForTimeout(2000);

      // The URL should still contain the virtual prefix after redirect
      const finalUrl = await frame.evaluate(() => window.location.href);
      console.log('[Final URL after plain link click]', finalUrl);

      expect(finalUrl).toContain('__virtual__/3001');
      expect(finalUrl).toContain('/about');
    });

    test('should preserve query params during navigation redirect', async ({ page }) => {
      await page.goto('/examples/next-demo.html');
      await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

      await page.click('#run-btn');
      await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

      await page.waitForTimeout(5000);

      const iframe = page.locator('#preview-frame');
      const iframeHandle = await iframe.elementHandle();
      const frame = await iframeHandle?.contentFrame();

      if (!frame) {
        throw new Error('Could not access iframe');
      }

      await frame.waitForSelector('#__next', { timeout: 15000 });

      // Inject a plain anchor tag with query params
      await frame.evaluate(() => {
        const link = document.createElement('a');
        link.href = '/about?foo=bar&baz=123'; // Path with query params
        link.id = 'test-query-link';
        link.textContent = 'Test Query Link';
        link.style.cssText = 'position:fixed;top:10px;left:10px;z-index:9999;background:blue;padding:10px;color:white;';
        document.body.appendChild(link);
      });

      // Click the link with query params
      await frame.click('#test-query-link');

      // Wait for navigation
      await page.waitForTimeout(2000);

      // The URL should contain virtual prefix AND preserve query params
      const finalUrl = await frame.evaluate(() => window.location.href);
      console.log('[Final URL with query params]', finalUrl);

      expect(finalUrl).toContain('__virtual__/3001');
      expect(finalUrl).toContain('/about');
      expect(finalUrl).toContain('foo=bar');
      expect(finalUrl).toContain('baz=123');
    });

    test('should not affect external link navigation', async ({ page }) => {
      await page.goto('/examples/next-demo.html');
      await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

      await page.click('#run-btn');
      await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

      await page.waitForTimeout(3000);

      const iframe = page.locator('#preview-frame');
      const iframeHandle = await iframe.elementHandle();
      const frame = await iframeHandle?.contentFrame();

      if (!frame) {
        throw new Error('Could not access iframe');
      }

      await frame.waitForSelector('#__next', { timeout: 15000 });

      // Check that external URLs are not modified
      // We can't actually navigate to external sites in tests, but we can verify
      // the service worker logic by checking that fetch to external URLs doesn't redirect
      const result = await page.evaluate(async () => {
        try {
          // This should NOT be intercepted by our service worker
          const response = await fetch('https://example.com', {
            mode: 'no-cors', // Avoid CORS issues
          });
          return {
            type: response.type,
            // opaque response means it wasn't intercepted
            wasIntercepted: response.type !== 'opaque',
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
      });

      console.log('[External URL result]', result);
      // External URLs should not be redirected through our virtual server
      if (!result.error) {
        expect(result.wasIntercepted).toBe(false);
      }
    });

    test('should handle navigation from virtual context after page reload', async ({ page }) => {
      await page.goto('/examples/next-demo.html');
      await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

      await page.click('#run-btn');
      await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

      await page.waitForTimeout(5000);

      const iframe = page.locator('#preview-frame');
      const iframeHandle = await iframe.elementHandle();
      let frame = await iframeHandle?.contentFrame();

      if (!frame) {
        throw new Error('Could not access iframe');
      }

      await frame.waitForSelector('nav', { timeout: 15000 });

      // Get initial URL
      const initialUrl = await frame.evaluate(() => window.location.href);
      console.log('[Initial iframe URL]', initialUrl);
      expect(initialUrl).toContain('__virtual__/3001');

      // Navigate to About using the nav link
      const aboutLink = frame.locator('nav a[href="/about"]').first();
      await expect(aboutLink).toBeVisible({ timeout: 5000 });
      await aboutLink.click();

      await page.waitForTimeout(2000);

      // The URL should still be within the virtual context
      const urlAfterNav = await frame.evaluate(() => window.location.href);
      console.log('[URL after navigation]', urlAfterNav);
      expect(urlAfterNav).toContain('__virtual__/3001');
      expect(urlAfterNav).toContain('/about');

      // Now navigate back to home
      const homeLink = frame.locator('nav a[href="/"]').first();
      await expect(homeLink).toBeVisible({ timeout: 5000 });
      await homeLink.click();

      await page.waitForTimeout(2000);

      // Should still be in virtual context
      const urlAfterBackNav = await frame.evaluate(() => window.location.href);
      console.log('[URL after back navigation]', urlAfterBackNav);
      expect(urlAfterBackNav).toContain('__virtual__/3001');
    });
  });

  test('Debug: Check React Refresh registration', async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[Console ${msg.type()}]`, msg.text());
    });

    await page.goto('/examples/next-demo.html');
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });
    await page.click('#run-btn');
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Wait for iframe to load
    await page.waitForTimeout(5000);

    const iframe = page.locator('#preview-frame');
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();

    if (!frame) {
      throw new Error('Could not access iframe');
    }

    // Check React Refresh state
    const refreshState = await frame.evaluate(() => {
      return {
        hasRefreshRuntime: !!window.$RefreshRuntime$,
        hasRefreshReg: typeof window.$RefreshReg$ === 'function',
        hasHotContext: typeof window.__vite_hot_context__ === 'function',
        refreshRegCount: (window as any).$RefreshRegCount$ || 0,
      };
    });

    console.log('[React Refresh State]', JSON.stringify(refreshState, null, 2));

    expect(refreshState.hasRefreshRuntime).toBe(true);
    expect(refreshState.hasRefreshReg).toBe(true);
    expect(refreshState.hasHotContext).toBe(true);
  });
});
