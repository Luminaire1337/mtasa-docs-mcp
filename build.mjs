import * as esbuild from "esbuild";

console.log("Bundling with esbuild...");
await esbuild.build({
  entryPoints: ["./src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outfile: "./build/index.js",
  minify: true,
  sourcemap: false,
  external: ["better-sqlite3", "@sqliteai/sqlite-vector"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});

console.log("Build complete!");
