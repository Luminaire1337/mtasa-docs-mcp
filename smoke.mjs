import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new Client(
  {
    name: "mtasa-docs-smoke-client",
    version: "0.1.0",
  },
  {
    capabilities: {},
  },
);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(__dirname, "build/index.js")],
  cwd: __dirname,
});

const getTextContent = (result) => {
  const chunks = Array.isArray(result?.content) ? result.content : [];
  return chunks
    .map((chunk) => (chunk?.type === "text" ? chunk.text : ""))
    .join("\n");
};

const expectIncludes = (value, expected, context) => {
  if (!value.includes(expected)) {
    throw new Error(`${context} did not include expected text: ${expected}`);
  }
};

try {
  await client.connect(transport);

  const toolsResponse = await client.listTools();
  const toolNames = new Set((toolsResponse.tools ?? []).map((tool) => tool.name));
  const requiredTools = [
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

  for (const toolName of requiredTools) {
    if (!toolNames.has(toolName)) {
      throw new Error(`Missing required tool in listTools: ${toolName}`);
    }
  }

  const promptsResponse = await client.listPrompts();
  const promptNames = new Set(
    (promptsResponse.prompts ?? []).map((prompt) => prompt.name),
  );
  for (const promptName of ["resource_structure", "mcp_usage_policy"]) {
    if (!promptNames.has(promptName)) {
      throw new Error(`Missing required prompt in listPrompts: ${promptName}`);
    }
  }

  const searchResult = await client.callTool({
    name: "search_functions",
    arguments: {
      query: "vehicle",
      limit: 5,
    },
  });
  expectIncludes(getTextContent(searchResult), "MTA:SA functions/events", "search_functions");

  const eventResult = await client.callTool({
    name: "search_events",
    arguments: {
      query: "onPlayer",
      limit: 5,
    },
  });
  expectIncludes(getTextContent(eventResult), "MTA:SA events", "search_events");

  const singleDocResult = await client.callTool({
    name: "get_function_docs",
    arguments: {
      function_name: "",
      use_cache: true,
    },
  });
  expectIncludes(
    getTextContent(singleDocResult),
    "Function name is required.",
    "get_function_docs",
  );

  const multiDocResult = await client.callTool({
    name: "get_multiple_function_docs",
    arguments: {
      function_names: ["__definitely_not_existing_function__"],
      include_examples: false,
      include_optional_arguments: false,
    },
  });
  expectIncludes(
    getTextContent(multiDocResult),
    "Documentation for Multiple MTA:SA Entries",
    "get_multiple_function_docs",
  );
  expectIncludes(
    getTextContent(multiDocResult),
    "Optional arguments are hidden by default.",
    "get_multiple_function_docs",
  );

  console.log("Smoke tests passed.");
} finally {
  await client.close().catch(() => undefined);
  await transport.close().catch(() => undefined);
}
