/**
 * Tailwind Config Loader
 *
 * Parses tailwind.config.ts files and generates JavaScript to configure
 * the Tailwind CDN at runtime via window.tailwind.config.
 */

import type { VirtualFS } from '../virtual-fs';

export interface TailwindConfigResult {
  /** JavaScript code to set window.tailwind.config (empty string if no config) */
  configScript: string;
  /** Whether config was successfully loaded */
  success: boolean;
  /** Error message if loading failed */
  error?: string;
}

/** Config file names to search for, in priority order */
const CONFIG_FILE_NAMES = [
  '/tailwind.config.ts',
  '/tailwind.config.js',
  '/tailwind.config.mjs',
];

/**
 * Load and parse a Tailwind config file from VirtualFS
 */
export async function loadTailwindConfig(
  vfs: VirtualFS,
  root: string = '/'
): Promise<TailwindConfigResult> {
  // Find config file
  let configPath: string | null = null;
  let configContent: string | null = null;

  for (const fileName of CONFIG_FILE_NAMES) {
    const fullPath = root === '/' ? fileName : `${root}${fileName}`;
    try {
      const content = vfs.readFileSync(fullPath);
      configContent =
        typeof content === 'string'
          ? content
          : content instanceof Uint8Array
            ? new TextDecoder('utf-8').decode(content)
            : Buffer.from(content).toString('utf-8');
      configPath = fullPath;
      break;
    } catch {
      // File not found, try next
      continue;
    }
  }

  if (!configPath || configContent === null) {
    return {
      configScript: '',
      success: true, // Not an error, just no config
    };
  }

  try {
    // Strip TypeScript syntax and extract config object
    const jsConfig = stripTypescriptSyntax(configContent);
    const configObject = extractConfigObject(jsConfig);

    if (!configObject) {
      return {
        configScript: '',
        success: false,
        error: 'Could not extract config object from tailwind.config',
      };
    }

    // Generate the script to inject
    const configScript = generateConfigScript(configObject);

    return {
      configScript,
      success: true,
    };
  } catch (error) {
    return {
      configScript: '',
      success: false,
      error: `Failed to parse tailwind.config: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Strip TypeScript-specific syntax from config content
 */
export function stripTypescriptSyntax(content: string): string {
  let result = content;

  // Remove import type statements
  // e.g., import type { Config } from "tailwindcss"
  result = result.replace(/import\s+type\s+\{[^}]*\}\s+from\s+['"][^'"]*['"]\s*;?\s*/g, '');

  // Remove regular import statements (Config type, etc.)
  // e.g., import { Config } from "tailwindcss"
  result = result.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"]\s*;?\s*/g, '');

  // Remove satisfies Type assertions
  // e.g., } satisfies Config
  result = result.replace(/\s+satisfies\s+\w+\s*$/gm, '');
  result = result.replace(/\s+satisfies\s+\w+\s*;?\s*$/gm, '');

  // Remove type annotations on variables
  // e.g., const config: Config = { ... }
  result = result.replace(/:\s*Config\s*=/g, ' =');

  // Remove 'as const' assertions
  result = result.replace(/\s+as\s+const\s*/g, ' ');

  return result;
}

/**
 * Extract the config object from the processed content
 */
export function extractConfigObject(content: string): string | null {
  // Look for export default { ... }
  // We need to find the opening brace and match it to the closing brace

  // First, find "export default"
  const exportDefaultMatch = content.match(/export\s+default\s*/);
  if (!exportDefaultMatch || exportDefaultMatch.index === undefined) {
    return null;
  }

  const startIndex = exportDefaultMatch.index + exportDefaultMatch[0].length;
  const remaining = content.substring(startIndex);

  // Check if it starts with an object literal
  const trimmedRemaining = remaining.trimStart();
  if (!trimmedRemaining.startsWith('{')) {
    return null;
  }

  // Find the matching closing brace
  const objectStart = startIndex + (remaining.length - trimmedRemaining.length);
  const objectContent = content.substring(objectStart);

  let braceCount = 0;
  let inString = false;
  let stringChar = '';
  let escaped = false;
  let endIndex = -1;

  for (let i = 0; i < objectContent.length; i++) {
    const char = objectContent[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (inString) {
      if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }

  if (endIndex === -1) {
    return null;
  }

  return objectContent.substring(0, endIndex);
}

/**
 * Generate the script to inject the Tailwind config
 */
export function generateConfigScript(configObject: string): string {
  // Wrap in a script that sets tailwind.config
  // This must run AFTER the Tailwind CDN script loads
  // The CDN creates the global `tailwind` object, then we configure it
  return `<script>
  tailwind.config = ${configObject};
</script>`;
}
