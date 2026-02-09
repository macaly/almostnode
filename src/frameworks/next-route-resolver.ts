/**
 * Next.js route resolution
 * Standalone functions extracted from NextDevServer for resolving
 * App Router routes, Pages Router routes, API routes, and file extensions.
 */

import { type AppRoute } from './next-html-generator';

/** Context needed by route resolution functions */
export interface RouteResolverContext {
  exists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  readdir: (path: string) => string[];
}

const PAGE_EXTENSIONS = ['.jsx', '.tsx', '.js', '.ts'];
const API_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx'];

/**
 * Check if App Router is available
 * Returns true if the app directory has a page file (directly or in route groups) or a layout file
 */
export function hasAppRouter(appDir: string, ctx: RouteResolverContext): boolean {
  try {
    if (!ctx.exists(appDir)) return false;

    // Check for root page directly
    for (const ext of PAGE_EXTENSIONS) {
      if (ctx.exists(`${appDir}/page${ext}`)) return true;
    }

    // Check for root page inside route groups (e.g., /app/(main)/page.tsx)
    try {
      const entries = ctx.readdir(appDir);
      for (const entry of entries) {
        if (/^\([^)]+\)$/.test(entry) && ctx.isDirectory(`${appDir}/${entry}`)) {
          for (const ext of PAGE_EXTENSIONS) {
            if (ctx.exists(`${appDir}/${entry}/page${ext}`)) return true;
          }
        }
      }
    } catch { /* ignore */ }

    // Also check for any layout.tsx which indicates App Router usage
    for (const ext of PAGE_EXTENSIONS) {
      if (ctx.exists(`${appDir}/layout${ext}`)) return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Resolve App Router route to page and layout files
 */
export function resolveAppRoute(
  appDir: string,
  pathname: string,
  ctx: RouteResolverContext
): AppRoute | null {
  const segments = pathname === '/' ? [] : pathname.split('/').filter(Boolean);
  return resolveAppDynamicRoute(appDir, segments, ctx);
}

/**
 * Resolve App Router routes including static, dynamic, and route groups.
 * Route groups are folders wrapped in parentheses like (marketing) that
 * don't affect the URL path but can have their own layouts.
 */
function resolveAppDynamicRoute(
  appDir: string,
  segments: string[],
  ctx: RouteResolverContext
): AppRoute | null {
  /**
   * Collect layout from a directory if it exists
   */
  const collectLayout = (dirPath: string, layouts: string[]): string[] => {
    for (const ext of PAGE_EXTENSIONS) {
      const layoutPath = `${dirPath}/layout${ext}`;
      if (ctx.exists(layoutPath) && !layouts.includes(layoutPath)) {
        return [...layouts, layoutPath];
      }
    }
    return layouts;
  };

  /**
   * Find page file in a directory
   */
  const findPage = (dirPath: string): string | null => {
    for (const ext of PAGE_EXTENSIONS) {
      const pagePath = `${dirPath}/page${ext}`;
      if (ctx.exists(pagePath)) {
        return pagePath;
      }
    }
    return null;
  };

  /**
   * Find a UI convention file (loading, error, not-found) in a directory
   */
  const findConventionFile = (dirPath: string, name: string): string | null => {
    for (const ext of PAGE_EXTENSIONS) {
      const filePath = `${dirPath}/${name}${ext}`;
      if (ctx.exists(filePath)) {
        return filePath;
      }
    }
    return null;
  };

  /**
   * Find the nearest convention file by walking up from the page directory
   */
  const findNearestConventionFile = (dirPath: string, name: string): string | null => {
    let current = dirPath;
    while (current.startsWith(appDir)) {
      const file = findConventionFile(current, name);
      if (file) return file;
      // Move up one directory
      const parent = current.replace(/\/[^/]+$/, '');
      if (parent === current) break;
      current = parent;
    }
    return null;
  };

  /**
   * Get route group directories (folders matching (name) pattern)
   */
  const getRouteGroups = (dirPath: string): string[] => {
    try {
      const entries = ctx.readdir(dirPath);
      return entries.filter(e => /^\([^)]+\)$/.test(e) && ctx.isDirectory(`${dirPath}/${e}`));
    } catch {
      return [];
    }
  };

  const tryPath = (
    dirPath: string,
    remainingSegments: string[],
    layouts: string[],
    params: Record<string, string | string[]>
  ): AppRoute | null => {
    // Check for layout at current level
    layouts = collectLayout(dirPath, layouts);

    if (remainingSegments.length === 0) {
      // Look for page file directly
      const page = findPage(dirPath);
      if (page) {
        return {
          page, layouts, params,
          loading: findNearestConventionFile(dirPath, 'loading') || undefined,
          error: findNearestConventionFile(dirPath, 'error') || undefined,
          notFound: findNearestConventionFile(dirPath, 'not-found') || undefined,
        };
      }

      // Look for page inside route groups at this level
      // e.g., /app/(marketing)/page.tsx resolves to /
      const groups = getRouteGroups(dirPath);
      for (const group of groups) {
        const groupPath = `${dirPath}/${group}`;
        const groupLayouts = collectLayout(groupPath, layouts);
        const page = findPage(groupPath);
        if (page) {
          return {
            page, layouts: groupLayouts, params,
            loading: findNearestConventionFile(groupPath, 'loading') || undefined,
            error: findNearestConventionFile(groupPath, 'error') || undefined,
            notFound: findNearestConventionFile(groupPath, 'not-found') || undefined,
          };
        }
      }

      return null;
    }

    const [current, ...rest] = remainingSegments;

    // Try exact match first
    const exactPath = `${dirPath}/${current}`;
    if (ctx.isDirectory(exactPath)) {
      const result = tryPath(exactPath, rest, layouts, params);
      if (result) return result;
    }

    // Try inside route groups - route groups are transparent in URL
    // e.g., /about might match /app/(marketing)/about/page.tsx
    const groups = getRouteGroups(dirPath);
    for (const group of groups) {
      const groupPath = `${dirPath}/${group}`;
      const groupLayouts = collectLayout(groupPath, layouts);

      // Try exact match inside group
      const groupExactPath = `${groupPath}/${current}`;
      if (ctx.isDirectory(groupExactPath)) {
        const result = tryPath(groupExactPath, rest, groupLayouts, params);
        if (result) return result;
      }

      // Try dynamic segments inside group
      try {
        const groupEntries = ctx.readdir(groupPath);
        for (const entry of groupEntries) {
          if (entry.startsWith('[...') && entry.endsWith(']')) {
            const dynamicPath = `${groupPath}/${entry}`;
            if (ctx.isDirectory(dynamicPath)) {
              const paramName = entry.slice(4, -1);
              const newParams = { ...params, [paramName]: [current, ...rest] };
              const result = tryPath(dynamicPath, [], groupLayouts, newParams);
              if (result) return result;
            }
          } else if (entry.startsWith('[[...') && entry.endsWith(']]')) {
            const dynamicPath = `${groupPath}/${entry}`;
            if (ctx.isDirectory(dynamicPath)) {
              const paramName = entry.slice(5, -2);
              const newParams = { ...params, [paramName]: [current, ...rest] };
              const result = tryPath(dynamicPath, [], groupLayouts, newParams);
              if (result) return result;
            }
          } else if (entry.startsWith('[') && entry.endsWith(']') && !entry.includes('.')) {
            const dynamicPath = `${groupPath}/${entry}`;
            if (ctx.isDirectory(dynamicPath)) {
              const paramName = entry.slice(1, -1);
              const newParams = { ...params, [paramName]: current };
              const result = tryPath(dynamicPath, rest, groupLayouts, newParams);
              if (result) return result;
            }
          }
        }
      } catch {
        // Group directory read failed
      }
    }

    // Try dynamic segments at current level
    try {
      const entries = ctx.readdir(dirPath);
      for (const entry of entries) {
        // Handle catch-all routes [...slug]
        if (entry.startsWith('[...') && entry.endsWith(']')) {
          const dynamicPath = `${dirPath}/${entry}`;
          if (ctx.isDirectory(dynamicPath)) {
            const paramName = entry.slice(4, -1);
            const newParams = { ...params, [paramName]: [current, ...rest] };
            const result = tryPath(dynamicPath, [], layouts, newParams);
            if (result) return result;
          }
        }
        // Handle optional catch-all routes [[...slug]]
        else if (entry.startsWith('[[...') && entry.endsWith(']]')) {
          const dynamicPath = `${dirPath}/${entry}`;
          if (ctx.isDirectory(dynamicPath)) {
            const paramName = entry.slice(5, -2);
            const newParams = { ...params, [paramName]: [current, ...rest] };
            const result = tryPath(dynamicPath, [], layouts, newParams);
            if (result) return result;
          }
        }
        // Handle single dynamic segment [param]
        else if (entry.startsWith('[') && entry.endsWith(']') && !entry.includes('.')) {
          const dynamicPath = `${dirPath}/${entry}`;
          if (ctx.isDirectory(dynamicPath)) {
            const paramName = entry.slice(1, -1);
            const newParams = { ...params, [paramName]: current };
            const result = tryPath(dynamicPath, rest, layouts, newParams);
            if (result) return result;
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return null;
  };

  // Collect root layout
  const layouts: string[] = [];
  for (const ext of PAGE_EXTENSIONS) {
    const rootLayout = `${appDir}/layout${ext}`;
    if (ctx.exists(rootLayout)) {
      layouts.push(rootLayout);
      break;
    }
  }

  return tryPath(appDir, segments, layouts, {});
}

/**
 * Resolve an App Router route handler (route.ts/route.js)
 * Returns the file path if found, null otherwise
 */
export function resolveAppRouteHandler(
  appDir: string,
  pathname: string,
  ctx: RouteResolverContext
): string | null {
  const extensions = API_EXTENSIONS;

  // Build the directory path in the app dir
  const segments = pathname === '/' ? [] : pathname.split('/').filter(Boolean);
  let dirPath = appDir;

  for (const segment of segments) {
    dirPath = `${dirPath}/${segment}`;
  }

  // Check for route file
  for (const ext of extensions) {
    const routePath = `${dirPath}/route${ext}`;
    if (ctx.exists(routePath)) {
      return routePath;
    }
  }

  // Try dynamic route resolution with route groups
  return resolveAppRouteHandlerDynamic(appDir, segments, ctx);
}

/**
 * Resolve dynamic App Router route handlers with route group support
 */
function resolveAppRouteHandlerDynamic(
  appDir: string,
  segments: string[],
  ctx: RouteResolverContext
): string | null {
  const extensions = API_EXTENSIONS;

  const tryPath = (dirPath: string, remainingSegments: string[]): string | null => {
    if (remainingSegments.length === 0) {
      for (const ext of extensions) {
        const routePath = `${dirPath}/route${ext}`;
        if (ctx.exists(routePath)) {
          return routePath;
        }
      }

      // Check route groups
      try {
        const entries = ctx.readdir(dirPath);
        for (const entry of entries) {
          if (/^\([^)]+\)$/.test(entry) && ctx.isDirectory(`${dirPath}/${entry}`)) {
            for (const ext of extensions) {
              const routePath = `${dirPath}/${entry}/route${ext}`;
              if (ctx.exists(routePath)) {
                return routePath;
              }
            }
          }
        }
      } catch { /* ignore */ }

      return null;
    }

    const [current, ...rest] = remainingSegments;

    // Try exact match
    const exactPath = `${dirPath}/${current}`;
    if (ctx.isDirectory(exactPath)) {
      const result = tryPath(exactPath, rest);
      if (result) return result;
    }

    // Try route groups and dynamic segments
    try {
      const entries = ctx.readdir(dirPath);
      for (const entry of entries) {
        // Route groups
        if (/^\([^)]+\)$/.test(entry) && ctx.isDirectory(`${dirPath}/${entry}`)) {
          const groupExact = `${dirPath}/${entry}/${current}`;
          if (ctx.isDirectory(groupExact)) {
            const result = tryPath(groupExact, rest);
            if (result) return result;
          }
        }
        // Dynamic segments
        if (entry.startsWith('[') && entry.endsWith(']') && !entry.includes('.')) {
          const dynamicPath = `${dirPath}/${entry}`;
          if (ctx.isDirectory(dynamicPath)) {
            const result = tryPath(dynamicPath, rest);
            if (result) return result;
          }
        }
        // Catch-all
        if (entry.startsWith('[...') && entry.endsWith(']')) {
          const dynamicPath = `${dirPath}/${entry}`;
          if (ctx.isDirectory(dynamicPath)) {
            const result = tryPath(dynamicPath, []);
            if (result) return result;
          }
        }
      }
    } catch { /* ignore */ }

    return null;
  };

  return tryPath(appDir, segments);
}

/**
 * Resolve URL pathname to page file (Pages Router)
 */
export function resolvePageFile(
  pagesDir: string,
  pathname: string,
  ctx: RouteResolverContext
): string | null {
  // Handle root path
  if (pathname === '/') {
    pathname = '/index';
  }

  // Try exact match: /about → /pages/about.jsx
  for (const ext of PAGE_EXTENSIONS) {
    const filePath = `${pagesDir}${pathname}${ext}`;
    if (ctx.exists(filePath)) {
      return filePath;
    }
  }

  // Try index file: /about → /pages/about/index.jsx
  for (const ext of PAGE_EXTENSIONS) {
    const filePath = `${pagesDir}${pathname}/index${ext}`;
    if (ctx.exists(filePath)) {
      return filePath;
    }
  }

  // Try dynamic route matching
  return resolveDynamicRoute(pagesDir, pathname, ctx);
}

/**
 * Resolve dynamic routes like /users/[id] (Pages Router)
 */
function resolveDynamicRoute(
  pagesDir: string,
  pathname: string,
  ctx: RouteResolverContext
): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const tryPath = (dirPath: string, remainingSegments: string[]): string | null => {
    if (remainingSegments.length === 0) {
      // Try index file
      for (const ext of PAGE_EXTENSIONS) {
        const indexPath = `${dirPath}/index${ext}`;
        if (ctx.exists(indexPath)) {
          return indexPath;
        }
      }
      return null;
    }

    const [current, ...rest] = remainingSegments;

    // Try exact match first
    const exactPath = `${dirPath}/${current}`;

    // Check if it's a file
    for (const ext of PAGE_EXTENSIONS) {
      if (rest.length === 0 && ctx.exists(exactPath + ext)) {
        return exactPath + ext;
      }
    }

    // Check if it's a directory
    if (ctx.isDirectory(exactPath)) {
      const exactResult = tryPath(exactPath, rest);
      if (exactResult) return exactResult;
    }

    // Try dynamic segment [param]
    try {
      const entries = ctx.readdir(dirPath);
      for (const entry of entries) {
        // Check for dynamic file like [id].jsx
        for (const ext of PAGE_EXTENSIONS) {
          const dynamicFilePattern = /^\[([^\]]+)\]$/;
          const nameWithoutExt = entry.replace(ext, '');
          if (entry.endsWith(ext) && dynamicFilePattern.test(nameWithoutExt)) {
            // It's a dynamic file like [id].jsx
            if (rest.length === 0) {
              const filePath = `${dirPath}/${entry}`;
              if (ctx.exists(filePath)) {
                return filePath;
              }
            }
          }
        }

        // Check for dynamic directory like [id]
        if (entry.startsWith('[') && entry.endsWith(']') && !entry.includes('.')) {
          const dynamicPath = `${dirPath}/${entry}`;
          if (ctx.isDirectory(dynamicPath)) {
            const dynamicResult = tryPath(dynamicPath, rest);
            if (dynamicResult) return dynamicResult;
          }
        }

        // Check for catch-all [...param].jsx
        for (const ext of PAGE_EXTENSIONS) {
          if (entry.startsWith('[...') && entry.endsWith(']' + ext)) {
            const filePath = `${dirPath}/${entry}`;
            if (ctx.exists(filePath)) {
              return filePath;
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return null;
  };

  return tryPath(pagesDir, segments);
}

/**
 * Resolve API route to file path (Pages Router)
 */
export function resolveApiFile(
  pagesDir: string,
  pathname: string,
  ctx: RouteResolverContext
): string | null {
  // Remove /api prefix and look in /pages/api
  const apiPath = pathname.replace(/^\/api/, `${pagesDir}/api`);

  for (const ext of API_EXTENSIONS) {
    const filePath = apiPath + ext;
    if (ctx.exists(filePath)) {
      return filePath;
    }
  }

  // Try index file
  for (const ext of API_EXTENSIONS) {
    const filePath = `${apiPath}/index${ext}`;
    if (ctx.exists(filePath)) {
      return filePath;
    }
  }

  return null;
}

/**
 * Try to resolve a file path by adding common extensions
 * e.g., /components/faq -> /components/faq.tsx
 * Also handles index files in directories
 */
export function resolveFileWithExtension(
  pathname: string,
  ctx: RouteResolverContext
): string | null {
  // If the file already has an extension and exists, return it
  if (/\.\w+$/.test(pathname) && ctx.exists(pathname)) {
    return pathname;
  }

  // Common extensions to try, in order of preference
  const extensions = ['.tsx', '.ts', '.jsx', '.js'];

  // Try adding extensions directly
  for (const ext of extensions) {
    const withExt = pathname + ext;
    if (ctx.exists(withExt)) {
      return withExt;
    }
  }

  // Try as a directory with index file
  for (const ext of extensions) {
    const indexPath = pathname + '/index' + ext;
    if (ctx.exists(indexPath)) {
      return indexPath;
    }
  }

  return null;
}

/**
 * Check if a file needs transformation (JSX/TSX/TS)
 */
export function needsTransform(path: string): boolean {
  return /\.(jsx|tsx|ts)$/.test(path);
}
