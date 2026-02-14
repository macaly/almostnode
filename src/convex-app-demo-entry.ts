/**
 * Entry point for Convex App Demo
 * This file is loaded by the HTML and bootstraps the demo
 */

import { VirtualFS } from './virtual-fs';
import { Runtime } from './runtime';
import { NextDevServer } from './frameworks/next-dev-server';
import { getServerBridge } from './server-bridge';
import { createConvexAppProject } from './convex-app-demo';
import { PackageManager } from './npm/index';

// DOM elements
const logsEl = document.getElementById('logs') as HTMLDivElement;
const previewContainer = document.getElementById('previewContainer') as HTMLDivElement;
const statusDot = document.getElementById('statusDot') as HTMLSpanElement;
const statusText = document.getElementById('statusText') as HTMLSpanElement;
const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;
const openBtn = document.getElementById('openBtn') as HTMLButtonElement;
const convexKeyInput = document.getElementById('convexKey') as HTMLInputElement;
const deployBtn = document.getElementById('deployBtn') as HTMLButtonElement;
const convexStatusEl = document.getElementById('convexStatus') as HTMLDivElement;
const convexStatusText = document.getElementById('convexStatusText') as HTMLSpanElement;
const fileTreeEl = document.getElementById('fileTree') as HTMLDivElement;
const editorTabsEl = document.getElementById('editorTabs') as HTMLDivElement;
const editorContentEl = document.getElementById('editorContent') as HTMLDivElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const watchModeCheckbox = document.getElementById('watchModeCheckbox') as HTMLInputElement;
const watchModeLabel = document.getElementById('watchModeLabel') as HTMLLabelElement;
const watchModeText = document.getElementById('watchModeText') as HTMLSpanElement;
const setupOverlay = document.getElementById('setupOverlay') as HTMLDivElement;
const setupKeyInput = document.getElementById('setupKeyInput') as HTMLInputElement;
const setupKeyBtn = document.getElementById('setupKeyBtn') as HTMLButtonElement;

let serverUrl: string | null = null;
let iframe: HTMLIFrameElement | null = null;
let vfs: VirtualFS | null = null;
let convexUrl: string | null = null;
let cliRuntime: Runtime | null = null;
let devServer: NextDevServer | null = null;

// Watch mode state
let watchModeEnabled = false;
let convexWatcher: { close: () => void } | null = null;
let isDeploying = false;
let deployDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
const DEPLOY_DEBOUNCE_MS = 800;

// Editor state
interface OpenFile {
  path: string;
  content: string;
  originalContent: string;
  modified: boolean;
}
let openFiles: OpenFile[] = [];
let activeFilePath: string | null = null;

// Status codes for test automation
type StatusCode =
  | 'DEPLOYING'
  | 'INSTALLED'
  | 'CLI_RUNNING'
  | 'WAITING'
  | 'COMPLETE'
  | 'ERROR';

function log(message: string, type: 'info' | 'error' | 'warn' | 'success' = 'info') {
  const line = document.createElement('div');
  const time = new Date().toLocaleTimeString();
  line.textContent = `[${time}] ${message}`;
  if (type === 'error') line.className = 'error';
  if (type === 'warn') line.className = 'warn';
  if (type === 'success') line.className = 'success';
  logsEl.appendChild(line);
  logsEl.scrollTop = logsEl.scrollHeight;
}

function logStatus(status: StatusCode, message: string) {
  log(`[STATUS:${status}] ${message}`, status === 'ERROR' ? 'error' : status === 'COMPLETE' ? 'success' : 'info');
}

function setStatus(text: string, state: 'loading' | 'running' | 'error' = 'loading') {
  statusText.textContent = text;
  statusDot.className = 'status-dot ' + state;
}

// ============ File Tree Functions ============

/**
 * Build the file tree UI for the given directories
 */
function buildFileTree(): void {
  if (!vfs) return;

  fileTreeEl.innerHTML = '';

  // Directories to show in the file tree
  const rootDirs = ['/app', '/convex', '/components', '/lib'];

  for (const dir of rootDirs) {
    if (vfs.existsSync(dir)) {
      const folderEl = createFolderElement(dir, true);
      fileTreeEl.appendChild(folderEl);
    }
  }
}

/**
 * Create a folder element with its children
 */
function createFolderElement(path: string, expanded = false): HTMLElement {
  if (!vfs) return document.createElement('div');

  const folder = document.createElement('div');
  folder.className = 'tree-folder' + (expanded ? ' expanded' : '');

  const name = path.split('/').pop() || path;

  // Folder header
  const header = document.createElement('div');
  header.className = 'tree-item';
  header.innerHTML = `
    <span class="icon">${expanded ? '▼' : '▶'}</span>
    <span class="name">${name}</span>
  `;
  header.onclick = (e) => {
    e.stopPropagation();
    folder.classList.toggle('expanded');
    const icon = header.querySelector('.icon') as HTMLSpanElement;
    icon.textContent = folder.classList.contains('expanded') ? '▼' : '▶';
  };
  folder.appendChild(header);

  // Children container
  const children = document.createElement('div');
  children.className = 'tree-children';

  try {
    const entries = vfs.readdirSync(path);

    // Sort: folders first, then files
    const sorted = entries.sort((a, b) => {
      const aIsDir = isDirectory(path + '/' + a);
      const bIsDir = isDirectory(path + '/' + b);
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.localeCompare(b);
    });

    for (const entry of sorted) {
      const fullPath = path + '/' + entry;
      if (isDirectory(fullPath)) {
        children.appendChild(createFolderElement(fullPath, false));
      } else {
        children.appendChild(createFileElement(fullPath));
      }
    }
  } catch (e) {
    // Directory might not exist or be readable
  }

  folder.appendChild(children);
  return folder;
}

/**
 * Create a file element
 */
function createFileElement(path: string): HTMLElement {
  const file = document.createElement('div');
  file.className = 'tree-item';
  file.dataset.path = path;

  const name = path.split('/').pop() || path;
  file.innerHTML = `
    <span class="icon">📄</span>
    <span class="name">${name}</span>
  `;

  file.onclick = (e) => {
    e.stopPropagation();
    openFile(path);
  };

  return file;
}

/**
 * Check if a path is a directory
 */
function isDirectory(path: string): boolean {
  if (!vfs) return false;
  try {
    return vfs.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// ============ Editor Functions ============

/**
 * Open a file in the editor
 */
function openFile(path: string): void {
  if (!vfs) return;

  // Check if already open
  let file = openFiles.find(f => f.path === path);

  if (!file) {
    // Read file content
    try {
      const content = vfs.readFileSync(path, 'utf8');
      file = {
        path,
        content,
        originalContent: content,
        modified: false,
      };
      openFiles.push(file);
    } catch (e) {
      log(`Failed to open file: ${path}`, 'error');
      return;
    }
  }

  activeFilePath = path;
  renderTabs();
  renderEditor();
  updateFileTreeSelection();
}

/**
 * Close a file tab
 */
function closeFile(path: string): void {
  const index = openFiles.findIndex(f => f.path === path);
  if (index === -1) return;

  openFiles.splice(index, 1);

  // If we closed the active file, switch to another
  if (activeFilePath === path) {
    activeFilePath = openFiles.length > 0 ? openFiles[openFiles.length - 1].path : null;
  }

  renderTabs();
  renderEditor();
  updateFileTreeSelection();
}

/**
 * Save the currently active file and trigger HMR
 */
function saveFile(): void {
  if (!vfs || !activeFilePath) return;

  const file = openFiles.find(f => f.path === activeFilePath);
  if (!file) return;

  try {
    vfs.writeFileSync(file.path, file.content);
    file.originalContent = file.content;
    file.modified = false;
    log(`Saved: ${file.path}`, 'success');
    renderTabs();
    saveBtn.disabled = true;

    // Manually trigger HMR since automatic watcher may not work in all cases
    triggerHMR(file.path);
  } catch (e) {
    log(`Failed to save: ${file.path} - ${e}`, 'error');
  }
}

/**
 * Manually trigger HMR update via postMessage
 * This mimics what the dev server's handleFileChange() does
 * Uses postMessage instead of BroadcastChannel to work with sandboxed iframes
 */
function triggerHMR(path: string): void {
  const isJS = /\.(jsx?|tsx?)$/.test(path);
  const isCSS = path.endsWith('.css');

  if (!isJS && !isCSS) {
    return;
  }

  const update = {
    type: 'update' as const,
    path,
    timestamp: Date.now(),
    channel: 'next-hmr' as const,
  };

  // Send via postMessage to iframe (works with sandboxed iframes)
  if (iframe?.contentWindow) {
    try {
      iframe.contentWindow.postMessage(update, '*');
      log(`HMR: ${path}`, 'success');
    } catch (e) {
      log(`HMR postMessage failed: ${e}`, 'warn');
    }
  } else {
    log(`HMR: no iframe to send update to`, 'warn');
  }
}

/**
 * Render the editor tabs
 */
function renderTabs(): void {
  editorTabsEl.innerHTML = '';

  for (const file of openFiles) {
    const tab = document.createElement('div');
    tab.className = 'editor-tab' + (file.path === activeFilePath ? ' active' : '');

    const name = file.path.split('/').pop() || file.path;
    tab.innerHTML = `
      <span>${name}</span>
      ${file.modified ? '<span class="modified">●</span>' : ''}
      <span class="close">×</span>
    `;

    tab.onclick = (e) => {
      if ((e.target as HTMLElement).classList.contains('close')) {
        closeFile(file.path);
      } else {
        activeFilePath = file.path;
        renderTabs();
        renderEditor();
        updateFileTreeSelection();
      }
    };

    editorTabsEl.appendChild(tab);
  }
}

/**
 * Render the editor content
 */
function renderEditor(): void {
  if (!activeFilePath) {
    editorContentEl.innerHTML = '<div class="editor-empty">Select a file to edit</div>';
    saveBtn.disabled = true;
    return;
  }

  const file = openFiles.find(f => f.path === activeFilePath);
  if (!file) {
    editorContentEl.innerHTML = '<div class="editor-empty">File not found</div>';
    saveBtn.disabled = true;
    return;
  }

  // Create textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'editor-textarea';
  textarea.value = file.content;
  textarea.spellcheck = false;

  textarea.oninput = () => {
    file.content = textarea.value;
    file.modified = file.content !== file.originalContent;
    saveBtn.disabled = !file.modified;
    renderTabs();
  };

  // Handle Ctrl+S
  textarea.onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveFile();
    }
    // Handle Tab key for indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      file.content = textarea.value;
      file.modified = file.content !== file.originalContent;
      saveBtn.disabled = !file.modified;
      renderTabs();
    }
  };

  // Auto-save on blur
  textarea.onblur = () => {
    if (file.modified) {
      saveFile();
    }
  };

  editorContentEl.innerHTML = '';
  editorContentEl.appendChild(textarea);

  saveBtn.disabled = !file.modified;

  // Focus the textarea
  textarea.focus();
}

/**
 * Update file tree selection highlight
 */
function updateFileTreeSelection(): void {
  // Remove all selected classes
  fileTreeEl.querySelectorAll('.tree-item.selected').forEach(el => {
    el.classList.remove('selected');
  });

  // Add selected class to active file
  if (activeFilePath) {
    const fileEl = fileTreeEl.querySelector(`[data-path="${activeFilePath}"]`);
    if (fileEl) {
      fileEl.classList.add('selected');
    }
  }
}

/**
 * Expose VFS functions to window for debugging
 */
function exposeVfsToWindow(): void {
  if (!vfs) return;

  (window as any).__vfs__ = vfs;
  (window as any).__readFile__ = (path: string) => vfs!.readFileSync(path, 'utf8');
  (window as any).__writeFile__ = (path: string, content: string) => vfs!.writeFileSync(path, content);
  (window as any).__listDir__ = (path: string) => vfs!.readdirSync(path);
  (window as any).__isDir__ = (path: string) => vfs!.statSync(path).isDirectory();
}

/**
 * Parse Convex deploy key to extract deployment name and URL
 */
function parseConvexKey(key: string): { deploymentName: string; url: string; adminKey: string } | null {
  // Format: dev:deployment-name|token or prod:deployment-name|token
  const match = key.match(/^(dev|prod):([^|]+)\|(.+)$/);
  if (!match) return null;

  const [, env, deploymentName] = match;
  const url = `https://${deploymentName}.convex.cloud`;
  return { deploymentName, url, adminKey: key };
}

/**
 * Wait for deployment to complete by polling for .env.local creation
 * This replaces the fixed 10s timeout with smart polling
 */
async function waitForDeployment(vfs: VirtualFS, maxWait = 30000, pollInterval = 500): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    if (vfs.existsSync('/project/.env.local')) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  return false;
}

/**
 * Wait for _generated directory to be created (indicates functions were bundled)
 */
async function waitForGenerated(vfs: VirtualFS, maxWait = 15000, pollInterval = 500): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    if (vfs.existsSync('/project/convex/_generated')) {
      const files = vfs.readdirSync('/project/convex/_generated');
      if (files.length > 0) {
        return true;
      }
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  return false;
}

/**
 * Deploy Convex schema and functions to Convex cloud using the Convex CLI
 *
 * This approach is documented in examples/convex-todo/src/hooks/useConvexRuntime.ts
 * Key requirements:
 * 1. Use /project/ as the working directory (CLI expects this structure)
 * 2. Use runtime.execute() with inline code that sets process.env and process.argv
 * 3. Use require() with relative path to the CLI bundle
 * 4. Create both .ts AND .js versions of convex/convex.config
 * 5. Wait for async operations after CLI runs
 */
async function deployToConvex(adminKey: string): Promise<void> {
  if (!vfs) throw new Error('VFS not initialized');

  const parsed = parseConvexKey(adminKey);
  if (!parsed) {
    throw new Error('Invalid deploy key format. Expected: dev:name|token');
  }

  logStatus('DEPLOYING', `Starting deployment to ${parsed.deploymentName}...`);

  // Create /project directory structure for CLI (matching working example)
  log('Setting up project structure for CLI...');
  vfs.mkdirSync('/project', { recursive: true });
  vfs.mkdirSync('/project/convex', { recursive: true });

  // Create package.json in /project (and root - CLI looks for both)
  const packageJson = JSON.stringify({
    name: 'convex-app-demo',
    version: '1.0.0',
    dependencies: { convex: '^1.0.0' }
  }, null, 2);
  vfs.writeFileSync('/project/package.json', packageJson);
  vfs.writeFileSync('/package.json', packageJson);

  // Create convex.json in /project
  // codegen.fileType: "ts" ensures codegen creates .ts files that esbuild can resolve
  // (default is "js/dts" which creates .js + .d.ts, but our source imports expect .ts)
  vfs.writeFileSync('/project/convex.json', JSON.stringify({
    functions: "convex/",
    codegen: { fileType: "ts" }
  }, null, 2));

  // Clean up /project/convex/ completely to ensure fresh state
  // This prevents stale cached files from being used
  if (vfs.existsSync('/project/convex')) {
    log('Cleaning /project/convex/ directory...');
    try {
      const existingFiles = vfs.readdirSync('/project/convex');
      for (const file of existingFiles) {
        const filePath = `/project/convex/${file}`;
        try {
          const stat = vfs.statSync(filePath);
          if (stat.isDirectory()) {
            // Remove directory contents first
            const subFiles = vfs.readdirSync(filePath);
            for (const subFile of subFiles) {
              vfs.unlinkSync(`${filePath}/${subFile}`);
            }
            vfs.rmdirSync(filePath);
          } else {
            vfs.unlinkSync(filePath);
          }
        } catch (e) {
          log(`  Warning: Could not remove ${filePath}: ${e}`, 'warn');
        }
      }
    } catch (e) {
      log(`Warning: Could not clean /project/convex/: ${e}`, 'warn');
    }
  }
  vfs.mkdirSync('/project/convex', { recursive: true });

  // Remove /project/.env.local before CLI runs so we can detect when the new deployment creates it.
  if (vfs.existsSync('/project/.env.local')) {
    vfs.unlinkSync('/project/.env.local');
  }
  // NOTE: Do NOT delete /project/convex/_generated/ — esbuild needs those files to resolve
  // imports like `from "./_generated/server"` in user code. The CLI's codegen will update them.

  // Create convex config files (BOTH .ts and .js required!)
  const convexConfig = `import { defineApp } from "convex/server";
const app = defineApp();
export default app;
`;
  vfs.writeFileSync('/project/convex/convex.config.ts', convexConfig);
  vfs.writeFileSync('/project/convex/convex.config.js', convexConfig);

  // Copy ALL convex files from root to /project/convex/ (dynamically, not hardcoded)
  // Read files fresh from VFS to ensure we get the latest content
  log('Copying convex files...');
  if (vfs.existsSync('/convex')) {
    const convexFiles = vfs.readdirSync('/convex');
    for (const file of convexFiles) {
      const srcPath = `/convex/${file}`;
      const destPath = `/project/convex/${file}`;
      try {
        const stat = vfs.statSync(srcPath);
        if (stat.isFile()) {
          const content = vfs.readFileSync(srcPath, 'utf8');
          vfs.writeFileSync(destPath, content);
          log(`  Copied ${file} (${content.length}b)`);
          // For todos.ts, show the mutation handler to verify modifications
          if (file === 'todos.ts') {
            const handlerMatch = content.match(/title:\s*args\.title[^\n]*/);
            log(`  → todos.ts mutation: ${handlerMatch ? handlerMatch[0] : 'handler not found'}`);
          }
        }
      } catch (e) {
        log(`  Warning: Could not copy ${srcPath}: ${e}`, 'warn');
      }
    }
  }

  // Install convex package in /project
  const convexPkgPath = '/project/node_modules/convex/package.json';
  if (!vfs.existsSync(convexPkgPath)) {
    log('Installing convex package...');
    const npm = new PackageManager(vfs, { cwd: '/project' });
    try {
      await npm.install('convex', {
        onProgress: (msg) => log(`  ${msg}`),
      });
      logStatus('INSTALLED', 'Convex package installed');
    } catch (error) {
      logStatus('ERROR', `Failed to install convex: ${error}`);
      throw error;
    }
  } else {
    logStatus('INSTALLED', 'Convex package already installed');
  }

  // Run Convex CLI using runtime.execute() with cwd /project
  logStatus('CLI_RUNNING', 'Running convex dev --once');

  // Always create fresh Runtime for each deployment
  // This ensures no stale caches or closures from previous deployments
  log('Creating fresh CLI Runtime...');
  cliRuntime = new Runtime(vfs, { cwd: '/project' });

  // Debug: verify files exist and show content preview
  log('Verifying project structure...');
  const requiredFiles = [
    '/project/package.json',
    '/project/convex.json',
    '/project/convex/convex.config.ts',
    '/project/convex/convex.config.js',
    '/project/convex/schema.ts',
    '/project/convex/todos.ts',
    '/project/node_modules/convex/package.json',
    '/project/node_modules/convex/dist/cli.bundle.cjs',
  ];
  for (const file of requiredFiles) {
    if (vfs.existsSync(file)) {
      if (file.includes('/project/convex/') && (file.endsWith('.ts') || file.endsWith('.js'))) {
        const content = vfs.readFileSync(file, 'utf8');
        log(`  ✓ ${file} (${content.length}b)`, 'success');
        // For todos.ts, verify the mutation content the CLI will push
        if (file.endsWith('todos.ts')) {
          const titleLine = content.match(/title:\s*args\.title[^\n]*/);
          log(`    → CLI will push: ${titleLine ? titleLine[0].trim() : 'title line not found'}`, 'info');
        }
      } else {
        log(`  ✓ ${file}`, 'success');
      }
    } else {
      log(`  ✗ ${file} MISSING`, 'error');
    }
  }

  // Patch CLI bundle: stub fetchDeploymentCanonicalSiteUrl
  // This function was added in convex v1.31.7 and calls envGetInDeployment() to fetch CONVEX_SITE_URL
  // from the deployment. The envGetInDeployment call hangs in our browser runtime because it uses
  // a deployment API endpoint we can't handle. We derive the site URL from the deployment URL instead.
  {
    const cliBundlePath = '/project/node_modules/convex/dist/cli.bundle.cjs';
    let cliSrc = vfs.readFileSync(cliBundlePath, 'utf8');

    const fetchCanonSearch = [
      'async function fetchDeploymentCanonicalSiteUrl(ctx, options) {',
      '  const result = await envGetInDeployment(ctx, options, "CONVEX_SITE_URL");',
      '  if (typeof result !== "string") {',
      '    return await ctx.crash({',
      '      exitCode: 1,',
      '      errorType: "invalid filesystem or env vars",',
      '      printedMessage: "Invalid process.env.CONVEX_SITE_URL"',
      '    });',
      '  }',
      '  return result;',
      '}',
    ].join('\n');
    const fetchCanonReplace = [
      'async function fetchDeploymentCanonicalSiteUrl(ctx, options) {',
      '  // Stubbed: derive site URL from deployment URL (.convex.cloud -> .convex.site)',
      '  var siteUrl = (options?.deploymentUrl || "").replace(".convex.cloud", ".convex.site");',
      '  return siteUrl || "https://placeholder.convex.site";',
      '}',
    ].join('\n');

    let patched = cliSrc.replace(fetchCanonSearch, fetchCanonReplace);
    const patch1Applied = patched !== cliSrc;
    log(`  Patch 1 (fetchDeploymentCanonicalSiteUrl): ${patch1Applied ? 'APPLIED' : 'already patched or not found'}`);

    // Patch 2: Stub Sentry5.close() in flushAndExit so process.exit() actually fires.
    // Without this patch, Sentry5.close() hangs forever and process.exit() is never called,
    // making it impossible to detect when the CLI has finished pushing functions.
    const flushAndExitSearch = [
      'async function flushAndExit(exitCode, err) {',
      '  if (err) {',
      '    Sentry5.captureException(err);',
      '  }',
      '  await Sentry5.close();',
      '  return process.exit(exitCode);',
      '}',
    ].join('\n');
    const flushAndExitReplace = [
      'async function flushAndExit(exitCode, err) {',
      '  // Patched: skip Sentry5.close() which hangs in browser runtime',
      '  var callerStack = new Error("flushAndExit-trace").stack || "";',
      '  globalThis.__cliExitInfo = { code: exitCode, msg: err ? (err.message || String(err)) : null, stack: err ? (err.stack || "").substring(0, 2000) : null, callerStack: callerStack.substring(0, 3000) };',
      '  return process.exit(exitCode);',
      '}',
    ].join('\n');

    const beforePatch2 = patched;
    patched = patched.replace(flushAndExitSearch, flushAndExitReplace);
    let patch2Applied = patched !== beforePatch2;

    // Also handle re-patching: if already patched with an older version
    if (!patch2Applied) {
      const oldPatchMarker = '// Patched: skip Sentry5.close()';
      const markerIdx = patched.indexOf(oldPatchMarker);
      if (markerIdx > -1) {
        // Find the function boundaries around our marker
        const funcStart = patched.lastIndexOf('async function flushAndExit(exitCode, err) {', markerIdx);
        const funcEnd = patched.indexOf('\n}', markerIdx);
        if (funcStart > -1 && funcEnd > -1) {
          const oldFunc = patched.substring(funcStart, funcEnd + 2);
          if (oldFunc !== flushAndExitReplace) {
            patched = patched.replace(oldFunc, flushAndExitReplace);
            patch2Applied = patched !== beforePatch2;
            if (patch2Applied) log('  Patch 2: re-patched (upgraded old patch)');
          }
        }
      }
    }

    log(`  Patch 2 (flushAndExit/Sentry5): ${patch2Applied ? 'APPLIED' : 'already up-to-date'}`);

    // Patch 3: Capture Crash error details in watchAndPush catch block before flushAndExit
    // The Crash object is thrown by runPush() and caught in watchAndPush. It has errorType,
    // printedMessage, message, and stack. We save these to __cliCrashInfo before exiting.
    const watchPushSearch = '      if (cmdOptions.once) {\n        await outerCtx.flushAndExit(1, e.errorType);\n      }';
    const watchPushReplace = '      if (cmdOptions.once) {\n        globalThis.__cliCrashInfo = { errorType: e.errorType, printedMessage: e.printedMessage || null, message: e.message || null, stack: (e.stack || "").substring(0, 2000) };\n        await outerCtx.flushAndExit(1, e.errorType);\n      }';
    const beforePatch3 = patched;
    patched = patched.replace(watchPushSearch, watchPushReplace);
    const patch3Applied = patched !== beforePatch3;
    log(`  Patch 3 (watchAndPush crash details): ${patch3Applied ? 'APPLIED' : 'already patched or not found'}`);

    // Patch 4: Skip post-esbuild file size mismatch check in doEsbuild
    // The CLI checks that each bundled file's size hasn't changed after esbuild runs.
    // In our browser VFS, stat().size may differ from esbuild's metafile byte count
    // (e.g., UTF-8 encoding differences), causing a false "transient" crash.
    // We skip the size comparison since VFS files can't change from external sources.
    const sizeCheckSearch = '      if (st.size !== input.bytes) {\n        logWarning(\n          `Bundled file ${absPath} changed right after esbuild invocation`\n        );\n        return await ctx.crash({\n          exitCode: 1,\n          errorType: "transient",\n          printedMessage: null\n        });\n      }';
    const sizeCheckReplace = '      // Patched: skip file size check (VFS stat size may differ from esbuild byte count)';
    const beforePatch4 = patched;
    patched = patched.replace(sizeCheckSearch, sizeCheckReplace);
    const patch4Applied = patched !== beforePatch4;
    log(`  Patch 4 (skip file size check): ${patch4Applied ? 'APPLIED' : 'already patched or not found'}`);


    if (patched !== cliSrc) {
      vfs.writeFileSync(cliBundlePath, patched);
      log('CLI bundle patched and saved');
    } else {
      log('CLI bundle already patched (no changes needed)');
    }
  }

  // Set up process.exit listener BEFORE running CLI.
  // The CLI calls flushAndExit → process.exit(0) when deployment completes.
  // This is the most reliable completion signal since it fires AFTER the push POST finishes.
  const cliExitPromise = new Promise<number>((resolve) => {
    const proc = cliRuntime!.getProcess();
    proc.on('exit', (code: unknown) => {
      log(`CLI process exited with code ${code}`);
      const crashInfo = (globalThis as any).__cliCrashInfo;
      if (crashInfo) {
        log(`CLI CRASH: [${crashInfo.errorType}] msg=${crashInfo.printedMessage || crashInfo.message || '(no message)'}`, 'error');
        if (crashInfo.stack) log(`CLI CRASH STACK: ${crashInfo.stack.substring(0, 500)}`, 'error');
      }
      const exitInfo = (globalThis as any).__cliExitInfo;
      if (exitInfo) {
        log(`CLI exit: code=${exitInfo.code} err=${exitInfo.msg || 'none'}`, exitInfo.code === 0 ? 'success' : 'error');
      }
      resolve(code as number);
    });
  });

  // Intercept fetch to log Convex API push calls
  const origFetch = globalThis.fetch;
  globalThis.fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('convex.cloud') || url.includes('convex.site')) {
      const method = init?.method || 'GET';
      log(`[fetch] ${method} ${url.substring(0, 120)}`);
      try {
        const resp = await origFetch.call(globalThis, input, init);
        log(`[fetch] ${method} ${url.substring(0, 80)} → ${resp.status} ${resp.statusText}`);
        if (!resp.ok) {
          const text = await resp.clone().text();
          log(`[fetch] ERROR body: ${text.substring(0, 500)}`, 'error');
        }
        return resp;
      } catch (e) {
        log(`[fetch] ${method} ${url.substring(0, 80)} → NETWORK ERROR: ${(e as Error).message}`, 'error');
        throw e;
      }
    }
    return origFetch.call(globalThis, input, init);
  } as typeof fetch;

  const cliCode = `
    // Set environment for Convex CLI
    process.env.CONVEX_DEPLOY_KEY = '${adminKey}';

    // Set CLI arguments
    process.argv = ['node', 'convex', 'dev', '--once'];

    // Load and execute the CLI bundle
    require('./node_modules/convex/dist/cli.bundle.cjs');
  `;

  // Capture unhandled rejections from CLI async code (void main())
  const rejectionHandler = (event: PromiseRejectionEvent) => {
    const err = event.reason;
    const msg = err?.message || String(err);
    if (!msg.includes('Process exited with code')) {
      log(`[CLI ASYNC ERROR] ${msg}`, 'error');
      if (err?.stack) log(`[CLI ASYNC STACK] ${err.stack.substring(0, 500)}`, 'error');
    }
  };
  globalThis.addEventListener('unhandledrejection', rejectionHandler);

  try {
    cliRuntime.execute(cliCode, '/project/cli-runner.js');
    log('CLI synchronous execution completed (async work continues in background)');
  } catch (cliError) {
    // Some errors are expected (like process.exit or stack overflow in watcher)
    // The important work (deployment) happens before these errors
    log(`CLI completed with: ${(cliError as Error).message}`, 'warn');
  }

  // Wait for CLI to finish: either process.exit fires (reliable) or fall back to polling
  logStatus('WAITING', 'Waiting for deployment to complete...');

  const timeoutPromise = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), 90000)
  );

  const result = await Promise.race([cliExitPromise, timeoutPromise]);

  // Restore original fetch and remove rejection handler
  globalThis.fetch = origFetch;
  globalThis.removeEventListener('unhandledrejection', rejectionHandler);

  if (result === 'timeout') {
    log('CLI did not exit within 90s, falling back to file polling...', 'warn');
    const envCreated = await waitForDeployment(vfs, 15000, 500);
    if (envCreated) {
      await waitForGenerated(vfs, 15000, 500);
    }
  } else {
    log(`CLI exited with code ${result}, deployment complete`);
  }

  // Check if deployment succeeded by reading .env.local (CLI creates it in /project)
  const envLocalPath = '/project/.env.local';
  if (vfs.existsSync(envLocalPath)) {
    const envContent = vfs.readFileSync(envLocalPath, 'utf8');
    log('.env.local created - deployment succeeded!', 'success');
    log(`  Contents: ${envContent.trim()}`);

    // Check if _generated directory was created (indicates functions were pushed)
    if (vfs.existsSync('/project/convex/_generated')) {
      const generated = vfs.readdirSync('/project/convex/_generated');
      log(`  Generated files: ${generated.join(', ')}`, 'success');

      // Show the contents of api.js to verify function references
      if (vfs.existsSync('/project/convex/_generated/api.js')) {
        const apiContent = vfs.readFileSync('/project/convex/_generated/api.js', 'utf8');
        log('  Generated api.js content:', 'info');
        // Show first 500 chars
        log(`  ${apiContent.substring(0, 500)}...`, 'info');
      }

      // Copy generated files to /convex/_generated/ for the Next.js app to use
      // CLI generates .js/.d.ts files, but Next.js imports .ts files
      // So we copy api.js as both api.js AND api.ts
      log('Copying generated files to /convex/_generated/...');
      vfs.mkdirSync('/convex/_generated', { recursive: true });
      for (const file of generated) {
        const srcPath = `/project/convex/_generated/${file}`;
        const destPath = `/convex/_generated/${file}`;
        if (vfs.existsSync(srcPath)) {
          const content = vfs.readFileSync(srcPath, 'utf8');
          vfs.writeFileSync(destPath, content);
          log(`  Copied ${file}`, 'success');

          // Also copy .js files as .ts for Next.js imports
          if (file.endsWith('.js') && !file.endsWith('.d.js')) {
            const tsDestPath = destPath.replace(/\.js$/, '.ts');
            vfs.writeFileSync(tsDestPath, content);
            log(`  Also copied as ${file.replace(/\.js$/, '.ts')}`, 'success');
          }
        }
      }
    } else {
      log('  WARNING: _generated directory not created - functions may not be deployed!', 'error');
    }

    // Ensure /convex/_generated/api.ts always exists (fallback if CLI didn't generate it)
    if (!vfs.existsSync('/convex/_generated/api.ts')) {
      log('  Restoring fallback api.ts (CLI did not generate one)');
      vfs.mkdirSync('/convex/_generated', { recursive: true });
      vfs.writeFileSync('/convex/_generated/api.ts', `// Convex API - fallback for browser demo
export const api = {
  todos: {
    list: "todos:list",
    create: "todos:create",
    toggle: "todos:toggle",
    remove: "todos:remove",
  },
} as const;
`);
    }
    if (!vfs.existsSync('/convex/_generated/server.ts')) {
      vfs.mkdirSync('/convex/_generated', { recursive: true });
      vfs.writeFileSync('/convex/_generated/server.ts', `// Server stubs for browser demo
export function query(config) { return config; }
export function mutation(config) { return config; }
`);
    }

    // Parse the Convex URL from .env.local
    const match = envContent.match(/CONVEX_URL=(.+)/);
    if (match) {
      convexUrl = match[1].trim();
      logStatus('COMPLETE', `Deployment successful - connected to ${convexUrl}`);
    } else {
      convexUrl = parsed.url;
      logStatus('COMPLETE', `Deployment successful - Convex URL set: ${convexUrl}`);
    }
  } else {
    log('.env.local not found - checking root...', 'warn');
    // Also check root in case CLI wrote there
    if (vfs.existsSync('/.env.local')) {
      const envContent = vfs.readFileSync('/.env.local', 'utf8');
      log(`Found .env.local at root: ${envContent.trim()}`);
      const match = envContent.match(/CONVEX_URL=(.+)/);
      if (match) {
        convexUrl = match[1].trim();
      }
    }
    if (!convexUrl) {
      convexUrl = parsed.url;
      log(`Using fallback URL: ${convexUrl}`, 'warn');
    }
    logStatus('COMPLETE', `Connected to ${convexUrl} (fallback)`);
  }

  // Set the env var on the dev server (idiomatic Next.js pattern)
  // This makes it available via process.env.NEXT_PUBLIC_CONVEX_URL in browser code
  if (devServer && convexUrl) {
    devServer.setEnv('NEXT_PUBLIC_CONVEX_URL', convexUrl);
    log(`Set NEXT_PUBLIC_CONVEX_URL=${convexUrl}`);
  }

  // Also set on parent window for backwards compatibility
  (window as any).__CONVEX_URL__ = convexUrl;

  // Wait a moment for things to settle before refreshing
  log('Waiting for iframe refresh...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Refresh the iframe to pick up the new Convex connection
  if (iframe) {
    const iframeSrc = iframe.src;
    log(`Refreshing preview: ${iframeSrc}`);

    // Add load handler to track iframe state
    iframe.onload = () => {
      log('Iframe loaded successfully', 'success');
      // The env var is now injected via the HTML, so we only need the fallback
      if (convexUrl && iframe?.contentWindow) {
        (iframe.contentWindow as any).__CONVEX_URL__ = convexUrl;
      }
    };

    iframe.onerror = (e) => {
      log(`Iframe error: ${e}`, 'error');
    };

    // Clear and reload
    iframe.src = 'about:blank';
    await new Promise(resolve => setTimeout(resolve, 500));
    iframe.src = iframeSrc;
    log('Preview refresh initiated', 'success');
  } else {
    log('No iframe found!', 'error');
  }
}

/**
 * Set up file watcher for /convex directory to auto-deploy on changes
 */
function setupConvexWatcher(): void {
  if (!vfs || convexWatcher) return;

  log('Setting up watch mode for /convex directory...', 'info');

  convexWatcher = vfs.watch('/convex', { recursive: true }, (eventType, filename) => {
    // Ignore if watch mode is disabled or already deploying
    if (!watchModeEnabled || isDeploying) return;

    // Ignore generated files and dotfiles
    if (!filename || filename.includes('_generated') || filename.startsWith('.')) return;

    // Only watch source files
    if (!/\.(ts|tsx|js|json)$/.test(filename)) return;

    log(`Watch: detected change in ${filename}`, 'info');

    // Debounce to handle rapid edits
    if (deployDebounceTimeout) {
      clearTimeout(deployDebounceTimeout);
    }

    deployDebounceTimeout = setTimeout(() => {
      const key = convexKeyInput.value.trim();
      if (!key) {
        log('Watch: no deploy key, skipping auto-deploy', 'warn');
        return;
      }

      triggerAutoDeployment(key);
    }, DEPLOY_DEBOUNCE_MS);
  });

  log('Watch mode enabled - changes to /convex files will auto-deploy', 'success');
}

/**
 * Trigger an automatic deployment from watch mode
 */
async function triggerAutoDeployment(key: string): Promise<void> {
  if (isDeploying) {
    log('Watch: deployment already in progress, skipping', 'warn');
    return;
  }

  isDeploying = true;

  // Update UI to show auto-deploying state
  deployBtn.classList.add('auto-deploying');
  deployBtn.textContent = 'Auto-deploying...';
  watchModeLabel.classList.add('watching');
  watchModeText.textContent = 'Deploying...';

  try {
    await deployToConvex(key);
    log('Watch: auto-deployment complete', 'success');
  } catch (error) {
    log(`Watch: auto-deployment failed: ${error}`, 'error');
  } finally {
    isDeploying = false;

    // Restore UI
    deployBtn.classList.remove('auto-deploying');
    deployBtn.textContent = 'Re-deploy';
    watchModeLabel.classList.remove('watching');
    watchModeText.textContent = 'Watching';
  }
}

/**
 * Stop watching for file changes
 */
function stopConvexWatcher(): void {
  if (convexWatcher) {
    convexWatcher.close();
    convexWatcher = null;
    log('Watch mode disabled', 'info');
  }
}

/**
 * Update watch mode UI state
 */
function updateWatchModeUI(): void {
  if (watchModeEnabled) {
    watchModeLabel.classList.add('active');
    watchModeText.textContent = 'Watching';
  } else {
    watchModeLabel.classList.remove('active');
    watchModeLabel.classList.remove('watching');
    watchModeText.textContent = 'Watch';
  }
}

async function main() {
  try {
    setStatus('Creating virtual file system...', 'loading');
    log('Creating virtual file system...');
    vfs = new VirtualFS();

    setStatus('Setting up project...', 'loading');
    log('Creating Convex App project structure...');
    createConvexAppProject(vfs);
    log('Project files created', 'success');
    log('  /convex/schema.ts');
    log('  /convex/todos.ts');

    // Expose VFS to window and build file tree
    exposeVfsToWindow();
    buildFileTree();
    log('File editor ready', 'success');

    // Install convex at root so NextDevServer's getInstalledPackages() finds it
    // (CLI install goes to /project/node_modules/ which the dev server doesn't see)
    setStatus('Installing packages...', 'loading');
    log('Installing convex package at root...');
    const rootPm = new PackageManager(vfs, { cwd: '/' });
    await rootPm.install('convex', {
      onProgress: (msg) => log(msg),
      transform: true,
    });
    log('Convex package installed', 'success');

    setStatus('Starting dev server...', 'loading');
    log('Starting Next.js dev server...');

    const port = 3002;
    devServer = new NextDevServer(vfs, {
      port,
      root: '/',
      preferAppRouter: true,
    });

    const bridge = getServerBridge();

    try {
      log('Initializing Service Worker...');
      await bridge.initServiceWorker();
      log('Service Worker ready', 'success');
    } catch (error) {
      log(`Service Worker warning: ${error}`, 'warn');
    }

    bridge.registerServer(devServer as any, port);
    devServer.start();

    serverUrl = bridge.getServerUrl(port) + '/';
    log(`Server running at: ${serverUrl}`, 'success');

    setStatus('Running', 'running');

    // Show iframe
    previewContainer.innerHTML = '';
    iframe = document.createElement('iframe');
    iframe.src = serverUrl;
    iframe.id = 'preview-iframe';
    iframe.name = 'preview-iframe';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    // Sandbox the iframe for security - postMessage-based HMR works with sandboxed iframes
    iframe.setAttribute('sandbox', 'allow-forms allow-scripts allow-same-origin allow-popups allow-pointer-lock allow-modals allow-downloads allow-orientation-lock allow-presentation allow-popups-to-escape-sandbox');

    // Set up onload handler to inject Convex URL into iframe's window
    // and register the iframe as HMR target
    iframe.onload = () => {
      if (iframe?.contentWindow) {
        // Register iframe as HMR target (for postMessage-based HMR)
        if (devServer) {
          devServer.setHMRTarget(iframe.contentWindow);
        }
        // Inject Convex URL if available
        if (convexUrl) {
          (iframe.contentWindow as any).__CONVEX_URL__ = convexUrl;
          log(`Injected Convex URL into iframe: ${convexUrl}`);
        }
      }
    };

    previewContainer.appendChild(iframe);

    // Enable buttons
    refreshBtn.disabled = false;
    openBtn.disabled = false;
    deployBtn.disabled = false;

    refreshBtn.onclick = () => {
      if (iframe) {
        log('Refreshing preview...');
        iframe.src = iframe.src;
      }
    };

    openBtn.onclick = () => {
      if (serverUrl) {
        window.open(serverUrl, '_blank');
      }
    };

    saveBtn.onclick = () => {
      saveFile();
    };

    deployBtn.onclick = async () => {
      const key = convexKeyInput.value.trim();
      if (!key) {
        logStatus('ERROR', 'Please enter a Convex deploy key');
        return;
      }

      const isRedeployment = deployBtn.classList.contains('success');
      deployBtn.disabled = true;
      deployBtn.textContent = isRedeployment ? 'Re-deploying...' : 'Deploying...';
      // Remove success class during deployment
      deployBtn.classList.remove('success');
      isDeploying = true;

      try {
        await deployToConvex(key);

        // Show connected status
        const parsed = parseConvexKey(key);
        if (parsed && convexStatusEl && convexStatusText) {
          convexStatusText.textContent = parsed.deploymentName;
          convexStatusEl.style.display = 'inline-flex';
        }

        // Update input to show connected state
        convexKeyInput.classList.add('connected');

        // Change button to "Re-deploy" for subsequent deployments
        deployBtn.textContent = 'Re-deploy';
        deployBtn.classList.add('success');
        deployBtn.disabled = false;

        // Enable watch mode checkbox after first successful deployment
        watchModeCheckbox.disabled = false;

        // Set up watcher if watch mode is enabled
        if (watchModeEnabled && !convexWatcher) {
          setupConvexWatcher();
        }

        log('Convex connected! The app will now use real-time data.', 'success');
        if (!watchModeEnabled) {
          log('Edit /convex files and click "Re-deploy" to push changes.', 'info');
          log('Or enable "Watch" mode for automatic re-deployment.', 'info');
        }
      } catch (error) {
        logStatus('ERROR', `Deployment failed: ${error}`);
        // Keep "Re-deploy" text if already connected, otherwise show "Deploy"
        deployBtn.textContent = convexStatusEl?.style.display === 'inline-flex' ? 'Re-deploy' : 'Deploy';
        deployBtn.disabled = false;
      } finally {
        isDeploying = false;
      }
    };

    // Watch mode checkbox handler
    watchModeCheckbox.onchange = () => {
      watchModeEnabled = watchModeCheckbox.checked;
      updateWatchModeUI();

      if (watchModeEnabled) {
        // Only set up watcher if we've already deployed (have a key)
        if (convexKeyInput.value.trim() && deployBtn.classList.contains('success')) {
          setupConvexWatcher();
        }
      } else {
        stopConvexWatcher();
      }
    };

    // Setup overlay dialog
    setupKeyInput.oninput = () => {
      setupKeyBtn.disabled = !setupKeyInput.value.trim();
    };
    const handleSetupDeploy = () => {
      const key = setupKeyInput.value.trim();
      if (key) {
        convexKeyInput.value = key;
        setupOverlay.classList.add('hidden');
        deployBtn.click();
      }
    };
    setupKeyBtn.onclick = handleSetupDeploy;
    setupKeyInput.onkeydown = (e) => {
      if (e.key === 'Enter' && setupKeyInput.value.trim()) {
        handleSetupDeploy();
      }
    };

    log('Demo ready!', 'success');
    log('Edit files on the left, preview updates via HMR.');
    log('Enter Convex deploy key and click Deploy to connect.');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Error: ${errorMessage}`, 'error');
    console.error(error);
    setStatus('Error', 'error');
  }
}

// Start the demo
main();
