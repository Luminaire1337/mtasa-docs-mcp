#!/usr/bin/env node
import { execSync } from "child_process";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  symlinkSync,
  unlinkSync,
} from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const vectorVersion =
  pkg.dependencies["@sqliteai/sqlite-vector"] ||
  pkg.optionalDependencies?.["@sqliteai/sqlite-vector"];
const version = vectorVersion?.replace(/^[\^~]/, "") || "latest";

const platform = process.platform;
const arch = process.arch;
// Convert Node.js arch to package naming convention
const archName = arch === "x64" ? "x86_64" : arch === "arm64" ? "arm64" : arch;
const platformName = `${platform}-${archName}`;
const packageName = `@sqliteai/sqlite-vector-${platformName}`;

// Detect package manager from user agent or packageManager field
const getPackageManager = () => {
  const userAgent = process.env.npm_config_user_agent || "";

  if (userAgent.includes("pnpm")) return "pnpm";
  if (userAgent.includes("yarn")) return "yarn";
  if (userAgent.includes("bun")) return "bun";

  // Check packageManager field as fallback
  if (pkg.packageManager?.startsWith("pnpm")) return "pnpm";
  if (pkg.packageManager?.startsWith("yarn")) return "yarn";
  if (pkg.packageManager?.startsWith("bun")) return "bun";

  return "npm";
};

const pm = getPackageManager();

// Check if we're in a workspace (pnpm only)
const isWorkspace = pm === "pnpm" && pkg.packageManager?.startsWith("pnpm");

const installCmd =
  pm === "yarn"
    ? `${pm} add ${packageName}@${version}`
    : pm === "pnpm"
    ? isWorkspace
      ? `${pm} add ${packageName}@${version} -w`
      : `${pm} add ${packageName}@${version}`
    : pm === "bun"
    ? `${pm} add ${packageName}@${version}`
    : `${pm} install --no-save ${packageName}@${version}`;

console.log(
  `Installing SQLite vector extension for ${platformName} (v${version}) using ${pm}...`
);

try {
  execSync(installCmd, { stdio: "inherit" });
  console.log("✓ Vector extension installed successfully");

  // For pnpm, create symlink in top-level node_modules for library compatibility
  if (pm === "pnpm") {
    const nodeModulesPath = join(__dirname, "..", "node_modules");
    const targetDir = join(
      nodeModulesPath,
      "@sqliteai",
      `sqlite-vector-${platformName}`
    );
    const sourceDir = join(
      nodeModulesPath,
      ".pnpm",
      `@sqliteai+sqlite-vector-${platformName}@${version}`,
      "node_modules",
      "@sqliteai",
      `sqlite-vector-${platformName}`
    );

    if (existsSync(sourceDir)) {
      // Remove old symlink if exists
      if (existsSync(targetDir)) {
        try {
          unlinkSync(targetDir);
        } catch {}
      }

      // Ensure @sqliteai directory exists
      const sqliteaiDir = join(nodeModulesPath, "@sqliteai");
      if (!existsSync(sqliteaiDir)) {
        mkdirSync(sqliteaiDir, { recursive: true });
      }

      // Create symlink
      symlinkSync(sourceDir, targetDir, "dir");
      console.log(`✓ Created symlink for pnpm compatibility`);
    }
  }
} catch (error) {
  console.error("✗ Failed to install vector extension:", error.message);
  process.exit(1);
}
