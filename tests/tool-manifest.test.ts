import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const indexPath = resolve(process.cwd(), "src/index.ts");
const smokePath = resolve(process.cwd(), "scripts/smoke.mjs");
const indexSource = readFileSync(indexPath, "utf8");
const smokeSource = readFileSync(smokePath, "utf8");

const requiredCoreTools = [
  "search_functions",
  "search_events",
  "find_functions_for_task",
  "find_events_for_task",
  "get_function_docs",
  "get_function_examples",
  "get_multiple_function_docs",
  "list_functions_by_category",
  "get_cache_stats",
  "recommend_doc_workflow",
  "clear_cache",
];

const requiredPrompts = ["resource_structure", "mcp_usage_policy"];

const criticalToolSchemaSnippets: Record<string, string[]> = {
  search_functions: ["default(30)"],
  search_events: ["default(30)"],
  find_functions_for_task: ["default(10)"],
  find_events_for_task: ["default(10)"],
  get_function_docs: [
    "include_optional_arguments",
    "default(false)",
    "use_cache",
  ],
  get_multiple_function_docs: [
    "function_names",
    "include_examples",
    "include_optional_arguments",
    "default(false)",
  ],
};

const getRegisteredTools = (): string[] => {
  const matches = [
    ...indexSource.matchAll(/server\.registerTool\(\s*"([^"]+)"/g),
  ];
  return matches
    .map((match) => match[1])
    .filter((name): name is string => typeof name === "string");
};

const getRegisteredPrompts = (): string[] => {
  const matches = [
    ...indexSource.matchAll(/server\.registerPrompt\(\s*"([^"]+)"/g),
  ];
  return matches
    .map((match) => match[1])
    .filter((name): name is string => typeof name === "string");
};

const getToolRegistrationBlock = (toolName: string): string => {
  const startMarker = `server.registerTool(\n  "${toolName}"`;
  const toolStart = indexSource.indexOf(startMarker);
  expect(toolStart).toBeGreaterThanOrEqual(0);

  const nextToolStart = indexSource.indexOf(
    "server.registerTool(",
    toolStart + 1,
  );
  const nextPromptStart = indexSource.indexOf(
    "server.registerPrompt(",
    toolStart + 1,
  );
  const end =
    nextToolStart === -1
      ? nextPromptStart === -1
        ? indexSource.length
        : nextPromptStart
      : nextPromptStart === -1
        ? nextToolStart
        : Math.min(nextToolStart, nextPromptStart);

  return indexSource.slice(toolStart, end);
};

describe("tool and prompt manifest", () => {
  test("registers unique tool names and preserves core tools", () => {
    const toolNames = getRegisteredTools();

    expect(toolNames).toEqual(expect.arrayContaining(requiredCoreTools));
    expect(new Set(toolNames).size).toBe(toolNames.length);
  });

  test("registers unique prompt names and preserves core prompts", () => {
    const promptNames = getRegisteredPrompts();

    expect(promptNames).toEqual(expect.arrayContaining(requiredPrompts));
    expect(new Set(promptNames).size).toBe(promptNames.length);
  });

  test("includes required schema snippets for critical tools", () => {
    for (const [toolName, snippets] of Object.entries(
      criticalToolSchemaSnippets,
    )) {
      const block = getToolRegistrationBlock(toolName);
      for (const snippet of snippets) {
        expect(block).toContain(snippet);
      }
    }
  });

  test("smoke test auto-discovers tools and prompts from source", () => {
    expect(smokeSource).toContain(
      'matchAll(/server\\.registerTool\\(\\s*"([^"]+)"/g)',
    );
    expect(smokeSource).toContain(
      'matchAll(/server\\.registerPrompt\\(\\s*"([^"]+)"/g)',
    );
  });

  test("keeps MCP-first fallback policy in prompt guidance", () => {
    const promptStart = indexSource.indexOf(
      'server.registerPrompt(\n  "mcp_usage_policy"',
    );
    expect(promptStart).toBeGreaterThanOrEqual(0);

    const nextPromptStart = indexSource.indexOf(
      "server.registerPrompt(",
      promptStart + 1,
    );
    const promptBlock = indexSource.slice(
      promptStart,
      nextPromptStart === -1 ? indexSource.length : nextPromptStart,
    );

    expect(promptBlock).toContain(
      "Prefer MCP tool output over manual wiki scraping.",
    );
    expect(promptBlock).toContain(
      "Only browse wiki pages manually if MCP tools fail or return incomplete data.",
    );
  });
});
