import { test, expect } from '@playwright/test';

/**
 * E2E tests for new Next.js features:
 * - CSS Modules
 * - App Router API Routes (route.ts)
 * - Route Groups ((group))
 * - useParams()
 * - loading.tsx / error.tsx / not-found.tsx
 */

const VIRTUAL_PREFIX = '/__virtual__/3002';

test.describe('Next.js New Features E2E', () => {
  let pageErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`[Browser ERROR]`, msg.text());
      }
    });

    page.on('pageerror', (error) => {
      console.error('[Page Error]', error.message);
      pageErrors.push(error.message);
    });

    // Navigate to test harness
    await page.goto('/examples/next-features-test.html');

    // Wait for initialization
    await expect(page.locator('#status-text')).toContainText('Ready', { timeout: 15000 });

    // Start dev server
    await page.click('#run-btn');
    await expect(page.locator('#status-text')).toContainText('Dev server running', { timeout: 30000 });

    // Wait for service worker and iframe to be ready
    await page.waitForTimeout(3000);
  });

  test.describe('App Router API Routes (route.ts)', () => {
    test('should handle GET request to /api/hello', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/api/hello`);
        const data = await response.json();
        return { status: response.status, data };
      }, VIRTUAL_PREFIX);

      console.log('[API GET /api/hello]', result);
      expect(result.status).toBe(200);
      expect(result.data.message).toBe('Hello from App Router API!');
      expect(result.data.method).toBe('GET');
    });

    test('should handle POST request to /api/hello', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/api/hello`, {
          method: 'POST',
          body: JSON.stringify({ test: true }),
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return { status: response.status, data };
      }, VIRTUAL_PREFIX);

      console.log('[API POST /api/hello]', result);
      expect(result.status).toBe(200);
      expect(result.data.method).toBe('POST');
      expect(result.data.body).toContain('test');
    });

    test('should handle query params in /api/data', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/api/data?id=42`);
        const data = await response.json();
        return { status: response.status, data };
      }, VIRTUAL_PREFIX);

      console.log('[API GET /api/data?id=42]', result);
      expect(result.status).toBe(200);
      expect(result.data.id).toBe('42');
      expect(result.data.items).toEqual([1, 2, 3]);
    });
  });

  test.describe('Route Groups', () => {
    test('should resolve /about through (marketing) route group', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/_next/route-info?pathname=/about`);
        const data = await response.json();
        return data;
      }, VIRTUAL_PREFIX);

      console.log('[Route Group /about]', result);
      expect(result.found).toBe(true);
    });

    test('should resolve /pricing through (marketing) route group', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/_next/route-info?pathname=/pricing`);
        const data = await response.json();
        return data;
      }, VIRTUAL_PREFIX);

      console.log('[Route Group /pricing]', result);
      expect(result.found).toBe(true);
    });

    test('should resolve /login through (auth) route group', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/_next/route-info?pathname=/login`);
        const data = await response.json();
        return data;
      }, VIRTUAL_PREFIX);

      console.log('[Route Group /login]', result);
      expect(result.found).toBe(true);
    });

    test('should render route group page content', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/about`);
        const html = await response.text();
        return {
          status: response.status,
          hasContent: html.includes('about') || html.includes('About'),
          length: html.length,
        };
      }, VIRTUAL_PREFIX);

      console.log('[Route Group render /about]', result);
      expect(result.status).toBe(200);
      expect(result.length).toBeGreaterThan(100);
    });

    test('should return 404 for non-existent route group paths', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/_next/route-info?pathname=/nonexistent`);
        const data = await response.json();
        return data;
      }, VIRTUAL_PREFIX);

      console.log('[Route Group nonexistent]', result);
      expect(result.found).toBe(false);
    });
  });

  test.describe('CSS Modules', () => {
    test('should serve CSS module page', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/css-test`);
        const html = await response.text();
        return {
          status: response.status,
          length: html.length,
        };
      }, VIRTUAL_PREFIX);

      console.log('[CSS Module page]', result);
      expect(result.status).toBe(200);
      expect(result.length).toBeGreaterThan(100);
    });

    test('should transform CSS module imports into scoped class objects', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/app/css-test/page.jsx`);
        const source = await response.text();
        return {
          status: response.status,
          source,
          hasStyleTag: source.includes('<style>') || source.includes('style'),
          hasImportStripped: !source.includes("import styles from './styles.module.css'"),
          hasConstStyles: source.includes('const styles') || source.includes('var styles'),
        };
      }, VIRTUAL_PREFIX);

      console.log('[CSS Module transform]', {
        status: result.status,
        hasStyleTag: result.hasStyleTag,
        hasImportStripped: result.hasImportStripped,
        hasConstStyles: result.hasConstStyles,
        sourceSnippet: result.source.substring(0, 300),
      });
      expect(result.status).toBe(200);
      expect(result.hasImportStripped).toBe(true);
      expect(result.hasConstStyles).toBe(true);
    });

    test('should generate scoped class names in CSS module object', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/app/css-test/page.jsx`);
        const source = await response.text();
        // Extract the styles object from the source
        const hasTitle = source.includes('"title"');
        const hasCard = source.includes('"card"');
        const hasActive = source.includes('"active"');
        // Check for scoped class names (original_hash format)
        const hasScopedNames = /title_[a-z0-9]+/.test(source);
        return { hasTitle, hasCard, hasActive, hasScopedNames };
      }, VIRTUAL_PREFIX);

      console.log('[CSS Module scoped classes]', result);
      expect(result.hasTitle).toBe(true);
      expect(result.hasCard).toBe(true);
      expect(result.hasActive).toBe(true);
      expect(result.hasScopedNames).toBe(true);
    });

    test('should inject style tag with scoped CSS', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/app/css-test/page.jsx`);
        const source = await response.text();
        const hasStyleInsertion = source.includes('document.head') || source.includes('createElement');
        const hasCssContent = source.includes('color: red') || source.includes('color:red') || source.includes('font-size');
        return { hasStyleInsertion, hasCssContent };
      }, VIRTUAL_PREFIX);

      console.log('[CSS Module style injection]', result);
      expect(result.hasStyleInsertion).toBe(true);
      expect(result.hasCssContent).toBe(true);
    });
  });

  test.describe('useParams', () => {
    test('should resolve dynamic route params via route-info', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/_next/route-info?pathname=/posts/hello-world`);
        const data = await response.json();
        return data;
      }, VIRTUAL_PREFIX);

      console.log('[useParams route-info /posts/hello-world]', result);
      expect(result.found).toBe(true);
      expect(result.params).toBeDefined();
      expect(result.params.slug).toBe('hello-world');
    });

    test('should embed route params in HTML for dynamic routes', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/posts/my-first-post`);
        const html = await response.text();
        return {
          status: response.status,
          hasRouteParams: html.includes('__NEXT_ROUTE_PARAMS__'),
          hasSlugParam: html.includes('my-first-post'),
        };
      }, VIRTUAL_PREFIX);

      console.log('[useParams HTML embed]', result);
      expect(result.status).toBe(200);
      expect(result.hasRouteParams).toBe(true);
      expect(result.hasSlugParam).toBe(true);
    });

    test('should return different params for different slugs', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const r1 = await fetch(`${prefix}/_next/route-info?pathname=/posts/alpha`);
        const d1 = await r1.json();
        const r2 = await fetch(`${prefix}/_next/route-info?pathname=/posts/beta`);
        const d2 = await r2.json();
        return { alpha: d1.params, beta: d2.params };
      }, VIRTUAL_PREFIX);

      console.log('[useParams different slugs]', result);
      expect(result.alpha.slug).toBe('alpha');
      expect(result.beta.slug).toBe('beta');
    });
  });

  test.describe('Convention Files (loading, error, not-found)', () => {
    test('should resolve /slow route', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/_next/route-info?pathname=/slow`);
        const data = await response.json();
        return data;
      }, VIRTUAL_PREFIX);

      console.log('[Convention files /slow route-info]', result);
      expect(result.found).toBe(true);
    });

    test('should embed convention file paths in HTML for /slow', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/slow`);
        const html = await response.text();
        return {
          status: response.status,
          hasLoadingRef: html.includes('loading'),
          hasErrorRef: html.includes('error') || html.includes('ErrorBoundary'),
          length: html.length,
        };
      }, VIRTUAL_PREFIX);

      console.log('[Convention files /slow HTML]', result);
      expect(result.status).toBe(200);
      expect(result.hasLoadingRef).toBe(true);
      expect(result.hasErrorRef).toBe(true);
    });

    test('should serve 404 page for unknown routes', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/nonexistent-page-xyz`);
        return {
          status: response.status,
          contentType: response.headers.get('content-type'),
        };
      }, VIRTUAL_PREFIX);

      console.log('[404 for unknown route]', result);
      expect(result.status).toBe(404);
    });
  });

  test.describe('Home page and basic routing', () => {
    test('should serve home page with #__next container', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/`);
        const html = await response.text();
        return {
          status: response.status,
          hasNext: html.includes('__next'),
          length: html.length,
        };
      }, VIRTUAL_PREFIX);

      console.log('[Home page]', result);
      expect(result.status).toBe(200);
      expect(result.hasNext).toBe(true);
      expect(result.length).toBeGreaterThan(200);
    });

    test('should serve Next.js navigation shim', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/_next/shims/navigation.js`);
        const source = await response.text();
        return {
          status: response.status,
          hasUseParams: source.includes('useParams'),
          hasUsePathname: source.includes('usePathname'),
          hasUseRouter: source.includes('useRouter'),
          length: source.length,
        };
      }, VIRTUAL_PREFIX);

      console.log('[Next shim navigation.js]', result);
      expect(result.status).toBe(200);
      expect(result.hasUseParams).toBe(true);
      expect(result.hasUsePathname).toBe(true);
      expect(result.hasUseRouter).toBe(true);
    });

    test('should serve Next.js font/local shim', async ({ page }) => {
      const result = await page.evaluate(async (prefix) => {
        const response = await fetch(`${prefix}/_next/shims/font/local.js`);
        return {
          status: response.status,
          contentType: response.headers.get('content-type'),
          length: (await response.text()).length,
        };
      }, VIRTUAL_PREFIX);

      console.log('[Next shim font/local.js]', result);
      expect(result.status).toBe(200);
      expect(result.length).toBeGreaterThan(50);
    });
  });

  test.describe('Iframe rendering', () => {
    test('should render home page in iframe with #__next', async ({ page }) => {
      const iframe = page.locator('#preview-frame');
      const iframeHandle = await iframe.elementHandle();
      const frame = await iframeHandle?.contentFrame();
      expect(frame).toBeTruthy();

      await frame!.waitForSelector('#__next', { timeout: 15000 });
      const hasNext = await frame!.locator('#__next').count();
      expect(hasNext).toBeGreaterThan(0);
    });

    test('should render home page heading in iframe', async ({ page }) => {
      await page.waitForTimeout(5000);

      const iframe = page.locator('#preview-frame');
      const iframeHandle = await iframe.elementHandle();
      const frame = await iframeHandle?.contentFrame();
      expect(frame).toBeTruthy();

      await frame!.waitForSelector('#home-heading', { timeout: 15000 });
      const headingText = await frame!.locator('#home-heading').textContent();
      console.log('[Home heading]', headingText);
      expect(headingText).toContain('Features Test Home');
    });

    test('should render CSS module page with scoped classes in iframe', async ({ page }) => {
      // Navigate iframe to CSS test page
      await page.evaluate((prefix) => {
        const iframe = document.getElementById('preview-frame') as HTMLIFrameElement;
        iframe.src = `${prefix}/css-test`;
      }, VIRTUAL_PREFIX);

      await page.waitForTimeout(5000);

      const iframe = page.locator('#preview-frame');
      const iframeHandle = await iframe.elementHandle();
      const frame = await iframeHandle?.contentFrame();
      expect(frame).toBeTruthy();

      await frame!.waitForSelector('#css-title', { timeout: 15000 });
      const title = await frame!.locator('#css-title').textContent();
      console.log('[CSS Module iframe title]', title);
      expect(title).toContain('CSS Modules Test');

      // Check that the className has scoped class name
      const className = await frame!.locator('#css-title').getAttribute('class');
      console.log('[CSS Module className]', className);
      expect(className).toMatch(/title_[a-z0-9]+/);

      // Check that the styles object is rendered
      const classesJson = await frame!.locator('#css-classes').textContent();
      console.log('[CSS Module classes JSON]', classesJson);
      expect(classesJson).toContain('title');
      expect(classesJson).toContain('card');
    });

    test('should render route group page in iframe', async ({ page }) => {
      // Navigate iframe to about page (served via route group)
      await page.evaluate((prefix) => {
        const iframe = document.getElementById('preview-frame') as HTMLIFrameElement;
        iframe.src = `${prefix}/about`;
      }, VIRTUAL_PREFIX);

      await page.waitForTimeout(5000);

      const iframe = page.locator('#preview-frame');
      const iframeHandle = await iframe.elementHandle();
      const frame = await iframeHandle?.contentFrame();
      expect(frame).toBeTruthy();

      await frame!.waitForSelector('#about-heading', { timeout: 15000 });
      const heading = await frame!.locator('#about-heading').textContent();
      console.log('[Route Group iframe heading]', heading);
      expect(heading).toContain('About Page');
    });
  });
});
