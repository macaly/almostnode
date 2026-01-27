import { WebContainer } from '@webcontainer/api';

// DOM elements
const editorEl = document.getElementById('editor');
const previewEl = document.getElementById('preview');
const terminalEl = document.getElementById('terminal');
const statusEl = document.getElementById('status');

// Files to mount in the WebContainer
const files = {
  'index.js': {
    file: {
      contents: editorEl.value,
    },
  },
  'package.json': {
    file: {
      contents: JSON.stringify({
        name: 'webcontainer-app',
        type: 'module',
        dependencies: {
          express: '^4.18.2',
        },
        scripts: {
          start: 'node index.js',
        },
      }),
    },
  },
};

let webcontainerInstance;
let serverProcess;

// Log to terminal
function log(message) {
  terminalEl.textContent += message + '\n';
  terminalEl.scrollTop = terminalEl.scrollHeight;
}

// Update status indicator
function setStatus(text, className) {
  statusEl.textContent = text;
  statusEl.className = 'status ' + className;
}

// Install dependencies
async function installDependencies() {
  log('📦 Installing dependencies...');

  const installProcess = await webcontainerInstance.spawn('npm', ['install']);

  installProcess.output.pipeTo(
    new WritableStream({
      write(data) {
        log(data);
      },
    })
  );

  const exitCode = await installProcess.exit;

  if (exitCode !== 0) {
    throw new Error('npm install failed');
  }

  log('✅ Dependencies installed!');
}

// Start the dev server
async function startServer() {
  log('🚀 Starting server...');

  serverProcess = await webcontainerInstance.spawn('npm', ['start']);

  serverProcess.output.pipeTo(
    new WritableStream({
      write(data) {
        log(data);
      },
    })
  );
}

// Write file and restart server
async function updateFile(contents) {
  await webcontainerInstance.fs.writeFile('/index.js', contents);
  log('📝 File updated, restarting server...');

  if (serverProcess) {
    serverProcess.kill();
  }

  await startServer();
}

// Main boot sequence
async function boot() {
  try {
    log('⚡ Booting WebContainer...');
    setStatus('Booting...', 'loading');

    webcontainerInstance = await WebContainer.boot();
    log('✅ WebContainer booted!');

    log('📂 Mounting files...');
    await webcontainerInstance.mount(files);

    // Listen for server-ready event
    webcontainerInstance.on('server-ready', (port, url) => {
      log(`🌐 Server ready on port ${port}`);
      setStatus('Ready', 'ready');
      previewEl.src = url;
    });

    await installDependencies();
    await startServer();

    // Listen for editor changes
    editorEl.addEventListener('blur', () => {
      updateFile(editorEl.value);
    });

  } catch (error) {
    log('❌ Error: ' + error.message);
    setStatus('Error', 'error');
    console.error(error);
  }
}

boot();
