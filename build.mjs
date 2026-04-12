import * as esbuild from "esbuild";
import { chmodSync } from "node:fs";

console.log("Bundling with esbuild...");
const watchMode = process.argv.includes("--watch");

await esbuild.build({
  entryPoints: ["./src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "./build/index.js",
  treeShaking: true,
  minify: true,
  sourcemap: false,
  external: ["better-sqlite3", "@sqliteai/sqlite-vector"],
  banner: {
    js: "#!/usr/bin/env node",
  },
  logLevel: "info",
  legalComments: "none",
  metafile: watchMode,
});

try {
  chmodSync("./build/index.js", 0o755);
} catch {
  // Ignore chmod errors on platforms that do not use POSIX permissions.
}

console.log("Build complete!");
