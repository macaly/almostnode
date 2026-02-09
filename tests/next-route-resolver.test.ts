import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import {
  type RouteResolverContext,
  hasAppRouter,
  resolveAppRoute,
  resolveAppRouteHandler,
  resolvePageFile,
  resolveApiFile,
  resolveFileWithExtension,
  needsTransform,
} from '../src/frameworks/next-route-resolver';

/**
 * Create a RouteResolverContext from a VirtualFS instance
 */
function createCtx(vfs: VirtualFS): RouteResolverContext {
  return {
    exists: (path: string) => {
      try { vfs.statSync(path); return true; } catch { return false; }
    },
    isDirectory: (path: string) => {
      try { return vfs.statSync(path).isDirectory(); } catch { return false; }
    },
    readdir: (path: string) => vfs.readdirSync(path) as string[],
  };
}

// ─── hasAppRouter ────────────────────────────────────────────────────────────

describe('hasAppRouter', () => {
  let vfs: VirtualFS;
  let ctx: RouteResolverContext;

  beforeEach(() => {
    vfs = new VirtualFS();
    ctx = createCtx(vfs);
  });

  it('returns false when app dir does not exist', () => {
    expect(hasAppRouter('/app', ctx)).toBe(false);
  });

  it('returns true when root page.jsx exists', () => {
    vfs.mkdirSync('/app', { recursive: true });
    vfs.writeFileSync('/app/page.jsx', 'export default function Page() {}');
    expect(hasAppRouter('/app', ctx)).toBe(true);
  });

  it('returns true when root page.tsx exists', () => {
    vfs.mkdirSync('/app', { recursive: true });
    vfs.writeFileSync('/app/page.tsx', 'export default function Page() {}');
    expect(hasAppRouter('/app', ctx)).toBe(true);
  });

  it('returns true when layout.tsx exists without page', () => {
    vfs.mkdirSync('/app', { recursive: true });
    vfs.writeFileSync('/app/layout.tsx', 'export default function Layout() {}');
    expect(hasAppRouter('/app', ctx)).toBe(true);
  });

  it('returns true when page exists inside route group', () => {
    vfs.mkdirSync('/app/(marketing)', { recursive: true });
    vfs.writeFileSync('/app/(marketing)/page.tsx', 'export default function Page() {}');
    expect(hasAppRouter('/app', ctx)).toBe(true);
  });

  it('returns false when app dir is empty', () => {
    vfs.mkdirSync('/app', { recursive: true });
    expect(hasAppRouter('/app', ctx)).toBe(false);
  });

  it('returns false when app dir has only subdirectories', () => {
    vfs.mkdirSync('/app/about', { recursive: true });
    vfs.writeFileSync('/app/about/page.tsx', 'export default function About() {}');
    // No root page or layout
    expect(hasAppRouter('/app', ctx)).toBe(false);
  });
});

// ─── resolveAppRoute ─────────────────────────────────────────────────────────

describe('resolveAppRoute', () => {
  let vfs: VirtualFS;
  let ctx: RouteResolverContext;

  beforeEach(() => {
    vfs = new VirtualFS();
    ctx = createCtx(vfs);
  });

  describe('static pages', () => {
    it('resolves root page', () => {
      vfs.mkdirSync('/app', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'layout');
      vfs.writeFileSync('/app/page.tsx', 'page');

      const route = resolveAppRoute('/app', '/', ctx);
      expect(route).not.toBeNull();
      expect(route!.page).toBe('/app/page.tsx');
      expect(route!.layouts).toEqual(['/app/layout.tsx']);
    });

    it('resolves nested page', () => {
      vfs.mkdirSync('/app/about', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'layout');
      vfs.writeFileSync('/app/about/page.tsx', 'about page');

      const route = resolveAppRoute('/app', '/about', ctx);
      expect(route).not.toBeNull();
      expect(route!.page).toBe('/app/about/page.tsx');
      expect(route!.layouts).toEqual(['/app/layout.tsx']);
    });

    it('resolves deeply nested page', () => {
      vfs.mkdirSync('/app/docs/api', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'root layout');
      vfs.writeFileSync('/app/docs/layout.tsx', 'docs layout');
      vfs.writeFileSync('/app/docs/api/page.tsx', 'api docs');

      const route = resolveAppRoute('/app', '/docs/api', ctx);
      expect(route).not.toBeNull();
      expect(route!.page).toBe('/app/docs/api/page.tsx');
      expect(route!.layouts).toEqual(['/app/layout.tsx', '/app/docs/layout.tsx']);
    });

    it('returns null for non-existent page', () => {
      vfs.mkdirSync('/app', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'layout');

      const route = resolveAppRoute('/app', '/missing', ctx);
      expect(route).toBeNull();
    });
  });

  describe('dynamic routes', () => {
    it('resolves [id] dynamic segment', () => {
      vfs.mkdirSync('/app/users/[id]', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'layout');
      vfs.writeFileSync('/app/users/[id]/page.tsx', 'user page');

      const route = resolveAppRoute('/app', '/users/123', ctx);
      expect(route).not.toBeNull();
      expect(route!.page).toBe('/app/users/[id]/page.tsx');
      expect(route!.params).toEqual({ id: '123' });
    });

    it('resolves catch-all [...slug]', () => {
      vfs.mkdirSync('/app/docs/[...slug]', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'layout');
      vfs.writeFileSync('/app/docs/[...slug]/page.tsx', 'docs page');

      const route = resolveAppRoute('/app', '/docs/a/b/c', ctx);
      expect(route).not.toBeNull();
      expect(route!.page).toBe('/app/docs/[...slug]/page.tsx');
      expect(route!.params).toEqual({ slug: ['a', 'b', 'c'] });
    });

    it('resolves optional catch-all [[...slug]]', () => {
      vfs.mkdirSync('/app/docs/[[...slug]]', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'layout');
      vfs.writeFileSync('/app/docs/[[...slug]]/page.tsx', 'docs page');

      const route = resolveAppRoute('/app', '/docs/a/b', ctx);
      expect(route).not.toBeNull();
      expect(route!.page).toBe('/app/docs/[[...slug]]/page.tsx');
      expect(route!.params).toEqual({ slug: ['a', 'b'] });
    });

    it('prefers exact match over dynamic segment', () => {
      vfs.mkdirSync('/app/users/settings', { recursive: true });
      vfs.mkdirSync('/app/users/[id]', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'layout');
      vfs.writeFileSync('/app/users/settings/page.tsx', 'settings');
      vfs.writeFileSync('/app/users/[id]/page.tsx', 'user');

      const route = resolveAppRoute('/app', '/users/settings', ctx);
      expect(route).not.toBeNull();
      expect(route!.page).toBe('/app/users/settings/page.tsx');
    });
  });

  describe('route groups', () => {
    it('resolves page inside route group', () => {
      vfs.mkdirSync('/app/(marketing)', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'root layout');
      vfs.writeFileSync('/app/(marketing)/page.tsx', 'home');

      const route = resolveAppRoute('/app', '/', ctx);
      expect(route).not.toBeNull();
      expect(route!.page).toBe('/app/(marketing)/page.tsx');
    });

    it('resolves nested page inside route group', () => {
      vfs.mkdirSync('/app/(marketing)/about', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'root layout');
      vfs.writeFileSync('/app/(marketing)/about/page.tsx', 'about');

      const route = resolveAppRoute('/app', '/about', ctx);
      expect(route).not.toBeNull();
      expect(route!.page).toBe('/app/(marketing)/about/page.tsx');
    });

    it('collects group layout', () => {
      vfs.mkdirSync('/app/(marketing)', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'root layout');
      vfs.writeFileSync('/app/(marketing)/layout.tsx', 'group layout');
      vfs.writeFileSync('/app/(marketing)/page.tsx', 'home');

      const route = resolveAppRoute('/app', '/', ctx);
      expect(route).not.toBeNull();
      expect(route!.layouts).toEqual(['/app/layout.tsx', '/app/(marketing)/layout.tsx']);
    });

    it('resolves dynamic route inside route group', () => {
      vfs.mkdirSync('/app/(shop)/products/[id]', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'layout');
      vfs.writeFileSync('/app/(shop)/products/[id]/page.tsx', 'product');

      const route = resolveAppRoute('/app', '/products/42', ctx);
      expect(route).not.toBeNull();
      expect(route!.page).toBe('/app/(shop)/products/[id]/page.tsx');
      expect(route!.params).toEqual({ id: '42' });
    });
  });

  describe('convention files', () => {
    it('resolves loading.tsx', () => {
      vfs.mkdirSync('/app', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'layout');
      vfs.writeFileSync('/app/page.tsx', 'page');
      vfs.writeFileSync('/app/loading.tsx', 'loading');

      const route = resolveAppRoute('/app', '/', ctx);
      expect(route).not.toBeNull();
      expect(route!.loading).toBe('/app/loading.tsx');
    });

    it('resolves error.tsx', () => {
      vfs.mkdirSync('/app', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'layout');
      vfs.writeFileSync('/app/page.tsx', 'page');
      vfs.writeFileSync('/app/error.tsx', 'error');

      const route = resolveAppRoute('/app', '/', ctx);
      expect(route).not.toBeNull();
      expect(route!.error).toBe('/app/error.tsx');
    });

    it('resolves not-found.tsx', () => {
      vfs.mkdirSync('/app', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'layout');
      vfs.writeFileSync('/app/page.tsx', 'page');
      vfs.writeFileSync('/app/not-found.tsx', 'not found');

      const route = resolveAppRoute('/app', '/', ctx);
      expect(route).not.toBeNull();
      expect(route!.notFound).toBe('/app/not-found.tsx');
    });

    it('finds nearest loading.tsx walking up', () => {
      vfs.mkdirSync('/app/docs/api', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'layout');
      vfs.writeFileSync('/app/loading.tsx', 'root loading');
      vfs.writeFileSync('/app/docs/api/page.tsx', 'api docs');

      const route = resolveAppRoute('/app', '/docs/api', ctx);
      expect(route).not.toBeNull();
      expect(route!.loading).toBe('/app/loading.tsx');
    });

    it('returns undefined for convention files when none exist', () => {
      vfs.mkdirSync('/app', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'layout');
      vfs.writeFileSync('/app/page.tsx', 'page');

      const route = resolveAppRoute('/app', '/', ctx);
      expect(route).not.toBeNull();
      expect(route!.loading).toBeUndefined();
      expect(route!.error).toBeUndefined();
      expect(route!.notFound).toBeUndefined();
    });
  });

  describe('extension priority', () => {
    it('prefers .jsx over .tsx for pages', () => {
      vfs.mkdirSync('/app', { recursive: true });
      vfs.writeFileSync('/app/layout.tsx', 'layout');
      vfs.writeFileSync('/app/page.jsx', 'jsx page');
      vfs.writeFileSync('/app/page.tsx', 'tsx page');

      const route = resolveAppRoute('/app', '/', ctx);
      expect(route).not.toBeNull();
      expect(route!.page).toBe('/app/page.jsx');
    });
  });
});

// ─── resolveAppRouteHandler ──────────────────────────────────────────────────

describe('resolveAppRouteHandler', () => {
  let vfs: VirtualFS;
  let ctx: RouteResolverContext;

  beforeEach(() => {
    vfs = new VirtualFS();
    ctx = createCtx(vfs);
  });

  it('resolves static route.ts', () => {
    vfs.mkdirSync('/app/api/hello', { recursive: true });
    vfs.writeFileSync('/app/api/hello/route.ts', 'handler');

    expect(resolveAppRouteHandler('/app', '/api/hello', ctx)).toBe('/app/api/hello/route.ts');
  });

  it('resolves route.js', () => {
    vfs.mkdirSync('/app/api/hello', { recursive: true });
    vfs.writeFileSync('/app/api/hello/route.js', 'handler');

    expect(resolveAppRouteHandler('/app', '/api/hello', ctx)).toBe('/app/api/hello/route.js');
  });

  it('resolves root route handler', () => {
    vfs.mkdirSync('/app', { recursive: true });
    vfs.writeFileSync('/app/route.ts', 'handler');

    expect(resolveAppRouteHandler('/app', '/', ctx)).toBe('/app/route.ts');
  });

  it('returns null when no route handler exists', () => {
    vfs.mkdirSync('/app/api/hello', { recursive: true });
    // No route.ts file
    expect(resolveAppRouteHandler('/app', '/api/hello', ctx)).toBeNull();
  });

  it('resolves dynamic route handler', () => {
    vfs.mkdirSync('/app/api/users/[id]', { recursive: true });
    vfs.writeFileSync('/app/api/users/[id]/route.ts', 'handler');

    expect(resolveAppRouteHandler('/app', '/api/users/123', ctx)).toBe('/app/api/users/[id]/route.ts');
  });

  it('resolves route handler inside route group', () => {
    vfs.mkdirSync('/app/(api)/webhook', { recursive: true });
    vfs.writeFileSync('/app/(api)/webhook/route.ts', 'handler');

    expect(resolveAppRouteHandler('/app', '/webhook', ctx)).toBe('/app/(api)/webhook/route.ts');
  });

  it('resolves catch-all route handler', () => {
    vfs.mkdirSync('/app/api/[...path]', { recursive: true });
    vfs.writeFileSync('/app/api/[...path]/route.ts', 'handler');

    expect(resolveAppRouteHandler('/app', '/api/foo/bar', ctx)).toBe('/app/api/[...path]/route.ts');
  });

  it('prefers static over dynamic route handler', () => {
    vfs.mkdirSync('/app/api/users', { recursive: true });
    vfs.mkdirSync('/app/api/[slug]', { recursive: true });
    vfs.writeFileSync('/app/api/users/route.ts', 'static handler');
    vfs.writeFileSync('/app/api/[slug]/route.ts', 'dynamic handler');

    expect(resolveAppRouteHandler('/app', '/api/users', ctx)).toBe('/app/api/users/route.ts');
  });
});

// ─── resolvePageFile (Pages Router) ──────────────────────────────────────────

describe('resolvePageFile', () => {
  let vfs: VirtualFS;
  let ctx: RouteResolverContext;

  beforeEach(() => {
    vfs = new VirtualFS();
    ctx = createCtx(vfs);
  });

  it('resolves root index page', () => {
    vfs.mkdirSync('/pages', { recursive: true });
    vfs.writeFileSync('/pages/index.jsx', 'home');

    expect(resolvePageFile('/pages', '/', ctx)).toBe('/pages/index.jsx');
  });

  it('resolves named page', () => {
    vfs.mkdirSync('/pages', { recursive: true });
    vfs.writeFileSync('/pages/about.jsx', 'about');

    expect(resolvePageFile('/pages', '/about', ctx)).toBe('/pages/about.jsx');
  });

  it('resolves page with .tsx extension', () => {
    vfs.mkdirSync('/pages', { recursive: true });
    vfs.writeFileSync('/pages/about.tsx', 'about');

    expect(resolvePageFile('/pages', '/about', ctx)).toBe('/pages/about.tsx');
  });

  it('resolves nested directory with index file', () => {
    vfs.mkdirSync('/pages/about', { recursive: true });
    vfs.writeFileSync('/pages/about/index.jsx', 'about index');

    expect(resolvePageFile('/pages', '/about', ctx)).toBe('/pages/about/index.jsx');
  });

  it('resolves nested page', () => {
    vfs.mkdirSync('/pages/blog', { recursive: true });
    vfs.writeFileSync('/pages/blog/first-post.jsx', 'post');

    expect(resolvePageFile('/pages', '/blog/first-post', ctx)).toBe('/pages/blog/first-post.jsx');
  });

  it('returns null for non-existent page', () => {
    vfs.mkdirSync('/pages', { recursive: true });
    expect(resolvePageFile('/pages', '/missing', ctx)).toBeNull();
  });

  it('resolves dynamic [id] page file', () => {
    vfs.mkdirSync('/pages/users', { recursive: true });
    vfs.writeFileSync('/pages/users/[id].jsx', 'user');

    expect(resolvePageFile('/pages', '/users/123', ctx)).toBe('/pages/users/[id].jsx');
  });

  it('resolves dynamic [id] directory with index', () => {
    vfs.mkdirSync('/pages/users/[id]', { recursive: true });
    vfs.writeFileSync('/pages/users/[id]/index.jsx', 'user');

    expect(resolvePageFile('/pages', '/users/123', ctx)).toBe('/pages/users/[id]/index.jsx');
  });

  it('resolves catch-all [...slug] page', () => {
    vfs.mkdirSync('/pages/docs', { recursive: true });
    vfs.writeFileSync('/pages/docs/[...slug].jsx', 'docs');

    expect(resolvePageFile('/pages', '/docs/a/b', ctx)).toBe('/pages/docs/[...slug].jsx');
  });

  it('prefers exact match over dynamic', () => {
    vfs.mkdirSync('/pages/users', { recursive: true });
    vfs.writeFileSync('/pages/users/settings.jsx', 'settings');
    vfs.writeFileSync('/pages/users/[id].jsx', 'user');

    expect(resolvePageFile('/pages', '/users/settings', ctx)).toBe('/pages/users/settings.jsx');
  });

  it('prefers .jsx over .tsx', () => {
    vfs.mkdirSync('/pages', { recursive: true });
    vfs.writeFileSync('/pages/about.jsx', 'jsx');
    vfs.writeFileSync('/pages/about.tsx', 'tsx');

    expect(resolvePageFile('/pages', '/about', ctx)).toBe('/pages/about.jsx');
  });
});

// ─── resolveApiFile ──────────────────────────────────────────────────────────

describe('resolveApiFile', () => {
  let vfs: VirtualFS;
  let ctx: RouteResolverContext;

  beforeEach(() => {
    vfs = new VirtualFS();
    ctx = createCtx(vfs);
  });

  it('resolves API route with .js extension', () => {
    vfs.mkdirSync('/pages/api', { recursive: true });
    vfs.writeFileSync('/pages/api/hello.js', 'handler');

    expect(resolveApiFile('/pages', '/api/hello', ctx)).toBe('/pages/api/hello.js');
  });

  it('resolves API route with .ts extension', () => {
    vfs.mkdirSync('/pages/api', { recursive: true });
    vfs.writeFileSync('/pages/api/hello.ts', 'handler');

    expect(resolveApiFile('/pages', '/api/hello', ctx)).toBe('/pages/api/hello.ts');
  });

  it('resolves nested API route', () => {
    vfs.mkdirSync('/pages/api/users', { recursive: true });
    vfs.writeFileSync('/pages/api/users/list.ts', 'handler');

    expect(resolveApiFile('/pages', '/api/users/list', ctx)).toBe('/pages/api/users/list.ts');
  });

  it('resolves API route with index file', () => {
    vfs.mkdirSync('/pages/api/auth', { recursive: true });
    vfs.writeFileSync('/pages/api/auth/index.ts', 'handler');

    expect(resolveApiFile('/pages', '/api/auth', ctx)).toBe('/pages/api/auth/index.ts');
  });

  it('returns null for missing API route', () => {
    vfs.mkdirSync('/pages/api', { recursive: true });
    expect(resolveApiFile('/pages', '/api/missing', ctx)).toBeNull();
  });

  it('prefers .js over .ts', () => {
    vfs.mkdirSync('/pages/api', { recursive: true });
    vfs.writeFileSync('/pages/api/hello.js', 'js handler');
    vfs.writeFileSync('/pages/api/hello.ts', 'ts handler');

    expect(resolveApiFile('/pages', '/api/hello', ctx)).toBe('/pages/api/hello.js');
  });
});

// ─── resolveFileWithExtension ────────────────────────────────────────────────

describe('resolveFileWithExtension', () => {
  let vfs: VirtualFS;
  let ctx: RouteResolverContext;

  beforeEach(() => {
    vfs = new VirtualFS();
    ctx = createCtx(vfs);
  });

  it('returns file with existing extension', () => {
    vfs.mkdirSync('/components', { recursive: true });
    vfs.writeFileSync('/components/Button.tsx', 'component');

    expect(resolveFileWithExtension('/components/Button.tsx', ctx)).toBe('/components/Button.tsx');
  });

  it('adds .tsx extension', () => {
    vfs.mkdirSync('/components', { recursive: true });
    vfs.writeFileSync('/components/Button.tsx', 'component');

    expect(resolveFileWithExtension('/components/Button', ctx)).toBe('/components/Button.tsx');
  });

  it('adds .ts extension', () => {
    vfs.mkdirSync('/utils', { recursive: true });
    vfs.writeFileSync('/utils/helpers.ts', 'helpers');

    expect(resolveFileWithExtension('/utils/helpers', ctx)).toBe('/utils/helpers.ts');
  });

  it('resolves index file in directory', () => {
    vfs.mkdirSync('/components/ui', { recursive: true });
    vfs.writeFileSync('/components/ui/index.tsx', 'barrel');

    expect(resolveFileWithExtension('/components/ui', ctx)).toBe('/components/ui/index.tsx');
  });

  it('prefers .tsx over .ts', () => {
    vfs.mkdirSync('/lib', { recursive: true });
    vfs.writeFileSync('/lib/utils.tsx', 'tsx');
    vfs.writeFileSync('/lib/utils.ts', 'ts');

    expect(resolveFileWithExtension('/lib/utils', ctx)).toBe('/lib/utils.tsx');
  });

  it('returns null for non-existent file', () => {
    expect(resolveFileWithExtension('/missing/file', ctx)).toBeNull();
  });

  it('returns null for non-existent file with extension', () => {
    expect(resolveFileWithExtension('/missing/file.tsx', ctx)).toBeNull();
  });
});

// ─── needsTransform ──────────────────────────────────────────────────────────

describe('needsTransform', () => {
  it('returns true for .jsx', () => {
    expect(needsTransform('/app/page.jsx')).toBe(true);
  });

  it('returns true for .tsx', () => {
    expect(needsTransform('/app/page.tsx')).toBe(true);
  });

  it('returns true for .ts', () => {
    expect(needsTransform('/lib/utils.ts')).toBe(true);
  });

  it('returns false for .js', () => {
    expect(needsTransform('/lib/utils.js')).toBe(false);
  });

  it('returns false for .css', () => {
    expect(needsTransform('/styles/main.css')).toBe(false);
  });

  it('returns false for .json', () => {
    expect(needsTransform('/data.json')).toBe(false);
  });
});
