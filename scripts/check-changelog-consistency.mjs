import { readFile } from "node:fs/promises";

const packageJsonText = await readFile(new URL("../package.json", import.meta.url), {
  encoding: "utf8",
});
const packageJson = JSON.parse(packageJsonText);
const packageVersion = packageJson.version;

if (typeof packageVersion !== "string" || packageVersion.trim().length === 0) {
  throw new Error("Could not read package.json version.");
}

const changelogText = await readFile(new URL("../CHANGELOG.md", import.meta.url), {
  encoding: "utf8",
});

if (!/^## \[Unreleased\]\s*$/m.test(changelogText)) {
  throw new Error("CHANGELOG.md must contain a '## [Unreleased]' section.");
}

const escapedVersion = packageVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const releaseHeadingPattern = new RegExp(
  `^## \\[${escapedVersion}\\] - \\d{4}-\\d{2}-\\d{2}\\s*$`,
  "m",
);

if (!releaseHeadingPattern.test(changelogText)) {
  throw new Error(
    `CHANGELOG.md is missing a release heading for version ${packageVersion}. Expected format: ## [${packageVersion}] - YYYY-MM-DD`,
  );
}

console.log(`Changelog check passed for version ${packageVersion}.`);
