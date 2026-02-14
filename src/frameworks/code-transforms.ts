/**
 * Shared code transformation utilities.
 * Extracted from next-dev-server.ts and vite-dev-server.ts to avoid duplication
 * and enable AST-based replacements.
 */

import * as acorn from 'acorn';
import * as csstree from 'css-tree';
import { simpleHash } from '../utils/hash';
import { REACT_CDN, REACT_DOM_CDN } from '../config/cdn';

/**
 * Interface for file system operations needed by CSS module transforms.
 */
export interface CssModuleContext {
  readFile: (path: string) => string;
  exists: (path: string) => boolean;
}

/**
 * Resolve a relative path from a directory.
 * Pure function — no dependencies.
 */
export function resolveRelativePath(dir: string, relativePath: string): string {
  const parts = dir.split('/').filter(Boolean);
  const relParts = relativePath.split('/');

  for (const part of relParts) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '.' && part !== '') {
      parts.push(part);
    }
  }

  return '/' + parts.join('/');
}

/**
 * Resolve a CSS module path relative to the current file context.
 */
export function resolveCssModulePath(
  cssPath: string,
  currentFile: string | undefined,
  ctx: CssModuleContext,
): string | null {
  // If relative path and we have a current file, resolve relative to it
  if (currentFile && (cssPath.startsWith('./') || cssPath.startsWith('../'))) {
    const dir = currentFile.replace(/\/[^/]+$/, '');
    const resolved = resolveRelativePath(dir, cssPath);
    if (ctx.exists(resolved)) return resolved;
  }

  // Try the path as-is first (absolute)
  if (ctx.exists(cssPath)) return cssPath;

  // Try with leading slash
  const withSlash = '/' + cssPath.replace(/^\.\//, '');
  if (ctx.exists(withSlash)) return withSlash;

  return null;
}

/**
 * Generate replacement code for a CSS Module import.
 * Parses the CSS file, extracts class names, generates scoped names,
 * and injects the scoped CSS via a style tag.
 */
export function generateCssModuleReplacement(
  varName: string,
  cssPath: string,
  currentFile: string | undefined,
  ctx: CssModuleContext,
): string {
  try {
    const resolvedPath = resolveCssModulePath(cssPath, currentFile, ctx);
    if (!resolvedPath) {
      return `const ${varName} = {};`;
    }

    const cssContent = ctx.readFile(resolvedPath);
    const fileHash = simpleHash(resolvedPath + cssContent).slice(0, 6);

    // Parse CSS into AST and extract class names
    const classMap: Record<string, string> = {};
    const ast = csstree.parse(cssContent);

    // First pass: collect all class selector names
    csstree.walk(ast, {
      visit: 'ClassSelector',
      enter(node: csstree.ClassSelector) {
        if (!classMap[node.name]) {
          classMap[node.name] = `${node.name}_${fileHash}`;
        }
      },
    });

    // Second pass: mutate class selectors to scoped names
    csstree.walk(ast, {
      visit: 'ClassSelector',
      enter(node: csstree.ClassSelector) {
        if (classMap[node.name]) {
          node.name = classMap[node.name];
        }
      },
    });

    // Generate scoped CSS from the mutated AST
    const scopedCss = csstree.generate(ast);

    // Escape the CSS for embedding in JS
    const escapedCss = scopedCss
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');

    // Generate inline code that injects styles and exports class map
    const mapEntries = Object.entries(classMap)
      .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(', ');

    return `const ${varName} = {${mapEntries}};
(function() {
  if (typeof document !== 'undefined') {
    var id = ${JSON.stringify('cssmod-' + fileHash)};
    if (!document.getElementById(id)) {
      var s = document.createElement('style');
      s.id = id;
      s.textContent = \`${escapedCss}\`;
      document.head.appendChild(s);
    }
  }
})();`;
  } catch {
    return `const ${varName} = {};`;
  }
}

/**
 * Strip CSS imports from code (they are loaded via <link> tags instead).
 * CSS Module imports (*.module.css) are converted to inline objects with class name mappings.
 * Regular CSS imports are stripped entirely.
 */
export function stripCssImports(
  code: string,
  currentFile: string | undefined,
  ctx: CssModuleContext,
): string {
  // First handle CSS Module imports: import styles from './Component.module.css'
  code = code.replace(
    /import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.css)['"]\s*;?/g,
    (_match, varName, cssPath) => {
      return generateCssModuleReplacement(varName, cssPath, currentFile, ctx);
    },
  );

  // Handle destructured CSS Module imports: import { foo, bar } from './Component.module.css'
  code = code.replace(
    /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+\.module\.css)['"]\s*;?/g,
    (_match, names, cssPath) => {
      const varName = '__cssModule_' + simpleHash(cssPath);
      const replacement = generateCssModuleReplacement(varName, cssPath, currentFile, ctx);
      const namedExports = (names as string).split(',').map((n: string) => {
        const trimmed = n.trim();
        const parts = trimmed.split(/\s+as\s+/);
        const key = parts[0].trim();
        const alias = parts[1]?.trim() || key;
        return `const ${alias} = ${varName}[${JSON.stringify(key)}];`;
      }).join('\n');
      return `${replacement}\n${namedExports}`;
    },
  );

  // Strip remaining plain CSS imports (non-module)
  return code.replace(/import\s+['"][^'"]+\.css['"]\s*;?/g, '');
}

// Explicit mappings for common packages (ensures correct esm.sh URLs)
const EXPLICIT_MAPPINGS: Record<string, string> = {
  'react': `${REACT_CDN}?dev`,
  'react/jsx-runtime': `${REACT_CDN}&dev/jsx-runtime`,
  'react/jsx-dev-runtime': `${REACT_CDN}&dev/jsx-dev-runtime`,
  'react-dom': `${REACT_DOM_CDN}?dev`,
  'react-dom/client': `${REACT_DOM_CDN}/client?dev`,
};

// Packages that are local, have custom shims, or are handled by the HTML import map.
// These are NOT redirected to esm.sh by redirectNpmImports.
const LOCAL_PACKAGES = new Set([
  'next/link', 'next/router', 'next/head', 'next/navigation',
  'next/dynamic', 'next/image', 'next/script', 'next/font/google',
  'next/font/local',
]);

/**
 * Extract the major version from a semver range string.
 * e.g., "^4.0.0" → "4", "~1.2.3" → "1", ">=2.0.0" → "2", "3.1.0" → "3"
 */
function extractMajorVersion(range: string): string | null {
  const match = range.match(/(\d+)\.\d+/);
  return match ? match[1] : null;
}

/** Check if a package specifier is a bare npm import that should be redirected. */
function resolveNpmPackage(
  packageName: string,
  extraLocalPackages?: Set<string>,
  dependencies?: Record<string, string>,
  esmShDeps?: string,
  installedPackages?: Set<string>,
): string | null {
  // Skip relative, absolute, URL, and virtual paths
  if (packageName.startsWith('.') || packageName.startsWith('/') ||
      packageName.startsWith('http://') || packageName.startsWith('https://') ||
      packageName.startsWith('/__virtual__')) {
    return null;
  }

  if (EXPLICIT_MAPPINGS[packageName]) return EXPLICIT_MAPPINGS[packageName];
  if (LOCAL_PACKAGES.has(packageName)) return null;
  if (extraLocalPackages?.has(packageName)) return null;

  // Extract the base package name (handles scoped packages and subpath imports)
  const basePkg = packageName.includes('/') ? packageName.split('/')[0] : packageName;
  const isScoped = basePkg.startsWith('@');
  const scopedBasePkg = isScoped && packageName.includes('/')
    ? packageName.split('/').slice(0, 2).join('/')
    : basePkg;

  if (LOCAL_PACKAGES.has(scopedBasePkg)) return null;
  if (extraLocalPackages?.has(scopedBasePkg)) return null;

  // Serve from VFS bundle if package is installed locally
  if (installedPackages?.has(scopedBasePkg)) {
    return `/_npm/${packageName}`;
  }

  // Build versioned esm.sh URL. Include major version from package.json
  // dependencies when available — esm.sh requires this for subpath exports.
  let esmPkg = packageName;
  if (dependencies) {
    const depVersion = dependencies[scopedBasePkg];
    if (depVersion) {
      const major = extractMajorVersion(depVersion);
      if (major) {
        // Insert @version after the base package name
        const subpath = packageName.slice(scopedBasePkg.length); // e.g., "/react"
        esmPkg = `${scopedBasePkg}@${major}${subpath}`;
      }
    }
  }

  const depsParam = esmShDeps ? `&deps=${esmShDeps}` : '';
  return `https://esm.sh/${esmPkg}?external=react${depsParam}`;
}

/**
 * Redirect bare npm package imports to esm.sh CDN.
 * Uses acorn AST to precisely target import/export source strings,
 * avoiding false matches inside comments or string literals.
 * Falls back to regex if acorn fails.
 *
 * @param additionalLocalPackages - Extra packages to skip (not redirected to CDN).
 *   Used by frameworks that add their own import map entries (e.g., Convex demo).
 * @param dependencies - Dependency versions from package.json (e.g., {"ai": "^4.0.0"}).
 *   Used to include major version in esm.sh URLs for correct subpath resolution.
 * @param installedPackages - Packages installed in VFS node_modules. These are
 *   served from /_npm/ instead of esm.sh, giving us full control over resolution.
 */
export function redirectNpmImports(
  code: string,
  additionalLocalPackages?: string[],
  dependencies?: Record<string, string>,
  esmShDeps?: string,
  installedPackages?: Set<string>,
): string {
  const extraSet = additionalLocalPackages?.length ? new Set(additionalLocalPackages) : undefined;
  try {
    return redirectNpmImportsAst(code, extraSet, dependencies, esmShDeps, installedPackages);
  } catch {
    return redirectNpmImportsRegex(code, extraSet, dependencies, esmShDeps, installedPackages);
  }
}

function redirectNpmImportsAst(
  code: string,
  extraLocalPackages?: Set<string>,
  dependencies?: Record<string, string>,
  esmShDeps?: string,
  installedPackages?: Set<string>,
): string {
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });

  // Collect source nodes that need redirecting: [start, end, newUrl]
  const replacements: Array<[number, number, string]> = [];

  function processSource(sourceNode: any) {
    if (!sourceNode || sourceNode.type !== 'Literal') return;
    const resolved = resolveNpmPackage(sourceNode.value, extraLocalPackages, dependencies, esmShDeps, installedPackages);
    if (resolved) {
      // Replace the string literal (including quotes) — sourceNode.start/end include quotes
      replacements.push([sourceNode.start, sourceNode.end, JSON.stringify(resolved)]);
    }
  }

  for (const node of (ast as any).body) {
    if (node.type === 'ImportDeclaration') {
      processSource(node.source);
    } else if (node.type === 'ExportNamedDeclaration' && node.source) {
      processSource(node.source);
    } else if (node.type === 'ExportAllDeclaration') {
      processSource(node.source);
    }
  }

  if (replacements.length === 0) return code;

  // Apply replacements from end to start
  let result = code;
  replacements.sort((a, b) => b[0] - a[0]);
  for (const [start, end, replacement] of replacements) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }

  return result;
}

function redirectNpmImportsRegex(
  code: string,
  extraLocalPackages?: Set<string>,
  dependencies?: Record<string, string>,
  esmShDeps?: string,
  installedPackages?: Set<string>,
): string {
  const importPattern = /(from\s*['"])([^'"./][^'"]*?)(['"])/g;
  return code.replace(importPattern, (match, prefix, packageName, suffix) => {
    const resolved = resolveNpmPackage(packageName, extraLocalPackages, dependencies, esmShDeps, installedPackages);
    if (!resolved) return match;
    return `${prefix}${resolved}${suffix}`;
  });
}

/**
 * ESM to CJS transform using acorn AST parsing.
 * Used in non-browser (test) environments where esbuild is unavailable.
 * Falls back to regex if acorn fails to parse.
 */
export function transformEsmToCjsSimple(code: string): string {
  try {
    return transformEsmToCjsAst(code);
  } catch {
    return transformEsmToCjsRegex(code);
  }
}

/** AST-based ESM→CJS transform using acorn. */
function transformEsmToCjsAst(code: string): string {
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });

  // Collect replacements as [start, end, replacement] sorted by start descending
  const replacements: Array<[number, number, string]> = [];

  for (const node of (ast as any).body) {
    if (node.type === 'ImportDeclaration') {
      const source = node.source.value;
      const specs = node.specifiers;

      if (specs.length === 0) {
        // Side-effect import: import './polyfill'
        replacements.push([node.start, node.end, `require(${JSON.stringify(source)})`]);
      } else {
        const defaultSpec = specs.find((s: any) => s.type === 'ImportDefaultSpecifier');
        const nsSpec = specs.find((s: any) => s.type === 'ImportNamespaceSpecifier');
        const namedSpecs = specs.filter((s: any) => s.type === 'ImportSpecifier');

        const parts: string[] = [];
        if (defaultSpec) {
          parts.push(`const ${defaultSpec.local.name} = require(${JSON.stringify(source)})`);
        }
        if (nsSpec) {
          parts.push(`const ${nsSpec.local.name} = require(${JSON.stringify(source)})`);
        }
        if (namedSpecs.length > 0) {
          const bindings = namedSpecs.map((s: any) => {
            if (s.imported.name === s.local.name) return s.local.name;
            return `${s.imported.name}: ${s.local.name}`;
          }).join(', ');
          if (defaultSpec) {
            // Mixed: import React, { useState } from 'react'
            // Default already handled, just destructure from same require
            parts.push(`const { ${bindings} } = require(${JSON.stringify(source)})`);
          } else {
            parts.push(`const { ${bindings} } = require(${JSON.stringify(source)})`);
          }
        }
        replacements.push([node.start, node.end, parts.join(';\n')]);
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      const decl = node.declaration;
      if (decl.type === 'FunctionDeclaration') {
        // export default function X() {} → module.exports = function X() {}
        const funcCode = code.slice(decl.start, node.end);
        replacements.push([node.start, node.end, `module.exports = ${funcCode}`]);
      } else if (decl.type === 'ClassDeclaration') {
        const classCode = code.slice(decl.start, node.end);
        replacements.push([node.start, node.end, `module.exports = ${classCode}`]);
      } else {
        // export default <expression>
        const exprCode = code.slice(decl.start, node.end);
        replacements.push([node.start, node.end, `module.exports = ${exprCode}`]);
      }
    } else if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        const decl = node.declaration;
        if (decl.type === 'FunctionDeclaration') {
          const name = decl.id.name;
          const funcCode = code.slice(decl.start, node.end);
          replacements.push([node.start, node.end, `exports.${name} = ${funcCode}`]);
        } else if (decl.type === 'ClassDeclaration') {
          const name = decl.id.name;
          const classCode = code.slice(decl.start, node.end);
          replacements.push([node.start, node.end, `exports.${name} = ${classCode}`]);
        } else if (decl.type === 'VariableDeclaration') {
          // export const X = ..., export let Y = ...
          const parts: string[] = [];
          for (const declarator of decl.declarations) {
            const name = declarator.id.name;
            const initCode = declarator.init ? code.slice(declarator.init.start, declarator.init.end) : 'undefined';
            parts.push(`exports.${name} = ${initCode}`);
          }
          replacements.push([node.start, node.end, parts.join(';\n')]);
        }
      } else if (node.source) {
        // Re-export: export { X } from './module'
        const source = node.source.value;
        const parts: string[] = [];
        const tmpVar = `__reexport_${node.start}`;
        parts.push(`const ${tmpVar} = require(${JSON.stringify(source)})`);
        for (const spec of node.specifiers) {
          parts.push(`exports.${spec.exported.name} = ${tmpVar}.${spec.local.name}`);
        }
        replacements.push([node.start, node.end, parts.join(';\n')]);
      } else {
        // Local re-export: export { foo, bar }
        const parts: string[] = [];
        for (const spec of node.specifiers) {
          parts.push(`exports.${spec.exported.name} = ${spec.local.name}`);
        }
        replacements.push([node.start, node.end, parts.join(';\n')]);
      }
    } else if (node.type === 'ExportAllDeclaration') {
      // export * from './helpers'
      const source = node.source.value;
      replacements.push([node.start, node.end, `Object.assign(exports, require(${JSON.stringify(source)}))`]);
    }
  }

  // Apply replacements from end to start to preserve positions
  let result = code;
  replacements.sort((a, b) => b[0] - a[0]);
  for (const [start, end, replacement] of replacements) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }

  return result;
}

/** Regex-based ESM→CJS fallback for code acorn can't parse. */
function transformEsmToCjsRegex(code: string): string {
  let transformed = code;

  transformed = transformed.replace(
    /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
    'const $1 = require("$2")',
  );
  transformed = transformed.replace(
    /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g,
    'const {$1} = require("$2")',
  );
  transformed = transformed.replace(
    /export\s+default\s+function\s+(\w+)/g,
    'module.exports = function $1',
  );
  transformed = transformed.replace(
    /export\s+default\s+function\s*\(/g,
    'module.exports = function(',
  );
  transformed = transformed.replace(
    /export\s+default\s+/g,
    'module.exports = ',
  );
  transformed = transformed.replace(
    /export\s+async\s+function\s+(\w+)/g,
    'exports.$1 = async function $1',
  );
  transformed = transformed.replace(
    /export\s+function\s+(\w+)/g,
    'exports.$1 = function $1',
  );
  transformed = transformed.replace(
    /export\s+const\s+(\w+)\s*=/g,
    'exports.$1 =',
  );

  return transformed;
}

/**
 * Add React Refresh registration to transformed code.
 * This enables true HMR (state-preserving) for React components.
 * Shared between NextDevServer and ViteDevServer.
 */
export function addReactRefresh(code: string, filename: string): string {
  const components = detectReactComponents(code);

  if (components.length === 0) {
    return `// HMR Setup
import.meta.hot = window.__vite_hot_context__("${filename}");

${code}

// HMR Accept
if (import.meta.hot) {
  import.meta.hot.accept();
}
`;
  }

  const registrations = components
    .map(name => `  $RefreshReg$(${name}, "${filename} ${name}");`)
    .join('\n');

  return `// HMR Setup
import.meta.hot = window.__vite_hot_context__("${filename}");

${code}

// React Refresh Registration
if (import.meta.hot) {
${registrations}
  import.meta.hot.accept(() => {
    if (window.$RefreshRuntime$) {
      window.$RefreshRuntime$.performReactRefresh();
    }
  });
}
`;
}

function isUppercaseStart(name: string): boolean {
  return name.length > 0 && name[0] >= 'A' && name[0] <= 'Z';
}

/**
 * Detect React components using acorn AST parsing.
 * Components are top-level functions/arrows with uppercase names.
 * Falls back to regex if acorn fails.
 */
function detectReactComponents(code: string): string[] {
  try {
    return detectReactComponentsAst(code);
  } catch {
    return detectReactComponentsRegex(code);
  }
}

function detectReactComponentsAst(code: string): string[] {
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const components: string[] = [];

  for (const node of (ast as any).body) {
    // function App() {} or async function App() {}
    if (node.type === 'FunctionDeclaration' && node.id && isUppercaseStart(node.id.name)) {
      if (!components.includes(node.id.name)) {
        components.push(node.id.name);
      }
    }

    // export default function App() {}
    if (node.type === 'ExportDefaultDeclaration' &&
        node.declaration?.type === 'FunctionDeclaration' &&
        node.declaration.id && isUppercaseStart(node.declaration.id.name)) {
      if (!components.includes(node.declaration.id.name)) {
        components.push(node.declaration.id.name);
      }
    }

    // export function App() {} or export async function App() {}
    if (node.type === 'ExportNamedDeclaration' &&
        node.declaration?.type === 'FunctionDeclaration' &&
        node.declaration.id && isUppercaseStart(node.declaration.id.name)) {
      if (!components.includes(node.declaration.id.name)) {
        components.push(node.declaration.id.name);
      }
    }

    // const App = () => {} or const App = function() {}
    // Handles both plain and export: export const App = () => {}
    const varDecl = node.type === 'VariableDeclaration' ? node
      : (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration')
        ? node.declaration : null;

    if (varDecl) {
      for (const declarator of varDecl.declarations) {
        if (declarator.id?.name && isUppercaseStart(declarator.id.name) && declarator.init) {
          const initType = declarator.init.type;
          // Only count as component if assigned a function/arrow, not a string/number/object
          if (initType === 'ArrowFunctionExpression' ||
              initType === 'FunctionExpression' ||
              // React.memo(Component), React.forwardRef(...)
              initType === 'CallExpression') {
            if (!components.includes(declarator.id.name)) {
              components.push(declarator.id.name);
            }
          }
        }
      }
    }
  }

  return components;
}

function detectReactComponentsRegex(code: string): string[] {
  const components: string[] = [];

  const funcDeclRegex = /(?:^|\n)(?:export\s+)?(?:async\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\(/g;
  let match;
  while ((match = funcDeclRegex.exec(code)) !== null) {
    if (!components.includes(match[1])) {
      components.push(match[1]);
    }
  }

  const arrowRegex = /(?:^|\n)(?:export\s+)?(?:const|let|var)\s+([A-Z][a-zA-Z0-9]*)\s*=/g;
  while ((match = arrowRegex.exec(code)) !== null) {
    if (!components.includes(match[1])) {
      components.push(match[1]);
    }
  }

  return components;
}
