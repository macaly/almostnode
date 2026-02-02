import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualFS } from '../src/virtual-fs';
import {
  loadTailwindConfig,
  stripTypescriptSyntax,
  extractConfigObject,
  generateConfigScript,
} from '../src/frameworks/tailwind-config-loader';

describe('TailwindConfigLoader', () => {
  let vfs: VirtualFS;

  beforeEach(() => {
    vfs = new VirtualFS();
  });

  describe('loadTailwindConfig', () => {
    it('should return empty script when no config file exists', async () => {
      const result = await loadTailwindConfig(vfs);
      expect(result.success).toBe(true);
      expect(result.configScript).toBe('');
      expect(result.error).toBeUndefined();
    });

    it('should load tailwind.config.ts', async () => {
      vfs.writeFileSync(
        '/tailwind.config.ts',
        `export default {
  content: ["./app/**/*.tsx"],
  theme: {
    extend: {
      colors: {
        brand: "#ff0000"
      }
    }
  }
}`
      );

      const result = await loadTailwindConfig(vfs);
      expect(result.success).toBe(true);
      expect(result.configScript).toContain('tailwind.config');
      expect(result.configScript).toContain('brand');
      expect(result.configScript).toContain('#ff0000');
    });

    it('should load tailwind.config.js as fallback', async () => {
      vfs.writeFileSync(
        '/tailwind.config.js',
        `export default {
  content: ["./pages/**/*.jsx"]
}`
      );

      const result = await loadTailwindConfig(vfs);
      expect(result.success).toBe(true);
      expect(result.configScript).toContain('tailwind.config');
      expect(result.configScript).toContain('./pages/**/*.jsx');
    });

    it('should prefer tailwind.config.ts over tailwind.config.js', async () => {
      vfs.writeFileSync(
        '/tailwind.config.ts',
        `export default { theme: { extend: { colors: { ts: "blue" } } } }`
      );
      vfs.writeFileSync(
        '/tailwind.config.js',
        `export default { theme: { extend: { colors: { js: "red" } } } }`
      );

      const result = await loadTailwindConfig(vfs);
      expect(result.success).toBe(true);
      expect(result.configScript).toContain('ts');
      expect(result.configScript).not.toContain('"js"');
    });

    it('should load config from custom root', async () => {
      vfs.mkdirSync('/myapp', { recursive: true });
      vfs.writeFileSync(
        '/myapp/tailwind.config.ts',
        `export default { content: ["./src/**/*.tsx"] }`
      );

      const result = await loadTailwindConfig(vfs, '/myapp');
      expect(result.success).toBe(true);
      expect(result.configScript).toContain('./src/**/*.tsx');
    });

    it('should handle TypeScript with import type', async () => {
      vfs.writeFileSync(
        '/tailwind.config.ts',
        `import type { Config } from "tailwindcss"

export default {
  darkMode: ["class"],
  content: ["./app/**/*.tsx"]
} satisfies Config`
      );

      const result = await loadTailwindConfig(vfs);
      expect(result.success).toBe(true);
      expect(result.configScript).toContain('darkMode');
      expect(result.configScript).not.toContain('import type');
      expect(result.configScript).not.toContain('satisfies');
    });

    it('should handle CSS variables in config', async () => {
      vfs.writeFileSync(
        '/tailwind.config.ts',
        `export default {
  theme: {
    extend: {
      colors: {
        brand: {
          500: "var(--brand-500)",
          600: "var(--brand-600)"
        }
      }
    }
  }
}`
      );

      const result = await loadTailwindConfig(vfs);
      expect(result.success).toBe(true);
      expect(result.configScript).toContain('var(--brand-500)');
      expect(result.configScript).toContain('var(--brand-600)');
    });

    it('should handle complex nested config', async () => {
      vfs.writeFileSync(
        '/tailwind.config.ts',
        `import type { Config } from "tailwindcss"

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
        serif: ["var(--font-serif)", "serif"]
      },
      colors: {
        brand: {
          25: "var(--brand-25)",
          50: "var(--brand-50)",
          100: "var(--brand-100)"
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)"
        }
      },
      animation: {
        marquee: "marquee var(--duration) linear infinite"
      },
      keyframes: {
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(calc(-100% - var(--gap)))" }
        }
      }
    }
  }
} satisfies Config`
      );

      const result = await loadTailwindConfig(vfs);
      expect(result.success).toBe(true);
      expect(result.configScript).toContain('fontFamily');
      expect(result.configScript).toContain('animation');
      expect(result.configScript).toContain('keyframes');
      expect(result.configScript).toContain('marquee');
    });
  });

  describe('stripTypescriptSyntax', () => {
    it('should remove import type statements', () => {
      const input = `import type { Config } from "tailwindcss"

export default {}`;
      const result = stripTypescriptSyntax(input);
      expect(result).not.toContain('import type');
      expect(result).toContain('export default');
    });

    it('should remove satisfies Type', () => {
      const input = `export default {
  content: []
} satisfies Config`;
      const result = stripTypescriptSyntax(input);
      expect(result).not.toContain('satisfies');
      expect(result).toContain('content');
    });

    it('should remove type annotations on variables', () => {
      const input = `const config: Config = {}`;
      const result = stripTypescriptSyntax(input);
      expect(result).not.toContain(': Config');
      expect(result).toContain('config');
    });

    it('should remove as const assertions', () => {
      const input = `const themes = ["light", "dark"] as const`;
      const result = stripTypescriptSyntax(input);
      expect(result).not.toContain('as const');
      expect(result).toContain('themes');
    });

    it('should remove regular import statements', () => {
      const input = `import { Config } from "tailwindcss"

export default {}`;
      const result = stripTypescriptSyntax(input);
      expect(result).not.toContain('import');
      expect(result).toContain('export default');
    });

    it('should preserve non-TypeScript content', () => {
      const input = `export default {
  darkMode: ["class"],
  content: ["./app/**/*.tsx"],
  theme: {
    extend: {
      colors: {
        brand: "var(--brand-500)"
      }
    }
  }
}`;
      const result = stripTypescriptSyntax(input);
      expect(result).toContain('darkMode');
      expect(result).toContain('content');
      expect(result).toContain('theme');
      expect(result).toContain('var(--brand-500)');
    });
  });

  describe('extractConfigObject', () => {
    it('should extract simple export default object', () => {
      const input = `export default { content: [] }`;
      const result = extractConfigObject(input);
      expect(result).toBe('{ content: [] }');
    });

    it('should extract multi-line object', () => {
      const input = `export default {
  content: ["./app/**/*.tsx"],
  theme: {
    extend: {}
  }
}`;
      const result = extractConfigObject(input);
      expect(result).toContain('content');
      expect(result).toContain('theme');
      expect(result).toContain('extend');
    });

    it('should handle strings with braces', () => {
      const input = `export default {
  content: ["./app/{page,layout}.tsx"]
}`;
      const result = extractConfigObject(input);
      expect(result).toContain('{page,layout}');
    });

    it('should return null for non-object exports', () => {
      const input = `export default someVariable`;
      const result = extractConfigObject(input);
      expect(result).toBeNull();
    });

    it('should return null when no export default', () => {
      const input = `const config = {}`;
      const result = extractConfigObject(input);
      expect(result).toBeNull();
    });

    it('should handle deeply nested objects', () => {
      const input = `export default {
  theme: {
    extend: {
      colors: {
        brand: {
          light: {
            100: "#fff"
          }
        }
      }
    }
  }
}`;
      const result = extractConfigObject(input);
      expect(result).toContain('brand');
      expect(result).toContain('light');
      expect(result).toContain('100');
      expect(result).toContain('#fff');
    });
  });

  describe('generateConfigScript', () => {
    it('should wrap config in script tag', () => {
      const config = `{ content: [] }`;
      const result = generateConfigScript(config);
      expect(result).toContain('<script>');
      expect(result).toContain('</script>');
      expect(result).toContain('tailwind.config');
    });

    it('should set tailwind.config', () => {
      const config = `{ theme: { colors: { brand: "blue" } } }`;
      const result = generateConfigScript(config);
      expect(result).toContain('tailwind.config = { theme:');
    });

    it('should not initialize window.tailwind (CDN creates it)', () => {
      const config = `{}`;
      const result = generateConfigScript(config);
      // CDN creates the tailwind global, we just set config on it
      expect(result).not.toContain('window.tailwind = window.tailwind');
      expect(result).toContain('tailwind.config = {}');
    });
  });

  describe('integration: config injection in HTML', () => {
    it('should generate config that can be evaluated', async () => {
      vfs.writeFileSync(
        '/tailwind.config.ts',
        `export default {
  content: ["./app/**/*.tsx"],
  theme: {
    extend: {
      colors: {
        primary: "#0066cc"
      }
    }
  }
}`
      );

      const result = await loadTailwindConfig(vfs);
      expect(result.success).toBe(true);

      // The script should be valid JavaScript
      // We can't actually eval it in Node, but we can check it's well-formed
      // Config is set on the tailwind global created by the CDN
      expect(result.configScript).toMatch(/<script>\s*tailwind\.config = \{/);
      expect(result.configScript).toMatch(/\};\s*<\/script>/);
    });
  });

  describe('error handling', () => {
    it('should handle empty config file', async () => {
      vfs.writeFileSync('/tailwind.config.ts', '');

      const result = await loadTailwindConfig(vfs);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Could not extract');
    });

    it('should handle malformed config', async () => {
      vfs.writeFileSync('/tailwind.config.ts', 'export default {');

      const result = await loadTailwindConfig(vfs);
      expect(result.success).toBe(false);
    });

    it('should handle config without export default', async () => {
      vfs.writeFileSync(
        '/tailwind.config.ts',
        `const config = { content: [] };
module.exports = config;`
      );

      const result = await loadTailwindConfig(vfs);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Could not extract');
    });
  });
});
