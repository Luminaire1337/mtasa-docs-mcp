import { readFile } from "node:fs/promises";

const filesToCheck = [
  "README.md",
  "FEATURES.md",
  "AGENTS.md",
  "src/index.ts",
];

const legacyNamePatterns = [
  /\bsearch_mtasa_\w+\b/g,
  /\bfind_mtasa_\w+\b/g,
  /\bget_mtasa_\w+\b/g,
  /\blist_mtasa_\w+\b/g,
  /\brecommend_mtasa_\w+\b/g,
  /\bclear_mtasa_\w+\b/g,
  /\bmtasa_resource_structure\b/g,
  /\bmtasa_mcp_usage_policy\b/g,
];

const issues = [];

for (const relativePath of filesToCheck) {
  const content = await readFile(new URL(`../${relativePath}`, import.meta.url), {
    encoding: "utf8",
  });

  for (const pattern of legacyNamePatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);
    if (match) {
      issues.push(`${relativePath}: found legacy name "${match[0]}"`);
    }
  }
}

if (issues.length > 0) {
  throw new Error(
    `Legacy mtasa-prefixed tool/prompt names found:\n${issues.join("\n")}`,
  );
}

console.log("Tool-name drift check passed.");
