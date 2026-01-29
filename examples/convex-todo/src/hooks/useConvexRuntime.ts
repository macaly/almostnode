import { useState, useCallback, useRef } from 'react';
import { VirtualFS } from '@runtime/virtual-fs';
import { Runtime } from '@runtime/runtime';
import { PackageManager } from '@runtime/npm';

interface ConvexFile {
  path: string;
  content: string;
}

const DEFAULT_SCHEMA = `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tasks: defineTable({
    text: v.string(),
    completed: v.boolean(),
    createdAt: v.number(),
  }),
});
`;

const DEFAULT_TASKS = `import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("tasks")
      .order("desc")
      .collect();
  },
});

export const add = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("tasks", {
      text: args.text,
      completed: false,
      createdAt: Date.now(),
    });
  },
});

export const toggle = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (task) {
      await ctx.db.patch(args.id, { completed: !task.completed });
    }
  },
});

export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
`;

const DEFAULT_FILES: ConvexFile[] = [
  { path: 'convex/schema.ts', content: DEFAULT_SCHEMA },
  { path: 'convex/tasks.ts', content: DEFAULT_TASKS },
];

// Convex deploy key - set via environment variable or enter your key in the UI
const CONVEX_DEPLOY_KEY = '';

export function useConvexRuntime() {
  const [files, setFiles] = useState<ConvexFile[]>(DEFAULT_FILES);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState<string>('Ready - Click Deploy to connect');
  const [convexUrl, setConvexUrl] = useState<string | null>(null);

  // Keep refs to runtime objects
  const vfsRef = useRef<VirtualFS | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const pmRef = useRef<PackageManager | null>(null);

  const updateFile = useCallback((path: string, content: string) => {
    setFiles(prev => prev.map(f => f.path === path ? { ...f, content } : f));
  }, []);

  const deploy = useCallback(async () => {
    setIsDeploying(true);
    setDeployStatus('Initializing runtime...');

    try {
      // Create virtual file system if not exists
      if (!vfsRef.current) {
        vfsRef.current = new VirtualFS();
      }
      const vfs = vfsRef.current;

      // Create runtime if not exists
      if (!runtimeRef.current) {
        runtimeRef.current = new Runtime(vfs, { cwd: '/project' });
      }
      const runtime = runtimeRef.current;

      // Create package manager if not exists
      if (!pmRef.current) {
        pmRef.current = new PackageManager(vfs, { cwd: '/project' });
      }
      const pm = pmRef.current;

      setDeployStatus('Setting up project structure...');

      // Create project directory structure
      vfs.mkdirSync('/project', { recursive: true });
      vfs.mkdirSync('/project/convex', { recursive: true });

      // Create package.json
      vfs.writeFileSync('/project/package.json', JSON.stringify({
        name: 'convex-todo-demo',
        version: '1.0.0',
        dependencies: {
          convex: '^1.0.0'
        }
      }, null, 2));

      // Also create package.json at root (CLI looks for it)
      vfs.writeFileSync('/package.json', JSON.stringify({
        name: 'convex-todo-demo',
        version: '1.0.0',
        dependencies: {
          convex: '^1.0.0'
        }
      }, null, 2));

      // Create convex.json configuration
      vfs.writeFileSync('/project/convex.json', JSON.stringify({
        functions: "convex/"
      }, null, 2));

      // Create a minimal convex.config.ts (required by the CLI's bundler)
      // The CLI tries both .js and .ts versions
      // Must use defineApp() to create proper export structure
      vfs.writeFileSync('/project/convex/convex.config.ts', `
import { defineApp } from "convex/server";
const app = defineApp();
export default app;
`);
      vfs.writeFileSync('/project/convex/convex.config.js', `
import { defineApp } from "convex/server";
const app = defineApp();
export default app;
`);

      // Write user's convex files
      for (const file of files) {
        const fullPath = `/project/${file.path}`;
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        if (!vfs.existsSync(dir)) {
          vfs.mkdirSync(dir, { recursive: true });
        }
        vfs.writeFileSync(fullPath, file.content);
      }

      setDeployStatus('Installing Convex package...');

      // Install convex package
      const result = await pm.install('convex', {
        onProgress: (msg) => {
          console.log('[npm]', msg);
          setDeployStatus(msg);
        }
      });
      console.log('Installed packages:', result.added);

      setDeployStatus('Deploying to Convex...');

      // Run Convex CLI
      const cliCode = `
        // Set environment for Convex CLI
        process.env.CONVEX_DEPLOY_KEY = '${CONVEX_DEPLOY_KEY}';

        // Set CLI arguments
        process.argv = ['node', 'convex', 'dev', '--once'];

        // Run the CLI
        require('./node_modules/convex/dist/cli.bundle.cjs');
      `;

      try {
        runtime.execute(cliCode, '/project/cli-runner.js');
      } catch (cliError) {
        // Some errors are expected (like process.exit or stack overflow in watcher)
        // The important work (deployment) happens before these errors
        console.log('CLI completed with:', (cliError as Error).message);
      }

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check if deployment succeeded by reading .env.local
      if (vfs.existsSync('/project/.env.local')) {
        const envLocal = vfs.readFileSync('/project/.env.local', 'utf8');
        console.log('.env.local contents:', envLocal);

        // Check if generated files were created (indicates functions were pushed)
        const generatedPaths = [
          '/project/convex/_generated',
          '/convex/_generated',  // CLI might use root path
        ];
        let generatedDir = null;
        for (const path of generatedPaths) {
          if (vfs.existsSync(path)) {
            generatedDir = path;
            break;
          }
        }

        if (generatedDir) {
          const generated = vfs.readdirSync(generatedDir);
          console.log('Generated files:', generated);
        } else {
          console.log('No _generated directory found - functions may not have been pushed');
        }

        // Parse the Convex URL from .env.local
        const urlMatch = envLocal.match(/CONVEX_URL=(.+)/);
        if (urlMatch) {
          const url = urlMatch[1].trim();
          setConvexUrl(url);
          setDeployStatus(`Connected to ${url}`);
        } else {
          throw new Error('Deployment completed but CONVEX_URL not found');
        }
      } else {
        throw new Error('Deployment failed - .env.local not created');
      }

    } catch (error) {
      console.error('Deploy error:', error);
      setDeployStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeploying(false);
    }
  }, [files]);

  return {
    isDeploying,
    deployStatus,
    convexUrl,
    deploy,
    files,
    updateFile,
  };
}
