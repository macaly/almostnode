/**
 * child_process integration tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import { Runtime } from '../src/runtime';

describe('child_process Integration', () => {
  let vfs: VirtualFS;
  let runtime: Runtime;
  let consoleOutput: string[] = [];

  beforeEach(() => {
    vfs = new VirtualFS();
    consoleOutput = [];
    runtime = new Runtime(vfs, {
      onConsole: (method, args) => {
        consoleOutput.push(args.join(' '));
      },
    });
  });

  describe('exec', () => {
    it('should execute echo command', async () => {
      // Create a test file
      vfs.writeFileSync('/test.txt', 'hello world');

      const code = `
const { exec } = require('child_process');

exec('echo "Hello from bash"', (error, stdout, stderr) => {
  if (error) {
    console.log('error:', error.message);
    return;
  }
  console.log('stdout:', stdout.trim());
});
      `;

      runtime.execute(code, '/test.js');

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleOutput.some(o => o.includes('Hello from bash'))).toBe(true);
    });

    it('should execute ls command', async () => {
      // Create some test files
      vfs.writeFileSync('/file1.txt', 'content1');
      vfs.writeFileSync('/file2.txt', 'content2');

      // Re-create runtime to pick up new files
      runtime = new Runtime(vfs, {
        onConsole: (method, args) => {
          consoleOutput.push(args.join(' '));
        },
      });

      const code = `
const { exec } = require('child_process');

exec('ls /', (error, stdout, stderr) => {
  if (error) {
    console.log('error:', error.message);
    return;
  }
  console.log('files:', stdout);
});
      `;

      runtime.execute(code, '/test.js');

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleOutput.some(o => o.includes('file1.txt') || o.includes('files:'))).toBe(true);
    });

    it('should execute cat command', async () => {
      vfs.writeFileSync('/hello.txt', 'Hello, World!');

      // Re-create runtime to pick up new files
      runtime = new Runtime(vfs, {
        onConsole: (method, args) => {
          consoleOutput.push(args.join(' '));
        },
      });

      const code = `
const { exec } = require('child_process');

exec('cat /hello.txt', (error, stdout, stderr) => {
  if (error) {
    console.log('error:', error.message);
    return;
  }
  console.log('content:', stdout);
});
      `;

      runtime.execute(code, '/test.js');

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleOutput.some(o => o.includes('Hello, World!'))).toBe(true);
    });
  });

  describe('spawn', () => {
    it('should spawn echo command and emit exit', async () => {
      const code = `
const { spawn } = require('child_process');

const child = spawn('echo', ['Hello', 'World']);

child.on('close', (code) => {
  console.log('exit code:', code);
});

child.on('exit', (code) => {
  console.log('process exited with:', code);
});
      `;

      runtime.execute(code, '/test.js');

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that the process completed successfully
      expect(consoleOutput.some(o => o.includes('exit code: 0') || o.includes('process exited with: 0'))).toBe(true);
    });
  });

  describe('shell features', () => {
    it('should support pipes', async () => {
      const code = `
const { exec } = require('child_process');

exec('echo "line1\\nline2\\nline3" | wc -l', (error, stdout, stderr) => {
  if (error) {
    console.log('error:', error.message);
    return;
  }
  console.log('lines:', stdout.trim());
});
      `;

      runtime.execute(code, '/test.js');

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleOutput.some(o => o.includes('3') || o.includes('lines:'))).toBe(true);
    });

    it('should support command chaining with &&', async () => {
      const code = `
const { exec } = require('child_process');

exec('echo "first" && echo "second"', (error, stdout, stderr) => {
  if (error) {
    console.log('error:', error.message);
    return;
  }
  console.log('output:', stdout);
});
      `;

      runtime.execute(code, '/test.js');

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleOutput.some(o => o.includes('first') && o.includes('second'))).toBe(true);
    });
  });
});
