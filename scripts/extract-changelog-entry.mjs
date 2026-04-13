import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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

const releaseHeadingPattern = new RegExp(
  `^## \\[${packageVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\] - .*$`,
  "m",
);
const releaseHeadingMatch = changelogText.match(releaseHeadingPattern);

if (!releaseHeadingMatch?.[0]) {
  throw new Error(
    `Could not find release section heading for version ${packageVersion} in CHANGELOG.md.`,
  );
}

const sectionStart = releaseHeadingMatch.index ?? -1;
if (sectionStart < 0) {
  throw new Error("Failed to locate changelog section start index.");
}

const nextHeadingIndex = changelogText.indexOf("\n## [", sectionStart + 1);
const sectionEnd = nextHeadingIndex === -1 ? changelogText.length : nextHeadingIndex;
const releaseSection = changelogText.slice(sectionStart, sectionEnd).trimEnd();

const outputPath = resolve(process.cwd(), "release-notes.md");
await writeFile(outputPath, `${releaseSection}\n`, "utf8");

console.log(`Release notes extracted to ${outputPath}`);
