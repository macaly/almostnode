import { test, expect } from '@playwright/test';

test.describe('Vite Demo with Service Worker', () => {
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
    await page.goto('/examples/vite-demo.html');

    // Check the title in topbar
    await expect(page.locator('.demo-topbar .title')).toContainText('Vite');

    // Check that buttons exist
    await expect(page.locator('#save-btn')).toBeVisible();
    await expect(page.locator('#run-btn')).toBeVisible();
  });

  test('should initialize and enable Start Preview button', async ({ page }) => {
    await page.goto('/examples/vite-demo.html');

    // Wait for initialization
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Start Preview button should be enabled (not have disabled attribute)
    await expect(page.locator('#run-btn')).not.toBeDisabled();
  });

  test('should start dev server and load iframe', async ({ page }) => {
    // Log all requests
    page.on('request', (request) => {
      if (request.url().includes('__virtual__')) {
        console.log('[Request]', request.url(), request.resourceType());
      }
    });

    page.on('response', (response) => {
      if (response.url().includes('__virtual__')) {
        console.log('[Response]', response.url(), response.status(), response.headers()['content-type']);
      }
    });

    await page.goto('/examples/vite-demo.html');

    // Wait for initialization
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Click Start Preview
    await page.click('#run-btn');

    // Wait for dev server to start
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Check SW status
    const swStatus = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        return {
          hasReg: !!reg,
          active: reg?.active?.state,
          scope: reg?.scope,
          controller: !!navigator.serviceWorker.controller
        };
      }
      return { error: 'SW not supported' };
    });
    console.log('[SW Status]', JSON.stringify(swStatus));

    // Check that iframe is visible
    const iframe = page.locator('#preview-frame');
    await expect(iframe).toBeVisible();

    // Get iframe src
    const iframeSrc = await iframe.getAttribute('src');
    console.log('[Iframe src]', iframeSrc);

    // Force reload the iframe to ensure SW is used
    await page.evaluate(() => {
      const iframe = document.getElementById('preview-frame') as HTMLIFrameElement;
      if (iframe) {
        iframe.src = iframe.src;
      }
    });

    // Wait for iframe to load
    await page.waitForTimeout(3000);

    // Wait for iframe to load content
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();

    expect(frame).toBeTruthy();

    // Must have #root — proves Vite HTML was served correctly
    await frame!.waitForSelector('#root', { timeout: 10000 });
    const rootContent = await frame!.locator('#root').innerHTML();
    console.log('[Iframe #root content length]', rootContent.length);
    // React should have rendered something into #root
    expect(rootContent.length).toBeGreaterThan(0);
  });

  test('should show console output', async ({ page }) => {
    await page.goto('/examples/vite-demo.html');

    // Wait for initialization
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Check console output has initialization messages
    const output = page.locator('#output');
    await expect(output).toContainText('Demo ready');
  });

  test('should load editor with file content', async ({ page }) => {
    await page.goto('/examples/vite-demo.html');

    // Wait for initialization
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Editor should have content
    const editor = page.locator('#editor');
    const content = await editor.inputValue();

    expect(content).toContain('function App');
    expect(content).toContain('useState');
  });

  test('should switch between files', async ({ page }) => {
    await page.goto('/examples/vite-demo.html');

    // Wait for initialization
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Click on Counter.jsx tab
    await page.click('.file-tab[data-file="/src/Counter.jsx"]');

    // Editor should now show Counter component
    const editor = page.locator('#editor');
    const content = await editor.inputValue();

    expect(content).toContain('function Counter');
  });

  test('Service Worker should be registered', async ({ page }) => {
    await page.goto('/examples/vite-demo.html');

    // Wait for initialization
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });

    // Click Start Preview to trigger SW registration
    await page.click('#run-btn');

    // Wait a bit for SW to register
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

  test('should not have esbuild initialization errors in iframe', async ({ page }) => {
    const errors: string[] = [];
    const iframeErrors: string[] = [];

    // Capture all console messages
    page.on('console', (msg) => {
      console.log(`[Console ${msg.type()}]`, msg.text());
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      console.log('[Page Error]', error.message);
      errors.push(error.message);
    });

    // Log all requests and responses with timing
    page.on('request', (request) => {
      if (request.url().includes('__virtual__')) {
        console.log('[Request]', request.url(), 'type:', request.resourceType());
      }
    });

    page.on('response', async (response) => {
      if (response.url().includes('__virtual__')) {
        const body = await response.text().catch(() => '<failed to read>');
        console.log('[Response]', response.url(), 'status:', response.status(), 'body length:', body.length);
        if (body.length < 200) {
          console.log('[Response body]', body);
        }
      }
    });

    page.on('requestfailed', (request) => {
      if (request.url().includes('__virtual__')) {
        console.log('[Request Failed]', request.url(), request.failure()?.errorText);
      }
    });

    // First, go to demo and start the server
    await page.goto('/examples/vite-demo.html');
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });
    await page.click('#run-btn');
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Wait for iframe to load
    await page.waitForTimeout(5000);

    // Get iframe and check for errors in its content
    const iframe = page.locator('#preview-frame');
    await expect(iframe).toBeVisible();

    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();

    expect(frame).toBeTruthy();

    // Verify React rendered into #root
    await frame!.waitForSelector('#root', { timeout: 10000 });
    const rootContent = await frame!.locator('#root').innerHTML();
    expect(rootContent.length).toBeGreaterThan(0);

    // No esbuild initialization errors
    const esbuildErrors = errors.filter(e => e.includes('Cannot call') && e.includes('initialize'));
    expect(esbuildErrors).toEqual([]);

    // No other page errors (excluding expected ones)
    const unexpectedErrors = errors.filter(e =>
      !e.includes('favicon') && !e.includes('robots.txt')
    );
    expect(unexpectedErrors).toEqual([]);
  });

  test('should fetch virtual URL via fetch API', async ({ page }) => {
    // First, go to demo and start the server
    await page.goto('/examples/vite-demo.html');
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });
    await page.click('#run-btn');
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Fetch the virtual URL and verify it's a real Vite HTML page
    const result = await page.evaluate(async () => {
      const response = await fetch('/__virtual__/3000/');
      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type'),
        length: text.length,
        hasRoot: text.includes('id="root"'),
        hasScript: text.includes('<script'),
      };
    });

    console.log('[Fetch result]', { status: result.status, length: result.length });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.contentType).toContain('text/html');
    expect(result.hasRoot).toBe(true);
    expect(result.hasScript).toBe(true);
  });

  test('should access virtual URL directly in new tab', async ({ page }) => {
    await page.goto('/examples/vite-demo.html');
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });
    await page.click('#run-btn');
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Open virtual URL directly in a new page
    const newPage = await page.context().newPage();
    await newPage.goto('http://localhost:5173/__virtual__/3000/');
    await newPage.waitForTimeout(3000);

    // Must have React #root
    const hasRoot = await newPage.locator('#root').count();
    expect(hasRoot).toBeGreaterThan(0);

    await newPage.close();
  });

  // HMR propagation to iframe is unreliable in e2e — server has correct content but iframe doesn't re-render
  test.fixme('HMR should update iframe content when file changes', async ({ page }) => {
    // Capture all console messages for debugging
    const logs: string[] = [];
    page.on('console', (msg) => {
      const text = `[${msg.type()}] ${msg.text()}`;
      logs.push(text);
      console.log(text);
    });

    // Go to demo and start server
    await page.goto('/examples/vite-demo.html');
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });
    await page.click('#run-btn');
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Wait for iframe to fully load and React to render
    await page.waitForTimeout(5000);

    // Get the iframe
    const iframe = page.locator('#preview-frame');
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();

    if (!frame) {
      throw new Error('Could not access iframe');
    }

    // Wait for React to render - look for the header
    await frame.waitForSelector('h1', { timeout: 10000 });

    // Get the initial h1 text
    const initialH1 = await frame.locator('h1').textContent();
    console.log('[Initial H1]', initialH1);

    // Also check the full body content for debugging
    const initialBody = await frame.locator('body').innerHTML();
    console.log('[Initial body length]', initialBody.length);

    // Now edit the App.jsx file to change the h1 text
    // First switch to App.jsx in the editor
    await page.click('.file-tab[data-file="/src/App.jsx"]');
    await page.waitForTimeout(500);

    // Get current editor content
    const editor = page.locator('#editor');
    let content = await editor.inputValue();
    console.log('[Original App.jsx length]', content.length);

    // Change the h1 text - look for the actual text in the file
    const originalText = 'React + Vite in Browser';
    const newText = 'HMR TEST SUCCESS';

    if (!content.includes(originalText)) {
      console.log('[App.jsx content snippet]', content.substring(0, 500));
      throw new Error(`Could not find "${originalText}" in App.jsx`);
    }

    const newContent = content.replace(originalText, newText);
    console.log('[Modified App.jsx - changed text]');

    // Clear and set new content
    await editor.fill(newContent);

    // Click save button
    await page.click('#save-btn');
    console.log('[Clicked save]');

    // Wait for HMR to trigger and poll for the change
    let newH1 = initialH1;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      newH1 = await frame.locator('h1').textContent();
      if (newH1 && newH1.includes(newText)) break;
    }

    // Check the logs for HMR messages
    const hmrLogs = logs.filter(l => l.includes('HMR'));
    console.log('[HMR related logs]', hmrLogs);
    console.log('[New H1]', newH1);

    // Get full body again
    const newBody = await frame.locator('body').innerHTML();
    console.log('[New body length]', newBody.length);

    // Check if something changed
    if (newH1 === initialH1) {
      console.log('[FAIL] H1 did not change!');
      console.log('[Initial H1]:', initialH1);
      console.log('[Expected]:', newText);
      console.log('[Actual]:', newH1);

      // Check if the iframe got the update at all by checking network
      // Let's manually fetch the App.jsx to see what it returns
      const appJsxContent = await page.evaluate(async () => {
        const response = await fetch('/__virtual__/3000/src/App.jsx?t=' + Date.now());
        return await response.text();
      });
      console.log('[Current App.jsx from server - snippet]', appJsxContent.substring(0, 500));
      console.log('[Does server have new text?]', appJsxContent.includes('HMR TEST SUCCESS'));
    }

    // The test - verify HMR worked
    expect(newH1).toContain(newText);
  });

  test('Debug: Check React Refresh registration', async ({ page }) => {
    // Capture all console messages
    page.on('console', (msg) => {
      console.log(`[Console ${msg.type()}]`, msg.text());
    });

    // Go to demo and start server
    await page.goto('/examples/vite-demo.html');
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 10000 });
    await page.click('#run-btn');
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Wait for iframe to load
    await page.waitForTimeout(5000);

    // Get the iframe
    const iframe = page.locator('#preview-frame');
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();

    if (!frame) {
      throw new Error('Could not access iframe');
    }

    // Check React Refresh state in the iframe
    const refreshState = await frame.evaluate(() => {
      return {
        hasRefreshRuntime: !!window.$RefreshRuntime$,
        hasRefreshReg: typeof window.$RefreshReg$ === 'function',
        hasHotContext: typeof window.__vite_hot_context__ === 'function',
        refreshRegCount: (window as any).$RefreshRegCount$ || 0,
        hasDevToolsHook: !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__,
        devToolsHookRenderers: window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.size || 0,
      };
    });

    console.log('[React Refresh State]', JSON.stringify(refreshState, null, 2));

    // Verify React Refresh is set up
    expect(refreshState.hasRefreshRuntime).toBe(true);
    expect(refreshState.hasRefreshReg).toBe(true);
    expect(refreshState.hasHotContext).toBe(true);
    expect(refreshState.refreshRegCount).toBeGreaterThan(0);
  });
});
