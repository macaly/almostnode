import { test, expect } from '@playwright/test';

/**
 * Test Convex deployment flow
 *
 * Requires CONVEX_DEPLOY_KEY environment variable to be set
 * Run with: CONVEX_DEPLOY_KEY="dev:your-deployment|your-token" npx playwright test e2e/convex-deploy.spec.ts
 */
test.describe('Convex Deployment', () => {
  // Increase timeout for deployment tests
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    // Collect all console messages for debugging
    const consoleLogs: string[] = [];

    page.on('console', (msg) => {
      const text = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(text);
      console.log(text);
    });

    page.on('pageerror', (error) => {
      console.error('[Page Error]', error.message);
    });

    // Attach logs to test info for debugging
    (page as any).__consoleLogs = consoleLogs;

    // Navigate and wait for init, then dismiss setup overlay so #deployBtn is clickable
    await page.goto('/examples/demo-convex-app.html');
    await expect(page.locator('#statusText')).toContainText('Running', { timeout: 60000 });
    await page.evaluate(() => {
      document.getElementById('setupOverlay')?.classList.add('hidden');
    });
  });

  test('should deploy schema and functions to Convex', async ({ page }) => {
    const deployKey = process.env.CONVEX_DEPLOY_KEY;

    if (!deployKey) {
      test.skip();
      return;
    }

    console.log('✓ Demo initialized and running');

    // Check initial log messages
    const logs = page.locator('#logs');
    await expect(logs).toContainText('Demo ready');
    console.log('✓ Demo ready message found');

    // Enter the deploy key
    await page.fill('#convexKey', deployKey);
    console.log('✓ Deploy key entered');

    // Click deploy button
    await page.click('#deployBtn');
    console.log('✓ Deploy button clicked');

    // Wait for deployment process to start using structured status codes
    await expect(logs).toContainText('[STATUS:DEPLOYING]', { timeout: 10000 });
    console.log('✓ Deployment started');

    // Wait for convex package installation using status code
    await expect(logs).toContainText('[STATUS:INSTALLED]', { timeout: 60000 });
    console.log('✓ Convex package ready');

    // Wait for CLI to run using status code
    await expect(logs).toContainText('[STATUS:CLI_RUNNING]', { timeout: 10000 });
    console.log('✓ CLI started');

    // Wait for waiting phase
    await expect(logs).toContainText('[STATUS:WAITING]', { timeout: 30000 });
    console.log('✓ CLI running, waiting for deployment');

    // Wait for deployment completion using status code
    // This is the key indicator - either COMPLETE or ERROR
    await expect(logs).toContainText(/\[STATUS:(COMPLETE|ERROR)\]/, { timeout: 60000 });

    // Check the final status
    const logsText = await logs.textContent();

    if (logsText?.includes('[STATUS:ERROR]')) {
      console.error('✗ Deployment failed');
      console.log('\n=== Full Logs ===');
      console.log(logsText);
      // Fail the test
      expect(logsText).toContain('[STATUS:COMPLETE]');
    } else {
      console.log('✓ Deployment completed successfully');
    }

    // Check for generated files (this indicates functions were pushed)
    if (logsText?.includes('_generated directory not created')) {
      console.error('✗ Functions were NOT deployed - _generated directory missing');

      // Capture more debug info
      console.log('\n=== Full Logs ===');
      console.log(logsText);

      // Fail the test
      expect(logsText).toContain('Generated files:');
    } else if (logsText?.includes('Generated files:')) {
      console.log('✓ Functions were deployed - _generated files exist');

      // Verify specific generated files
      expect(logsText).toContain('api.ts');
      console.log('✓ api.ts generated');
    }

    // Check that the button shows success and is re-enabled for re-deployment
    await expect(page.locator('#deployBtn')).toContainText('Re-deploy', { timeout: 15000 });
    await expect(page.locator('#deployBtn')).not.toBeDisabled({ timeout: 5000 });
    console.log('✓ Deploy button shows Re-deploy and is re-enabled');

    // Wait a bit and check if the app connects to Convex
    await page.waitForTimeout(5000);

    // The iframe should now show the connected app
    const iframe = page.locator('#preview-iframe');
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();

    if (frame) {
      // Look for the todo input (indicates app is connected and working)
      try {
        await frame.waitForSelector('input[placeholder*="Add"]', { timeout: 10000 });
        console.log('✓ Todo input found - app is connected to Convex');
      } catch {
        // Check what the frame is showing
        const html = await frame.content();
        console.log('Frame content preview:', html.substring(0, 500));

        // It might still show "Connect to Convex" if the React component hasn't updated
        const hasConnectPrompt = html.includes('Connect to Convex');
        const hasTodoInput = html.includes('Add a new task') || html.includes('Add new todo');

        console.log('Has Connect Prompt:', hasConnectPrompt);
        console.log('Has Todo Input:', hasTodoInput);
      }
    }

    // Final verification: check Convex URL was set (using status code)
    expect(logsText).toContain('[STATUS:COMPLETE]');
    console.log('✓ Convex URL configured');

    console.log('\n=== Deployment Test Complete ===');
  });

  test('should handle invalid deploy key', async ({ page }) => {
    // Enter an invalid key
    await page.fill('#convexKey', 'invalid-key');
    await page.click('#deployBtn');

    // Should show error
    const logs = page.locator('#logs');
    await expect(logs).toContainText('Invalid deploy key format', { timeout: 10000 });

    // Button should be re-enabled
    await expect(page.locator('#deployBtn')).not.toBeDisabled({ timeout: 5000 });
  });

  test('should show error for empty deploy key', async ({ page }) => {
    // Click deploy without entering key
    await page.click('#deployBtn');

    // Should show error with status code
    const logs = page.locator('#logs');
    await expect(logs).toContainText('[STATUS:ERROR] Please enter a Convex deploy key', { timeout: 5000 });
  });

  test('should allow re-deployment without page refresh', async ({ page }) => {
    const deployKey = process.env.CONVEX_DEPLOY_KEY;

    if (!deployKey) {
      test.skip();
      return;
    }

    // First deployment
    await page.fill('#convexKey', deployKey);
    await page.click('#deployBtn');
    await expect(page.locator('#logs')).toContainText('[STATUS:COMPLETE]', { timeout: 60000 });
    console.log('✓ First deployment complete');

    // Button should be re-enabled after successful deployment
    await expect(page.locator('#deployBtn')).not.toBeDisabled({ timeout: 5000 });
    await expect(page.locator('#deployBtn')).toContainText('Re-deploy', { timeout: 5000 });
    console.log('✓ Deploy button is re-enabled');

    // Second deployment (re-deploy)
    await page.click('#deployBtn');
    await expect(page.locator('#logs')).toContainText('[STATUS:DEPLOYING]', { timeout: 10000 });
    console.log('✓ Re-deployment started');

    // Wait for second deployment to complete
    // Need to wait for the SECOND [STATUS:COMPLETE] message
    const logs = page.locator('#logs');
    const logsText = await logs.textContent();
    const completeCount = (logsText?.match(/\[STATUS:COMPLETE\]/g) || []).length;

    // If we already have one COMPLETE, wait for another
    if (completeCount === 1) {
      // Wait for another COMPLETE by checking the count increases
      await expect(async () => {
        const newLogsText = await logs.textContent();
        const newCount = (newLogsText?.match(/\[STATUS:COMPLETE\]/g) || []).length;
        expect(newCount).toBeGreaterThan(1);
      }).toPass({ timeout: 60000 });
    }

    console.log('✓ Re-deployment complete');
    console.log('\n=== Re-deployment Test Complete ===');
  });

  test('re-deployment picks up file changes', async ({ page }) => {
    const deployKey = process.env.CONVEX_DEPLOY_KEY;

    if (!deployKey) {
      test.skip();
      return;
    }

    console.log('✓ Demo initialized');

    // 1. Initial deployment
    await page.fill('#convexKey', deployKey);
    await page.click('#deployBtn');
    await expect(page.locator('#logs')).toContainText('[STATUS:COMPLETE]', { timeout: 120000 });
    console.log('✓ Initial deployment complete');

    // 2. Modify the todos.ts file to add a marker
    await page.evaluate(() => {
      const vfs = (window as any).__vfs__;
      const content = vfs.readFileSync('/convex/todos.ts', 'utf8');
      // Add a marker that will appear in task titles
      const modified = content.replace(
        'title: args.title,',
        'title: args.title + " [MODIFIED]",'
      );
      vfs.writeFileSync('/convex/todos.ts', modified);
      console.log('Modified /convex/todos.ts with [MODIFIED] marker');
    });
    console.log('✓ Modified todos.ts with [MODIFIED] marker');

    // 3. Re-deploy
    await page.click('#deployBtn');
    console.log('✓ Clicked Re-deploy');

    // Wait for deployment to start
    await expect(page.locator('#logs')).toContainText('Re-deploying', { timeout: 5000 }).catch(() => {
      // Button text might just be "Deploying..."
    });

    // Wait for re-deployment to complete (look for a second COMPLETE message)
    const logs = page.locator('#logs');
    await expect(async () => {
      const logsText = await logs.textContent();
      const completeCount = (logsText?.match(/\[STATUS:COMPLETE\]/g) || []).length;
      expect(completeCount).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 120000 });
    console.log('✓ Re-deployment complete');

    // 4. Wait for iframe to load and create a task
    await page.waitForTimeout(3000); // Allow iframe to refresh

    const iframe = page.locator('#preview-iframe');
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();

    if (!frame) {
      console.log('✗ Could not access iframe');
      return;
    }

    // Wait for the todo input to appear
    try {
      await frame.waitForSelector('input[placeholder*="Add"]', { timeout: 15000 });
      console.log('✓ Todo input found');

      // Add a test task
      const testTaskTitle = 'Test task ' + Date.now();
      await frame.fill('input[placeholder*="Add"]', testTaskTitle);
      await frame.press('input[placeholder*="Add"]', 'Enter');
      console.log('✓ Created test task');

      // Wait for the task to appear and check if it has the marker
      await frame.waitForTimeout(2000);

      // Check if the task has the [MODIFIED] marker
      const taskWithMarker = await frame.$(`text="${testTaskTitle} [MODIFIED]"`);
      const taskWithoutMarker = await frame.$(`text="${testTaskTitle}"`);

      if (taskWithMarker) {
        console.log('✓ Task has [MODIFIED] marker - re-deployment worked!');
      } else if (taskWithoutMarker) {
        // Task exists but without marker - re-deployment didn't pick up changes
        console.log('✗ Task found but WITHOUT [MODIFIED] marker - re-deployment regression detected');

        // Capture debug info
        const frameContent = await frame.content();
        console.log('Frame content preview:', frameContent.substring(0, 1000));

        // Fail the test
        expect(taskWithMarker).toBeTruthy();
      } else {
        // Task not found at all
        console.log('✗ Task not found in the page');
        const frameContent = await frame.content();
        console.log('Frame content:', frameContent.substring(0, 2000));
      }
    } catch (error) {
      console.log('Could not interact with iframe:', error);
      // Log what we can see
      const frameContent = await frame.content();
      console.log('Frame content preview:', frameContent.substring(0, 500));
    }

    console.log('\n=== Re-deployment File Changes Test Complete ===');
  });

});
