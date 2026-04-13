import { readFile } from "node:fs/promises";

const packageJsonText = await readFile(new URL("../package.json", import.meta.url), {
  encoding: "utf8",
});
const packageJson = JSON.parse(packageJsonText);
const packageVersion = packageJson.version;

if (typeof packageVersion !== "string" || packageVersion.trim().length === 0) {
  throw new Error("Could not read package.json version.");
}

const ref = process.env.GITHUB_REF ?? "";
const refName = process.env.GITHUB_REF_NAME ?? "";
const tag = refName || ref.replace("refs/tags/", "");

if (!tag) {
  throw new Error(
    "Release tag was not provided. Ensure this script runs on a tag workflow.",
  );
}

const expectedTag = `v${packageVersion}`;
if (tag !== expectedTag) {
  throw new Error(`Release tag mismatch: expected ${expectedTag}, received ${tag}`);
}

console.log(`Release tag check passed: ${tag}`);
