import { readFile } from "node:fs/promises";

const packageJsonText = await readFile(new URL("./package.json", import.meta.url), {
  encoding: "utf8",
});
const packageJson = JSON.parse(packageJsonText);
const packageVersion = packageJson.version;

if (typeof packageVersion !== "string" || packageVersion.trim().length === 0) {
  throw new Error("Could not read package.json version.");
}

const indexSource = await readFile(new URL("./src/index.ts", import.meta.url), {
  encoding: "utf8",
});

const versionMatch = indexSource.match(/version:\s*"([^"]+)"/);
if (!versionMatch) {
  throw new Error('Could not find server version in src/index.ts (expected `version: "..."`).');
}

const [, serverVersion] = versionMatch;
if (!serverVersion) {
  throw new Error("Server version capture failed.");
}

if (serverVersion !== packageVersion) {
  throw new Error(
    `Version mismatch: package.json=${packageVersion}, src/index.ts=${serverVersion}`,
  );
}

console.log(`Version check passed: ${packageVersion}`);
