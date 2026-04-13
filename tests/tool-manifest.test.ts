import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const indexPath = resolve(process.cwd(), "src/index.ts");
const indexSource = readFileSync(indexPath, "utf8");

type ToolExpectation = {
  name: string;
  requiredSnippets?: string[];
};

const expectedTools: ToolExpectation[] = [
  {
    name: "search_functions",
    requiredSnippets: ["default(30)"],
  },
  {
    name: "search_events",
    requiredSnippets: ["default(30)"],
  },
  {
    name: "find_functions_for_task",
    requiredSnippets: ["default(10)"],
  },
  {
    name: "find_events_for_task",
    requiredSnippets: ["default(10)"],
  },
  {
    name: "get_function_docs",
    requiredSnippets: [
      "include_optional_arguments",
      "default(false)",
      "use_cache",
    ],
  },
  {
    name: "get_function_examples",
  },
  {
    name: "get_multiple_function_docs",
    requiredSnippets: [
      "function_names",
      "include_examples",
      "include_optional_arguments",
      "default(false)",
    ],
  },
  {
    name: "list_functions_by_category",
  },
  {
    name: "get_cache_stats",
  },
  {
    name: "recommend_doc_workflow",
  },
  {
    name: "clear_cache",
  },
];

const expectedPrompts = ["resource_structure", "mcp_usage_policy"];

describe("tool and prompt manifest", () => {
  test("registers the expected tool names", () => {
    const matches = [
      ...indexSource.matchAll(/server\.registerTool\(\s*"([^"]+)"/g),
    ];
    const toolNames = matches.map((match) => match[1]);

    expect(toolNames).toHaveLength(expectedTools.length);
    expect(toolNames).toEqual(expectedTools.map((item) => item.name));
  });

  test("registers the expected prompt names", () => {
    const matches = [
      ...indexSource.matchAll(/server\.registerPrompt\(\s*"([^"]+)"/g),
    ];
    const promptNames = matches.map((match) => match[1]);

    expect(promptNames).toEqual(expectedPrompts);
  });

  test("includes required schema snippets for critical tools", () => {
    for (const tool of expectedTools) {
      if (!tool.requiredSnippets || tool.requiredSnippets.length === 0) {
        continue;
      }

      const startMarker = `server.registerTool(\n  "${tool.name}"`;
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

      const block = indexSource.slice(toolStart, end);

      for (const snippet of tool.requiredSnippets) {
        expect(block).toContain(snippet);
      }
    }
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
