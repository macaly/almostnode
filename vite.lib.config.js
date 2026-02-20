import { defineConfig } from "vite";
import { resolve } from "path";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [
    wasm(),
    {
      name: "browser-shims",
      enforce: "pre",
      resolveId(source) {
        if (source === "node:zlib" || source === "zlib") {
          return resolve(__dirname, "src/shims/zlib.ts");
        }
        if (source === "brotli-wasm/pkg.web/brotli_wasm.js") {
          return resolve(
            __dirname,
            "node_modules/brotli-wasm/pkg.web/brotli_wasm.js",
          );
        }
        if (source === "brotli-wasm/pkg.web/brotli_wasm_bg.wasm?url") {
          return {
            id:
              resolve(
                __dirname,
                "node_modules/brotli-wasm/pkg.web/brotli_wasm_bg.wasm",
              ) + "?url",
            external: false,
          };
        }
        return null;
      },
    },
  ],
  define: {
    "process.env": {},
    global: "globalThis",
  },
  resolve: {
    alias: {
      "node:zlib": resolve(__dirname, "src/shims/zlib.ts"),
      zlib: resolve(__dirname, "src/shims/zlib.ts"),
      buffer: "buffer",
      process: "process/browser",
    },
  },
  worker: {
    format: "es",
    plugins: () => [wasm()],
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        // Stable filename (no hash) so next-plugin.ts can locate the worker
        // without a glob and consumers can serve it from a predictable path.
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        "vite-plugin": resolve(__dirname, "src/vite-plugin.ts"),
        "next-plugin": resolve(__dirname, "src/next-plugin.ts"),
      },
      name: "JustNode",
      formats: ["es", "cjs"],
      fileName: (format, entryName) =>
        `${entryName}.${format === "es" ? "mjs" : "cjs"}`,
    },
    rollupOptions: {
      external: [
        "brotli-wasm",
        "pako",
        "comlink",
        "just-bash",
        "resolve.exports",
        "brotli",
        // Node.js built-ins for vite-plugin
        "fs",
        "path",
        "url",
        "vite",
      ],
      output: {
        globals: {
          "brotli-wasm": "brotliWasm",
          pako: "pako",
          comlink: "Comlink",
          "just-bash": "justBash",
          "resolve.exports": "resolveExports",
        },
      },
    },
    sourcemap: true,
    minify: false,
  },
  assetsInclude: ["**/*.wasm"],
});
