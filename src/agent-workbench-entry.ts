/**
 * Agent Workbench Entry Point
 *
 * Architecture:
 * - The entire app (chat UI + preview) runs inside almostnode's virtual Next.js
 * - Chat page (/app/page.tsx) uses useChat from @ai-sdk/react (loaded from esm.sh)
 * - API route (/pages/api/chat.ts) uses streamText with tool-calling
 * - AI SDK packages (ai, @ai-sdk/openai, zod) are installed via PackageManager
 * - Tools operate on VFS directly (read, write, replace, list, bash)
 */

import { VirtualFS } from './virtual-fs';
import { NextDevServer } from './frameworks/next-dev-server';
import { getServerBridge } from './server-bridge';
import { createAgentWorkbenchProject } from './agent-workbench-project';
import { initChildProcess, exec as cpExec } from './shims/child_process';
import { PackageManager } from './npm/index';

// ── Constants ──

const CORS_PROXY = new URLSearchParams(window.location.search).get('corsProxy') || 'https://corsproxy.io/?';
const PORT = 3004;

// ── Logging (outside React) ──

const logsEl = document.getElementById('logs') as HTMLDivElement;

function log(message: string, type: 'info' | 'error' | 'warn' | 'success' = 'info') {
  const line = document.createElement('div');
  const time = new Date().toLocaleTimeString();
  line.textContent = `[${time}] ${message}`;
  line.className = type;
  logsEl.appendChild(line);
  logsEl.scrollTop = logsEl.scrollHeight;
}

// ── Create __project__ module (VFS operations for the API route) ──

function createProjectModule(vfs: VirtualFS) {
  return {
    readFile: (path: string) => vfs.readFileSync(path, 'utf8') as string,
    writeFile: (path: string, content: string) => vfs.writeFileSync(path, content),
    existsSync: (path: string) => vfs.existsSync(path),
    listFiles: (dir: string) => vfs.readdirSync(dir),
    statSync: (path: string) => vfs.statSync(path),
    mkdirSync: (dir: string, opts?: { recursive?: boolean }) => vfs.mkdirSync(dir, opts),
    runCommand: (command: string): Promise<string> => {
      return new Promise<string>((resolve) => {
        const timeout = setTimeout(() => {
          resolve('Error: Command timed out (10s)');
        }, 10000);
        cpExec(command, { cwd: '/' }, (error, stdout, stderr) => {
          clearTimeout(timeout);
          if (error) {
            resolve(stderr ? `Error: ${stderr}` : `Error: ${error.message}`);
          } else {
            const output = (stdout || '') + (stderr ? `\n[stderr] ${stderr}` : '');
            resolve(output || '(no output)');
          }
        });
      });
    },
    log: (msg: string) => log(msg, 'success'),
  };
}

// ── Bootstrap ──

async function main() {
  try {
    log('Creating virtual file system...');
    const vfs = new VirtualFS();

    log('Setting up starter project...');
    createAgentWorkbenchProject(vfs);
    initChildProcess(vfs);
    log('Project files created', 'success');

    // Install AI SDK packages via PackageManager
    log('Installing npm packages...');
    const pm = new PackageManager(vfs, { cwd: '/' });

    // Install zod v4 (provides both zod/v3 and zod/v4 sub-paths needed by
    // @ai-sdk/provider-utils). The AI SDK server-side code runs in VFS so it
    // uses the real npm-installed zod, not esm.sh.
    // @ai-sdk/react is installed locally and served via /_npm/ (not esm.sh)
    // to avoid esm.sh resolution bugs with zod/v4 sub-path exports.
    const packages = ['zod', 'ai@5', '@ai-sdk/openai@2', '@ai-sdk/react@2'];
    for (const pkg of packages) {
      log(`Installing ${pkg}...`);
      await pm.install(pkg, {
        onProgress: (msg) => log(msg),
        transform: true,
      });
    }
    log('All packages installed', 'success');

    log('Starting Next.js dev server...');

    const projectModule = createProjectModule(vfs);

    const apiModules: Record<string, unknown> = {
      '__project__': projectModule,
    };

    const devServer = new NextDevServer(vfs, {
      port: PORT,
      root: '/',
      preferAppRouter: true,
      apiModules,
      corsProxy: CORS_PROXY,
    });

    const bridge = getServerBridge();

    try {
      log('Initializing Service Worker...');
      await bridge.initServiceWorker();
      log('Service Worker ready', 'success');
    } catch (error) {
      log(`Service Worker warning: ${error}`, 'warn');
    }

    bridge.registerServer(devServer as any, PORT);
    devServer.start();

    const serverUrl = bridge.getServerUrl(PORT) + '/';
    log(`Server running at: ${serverUrl}`, 'success');

    // Create preview iframe
    const previewContainer = document.getElementById('previewContainer') as HTMLDivElement;
    previewContainer.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = serverUrl;
    iframe.id = 'preview-iframe';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.setAttribute(
      'sandbox',
      'allow-forms allow-scripts allow-same-origin allow-popups allow-pointer-lock allow-modals'
    );

    iframe.onload = () => {
      if (iframe?.contentWindow && devServer) {
        devServer.setHMRTarget(iframe.contentWindow);
      }
    };

    previewContainer.appendChild(iframe);

    // Setup overlay handlers
    const setupOverlay = document.getElementById('setupOverlay') as HTMLDivElement;
    const setupKeyInput = document.getElementById('setupKeyInput') as HTMLInputElement;
    const setupKeyBtn = document.getElementById('setupKeyBtn') as HTMLButtonElement;

    setupKeyInput.oninput = () => {
      setupKeyBtn.disabled = !setupKeyInput.value.trim();
    };

    const startAgent = (key: string) => {
      const sanitizedKey = key.trim().replace(/[^\x00-\x7F]/g, '');
      if (!sanitizedKey) {
        log('Please enter an API key', 'error');
        return;
      }
      if (!sanitizedKey.startsWith('sk-')) {
        log('Warning: OpenAI keys typically start with "sk-"', 'warn');
      }

      // Pass API key to the virtual environment via env vars.
      // The API route reads process.env.OPENAI_API_KEY and configures the
      // CORS proxy itself — no need to inject pre-configured modules.
      devServer.setEnv('OPENAI_API_KEY', sanitizedKey);

      setupOverlay.classList.add('hidden');
      log('Agent ready — enter a message in the chat', 'success');
    };

    setupKeyBtn.onclick = () => {
      startAgent(setupKeyInput.value);
    };

    setupKeyInput.onkeydown = (e) => {
      if (e.key === 'Enter' && setupKeyInput.value.trim()) {
        startAgent(setupKeyInput.value);
      }
    };

    log('Workbench ready!', 'success');
    log('Enter your OpenAI API key to start.');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Error: ${errorMessage}`, 'error');
    console.error(error);
  }
}

main();
