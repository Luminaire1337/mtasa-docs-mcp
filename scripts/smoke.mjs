import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const serverEntryPath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(projectRoot, "build/index.js");

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
  args: [serverEntryPath],
  cwd: projectRoot,
});

const indexSource = await readFile(resolve(projectRoot, "src/index.ts"), "utf8");
const requiredTools = [
  ...new Set(
    [...indexSource.matchAll(/server\.registerTool\(\s*"([^"]+)"/g)].map(
      (match) => match[1],
    ),
  ),
];
const requiredPrompts = [
  ...new Set(
    [...indexSource.matchAll(/server\.registerPrompt\(\s*"([^"]+)"/g)].map(
      (match) => match[1],
    ),
  ),
];

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

  for (const toolName of requiredTools) {
    if (!toolNames.has(toolName)) {
      throw new Error(`Missing required tool in listTools: ${toolName}`);
    }
  }

  const promptsResponse = await client.listPrompts();
  const promptNames = new Set(
    (promptsResponse.prompts ?? []).map((prompt) => prompt.name),
  );
  for (const promptName of requiredPrompts) {
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
