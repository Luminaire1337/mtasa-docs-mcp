import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { initializeDatabase, closeDatabase } from "./database/connection.js";
import {
  loadMtasaFunctions,
  fetchFunctionDoc,
  canonicalizeFunctionName,
  hydrateFunctionsFromDatabase,
} from "./utils/loader.js";
import {
  searchFunctions,
  findMetadataByName,
  listFunctionsByCategory,
  queries,
} from "./database/queries.js";
import { findRelatedFunctions } from "./utils/search.js";
import { formatDocumentation } from "./utils/formatter.js";
import { db } from "./database/connection.js";
import { DB_PATH, CACHE_DURATION } from "./config/constants.js";
import { z } from "zod";
import type { MtasaFunction } from "./types/interfaces.js";

const server = new McpServer(
  {
    name: "mtasa-docs",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const FUNCTION_CATEGORIES = [
  "Lua Keywords",
  "Standard Lua Functions",
  "Data Types/Classes",
  "MTA:SA Shared Functions",
  "Client Functions",
  "Server Functions",
  "Client Events",
  "Server Events",
] as const;

const MAX_BULK_DOCS = 25;

const normalizeFunctionInput = (value: string): string => {
  return canonicalizeFunctionName(value.trim());
};

// Register tool: search_mtasa_functions
server.registerTool(
  "search_mtasa_functions",
  {
    description:
      "Search for MTA:SA functions and events by name. Returns function names with their category and side (client/server/shared).",
    inputSchema: {
      query: z.string().describe("Function name or partial name to search for"),
      side: z
        .enum(["client", "server", "shared"])
        .optional()
        .describe("Filter by client-side, server-side, or shared functions"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(30)
        .describe("Maximum number of results"),
    },
  },
  async ({ query, side, limit }): Promise<CallToolResult> => {
    const results = searchFunctions(query, side, limit);
    const formatted = results
      .map((f) => `${f.name} [${f.side}] - ${f.category}`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} MTA:SA functions:\n\n${formatted}`,
        },
      ],
    };
  },
);

// Register tool: find_mtasa_functions_for_task
server.registerTool(
  "find_mtasa_functions_for_task",
  {
    description:
      "Find relevant MTA:SA functions for a specific programming task or feature. Uses vector similarity search on cached documentation and intelligent keyword matching. Perfect for starting a new feature implementation.",
    inputSchema: {
      task_description: z
        .string()
        .describe(
          "Description of what you want to accomplish (e.g., 'login system', 'spawn vehicle', 'create gui window')",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe("Maximum number of suggestions"),
    },
  },
  async ({ task_description, limit }): Promise<CallToolResult> => {
    const results = findRelatedFunctions(task_description, limit);

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No MTA:SA functions found for task: "${task_description}". Try using different keywords or search for specific function names.`,
          },
        ],
      };
    }

    let output = `# MTA:SA Functions for: ${task_description}\n\n`;
    output += `Found ${results.length} relevant functions:\n\n`;

    results.forEach((f, i) => {
      output += `${i + 1}. **${f.name}** [${f.side}] - ${f.category}\n`;
    });

    output += `\n\nUse get_multiple_mtasa_function_docs with these function names to fetch their documentation and examples.`;

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  },
);

// Register tool: get_mtasa_function_docs
server.registerTool(
  "get_mtasa_function_docs",
  {
    description:
      "Get detailed documentation for a specific MTA:SA function from the wiki, including description, syntax, parameters, returns, and code examples. Results are cached in SQLite with vector embeddings for faster subsequent access.",
    inputSchema: {
      function_name: z.string().describe("Function name (case-insensitive)"),
      use_cache: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to use cached documentation"),
    },
  },
  async ({ function_name, use_cache }): Promise<CallToolResult> => {
    const normalizedName = normalizeFunctionInput(function_name);
    if (!normalizedName) {
      return {
        content: [
          {
            type: "text",
            text: "Function name is required.",
          },
        ],
      };
    }

    const func = findMetadataByName(normalizedName);

    if (!func) {
      return {
        content: [
          {
            type: "text",
            text: `Function "${function_name}" not found in MTA:SA function list. Use search_mtasa_functions to find the correct name.`,
          },
        ],
      };
    }

    const doc = await fetchFunctionDoc(func.name, use_cache);
    if (!doc) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to fetch documentation for ${func.name}. The wiki page may not exist or be unavailable.`,
          },
        ],
      };
    }

    const formatted = formatDocumentation(doc, func, true);

    return {
      content: [
        {
          type: "text",
          text: formatted,
        },
      ],
    };
  },
);

// Register tool: get_mtasa_function_examples
server.registerTool(
  "get_mtasa_function_examples",
  {
    description:
      "Get only the code examples for a specific MTA:SA function. Useful for quick reference when generating code.",
    inputSchema: {
      function_name: z.string().describe("Function name (case-insensitive)"),
    },
  },
  async ({ function_name }): Promise<CallToolResult> => {
    const normalizedName = normalizeFunctionInput(function_name);
    if (!normalizedName) {
      return {
        content: [
          {
            type: "text",
            text: "Function name is required.",
          },
        ],
      };
    }

    const func = findMetadataByName(normalizedName);

    if (!func) {
      return {
        content: [
          {
            type: "text",
            text: `Function "${function_name}" not found in MTA:SA function list.`,
          },
        ],
      };
    }

    const doc = await fetchFunctionDoc(func.name, true);
    if (!doc || !doc.examples) {
      return {
        content: [
          {
            type: "text",
            text: `No examples found for ${func.name}. Check the full documentation at https://wiki.multitheftauto.com/wiki/${func.name}`,
          },
        ],
      };
    }

    let output = `# ${func.name} - Code Examples\n\n`;
    const exampleParts = doc.examples.split("\n---\n");
    exampleParts.forEach((example, i) => {
      output += `## Example ${i + 1}\n\`\`\`lua\n${example}\n\`\`\`\n\n`;
    });

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  },
);

// Register tool: get_multiple_mtasa_function_docs
server.registerTool(
  "get_multiple_mtasa_function_docs",
  {
    description:
      "Fetch documentation and examples for multiple MTA:SA functions at once. Ideal for gathering all necessary info for implementing a feature. Returns combined documentation for code generation.",
    inputSchema: {
      function_names: z
        .array(z.string())
        .min(1)
        .max(MAX_BULK_DOCS)
        .describe("Array of function names to fetch"),
      include_examples: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to include code examples"),
    },
  },
  async ({ function_names, include_examples }): Promise<CallToolResult> => {
    const requestedNames = Array.from(
      new Set(function_names.map(normalizeFunctionInput).filter(Boolean)),
    );

    let output = `# Documentation for Multiple MTA:SA Functions\n\n`;
    output += `Requested ${requestedNames.length} function(s).\n\n`;

    const entries = await Promise.all(
      requestedNames.map(async (requestedName) => {
        const func = findMetadataByName(requestedName);
        if (!func) {
          return {
            requestedName,
            error: `Function \"${requestedName}\" not found`,
          };
        }

        const doc = await fetchFunctionDoc(func.name, true);
        if (!doc) {
          return {
            requestedName: func.name,
            error: `Failed to fetch documentation for ${func.name}`,
          };
        }

        return { requestedName: func.name, func, doc };
      }),
    );

    for (const entry of entries) {
      if ("error" in entry) {
        output += `## ${entry.requestedName}\n**Error:** ${entry.error}\n\n`;
        continue;
      }

      output += formatDocumentation(entry.doc, entry.func, include_examples);
      output += `---\n\n`;
    }

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  },
);

// Register tool: list_mtasa_functions_by_category
server.registerTool(
  "list_mtasa_functions_by_category",
  {
    description:
      "List all MTA:SA functions in a specific category (e.g., 'Client Functions', 'Server Events').",
    inputSchema: {
      category: z
        .enum(FUNCTION_CATEGORIES)
        .describe("The category to list functions from"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .default(100)
        .describe("Maximum number of results to return"),
    },
  },
  async ({ category, limit }): Promise<CallToolResult> => {
    const results = listFunctionsByCategory(category, limit);
    const formatted = results.map(
      (f: MtasaFunction) => `${f.name} [${f.side}]`,
    );

    const body =
      formatted.length > 0 ? formatted.join("\n") : "No functions found.";

    return {
      content: [
        {
          type: "text",
          text: `MTA:SA functions in category "${category}" (showing ${results.length}):\n\n${body}`,
        },
      ],
    };
  },
);

// Register tool: get_mtasa_cache_stats
server.registerTool(
  "get_mtasa_cache_stats",
  {
    description: "Get statistics about the MTA:SA documentation cache.",
    inputSchema: {},
  },
  async (): Promise<CallToolResult> => {
    const count = queries.countDocs().get() as { count: number };
    const dbStats = db
      .prepare(
        "SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()",
      )
      .get() as { size: number };

    return {
      content: [
        {
          type: "text",
          text:
            `# Cache Statistics\n\n` +
            `- Cached MTA:SA functions: ${count.count}\n` +
            `- Database size: ${(dbStats.size / 1024 / 1024).toFixed(2)} MB\n` +
            `- Database path: ${DB_PATH}\n` +
            `- Cache duration: ${CACHE_DURATION / 1000 / 60 / 60 / 24} days`,
        },
      ],
    };
  },
);

// Register tool: clear_mtasa_cache
server.registerTool(
  "clear_mtasa_cache",
  {
    description:
      "Clear the MTA:SA documentation cache for a specific function or all functions.",
    inputSchema: {
      function_name: z
        .string()
        .describe(
          "Function name to clear cache for, or 'all' to clear everything",
        ),
    },
  },
  async ({ function_name }): Promise<CallToolResult> => {
    if (function_name.trim().toLowerCase() === "all") {
      queries.clearAllDocs().run();
      return {
        content: [
          {
            type: "text",
            text: `Cleared all cached MTA:SA documents`,
          },
        ],
      };
    }

    const normalizedName = normalizeFunctionInput(function_name);
    if (!normalizedName) {
      return {
        content: [
          {
            type: "text",
            text: "Function name is required.",
          },
        ],
      };
    }

    const resolved = findMetadataByName(normalizedName);
    const targetName = resolved?.name ?? normalizedName;
    queries.clearDoc().run(targetName);

    return {
      content: [
        {
          type: "text",
          text: `Cleared cache for ${targetName}`,
        },
      ],
    };
  },
);

// Register MCP Prompt: MTA:SA resource structure guide
server.registerPrompt(
  "mtasa_resource_structure",
  {
    title: "MTA:SA Resource Structure Guide",
    description:
      "Guide for MTA:SA resource file structure and meta.xml manifest",
  },
  async () => ({
    description:
      "Complete guide to MTA:SA resource structure and predefined variables",
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `# MTA:SA Resource Structure Guide

## Resource Directory Structure

Every MTA:SA resource must have the following structure:
\`\`\`
resource_name/
├── meta.xml          (REQUIRED - Resource manifest)
├── server.lua        (Server-side scripts)
├── client.lua        (Client-side scripts)
├── shared.lua        (Shared code)
├── images/           (Assets folder)
├── sounds/
└── models/
\`\`\`

## meta.xml Manifest

The meta.xml file is REQUIRED in the root directory of every resource. It defines:
- Script files to load (server/client/shared)
- Resource metadata (name, author, version)
- Resource dependencies
- Exported functions
- Access rights and permissions
- HTML/config/map files

### Essential meta.xml Structure:
\`\`\`xml
<meta>
    <info name="Resource Name" author="Your Name" version="1.0" description="Description"/>
    
    <!-- Server scripts -->
    <script src="server.lua" type="server"/>
    
    <!-- Client scripts -->
    <script src="client.lua" type="client"/>
    
    <!-- Shared scripts -->
    <script src="shared.lua" type="shared"/>
    
    <!-- Files to download to client -->
    <file src="images/logo.png"/>
    
    <!-- Exported functions (callable from other resources) -->
    <export function="functionName" type="server"/>
    
    <!-- Required resources -->
    <min_mta_version server="1.5" client="1.5"/>
</meta>
\`\`\`

## Important Predefined Variables

MTA:SA provides predefined global variables:
- \`localPlayer\` - The local player element (client-side) - USE THIS instead of getLocalPlayer()
- \`root\` - The root element - USE THIS instead of getRootElement()
- \`resourceRoot\` - The root element of the current resource
- \`source\` - The element that triggered an event
- \`client\` - The player who triggered a server event (server-side)

## Script Loading Order

1. Server scripts load first when resource starts
2. Client scripts are sent to and loaded on each client
3. Shared scripts are loaded on both sides

More info: https://wiki.multitheftauto.com/wiki/Meta.xml`,
        },
      },
    ],
  }),
);

const main = async (): Promise<void> => {
  // Initialize database and load vector extension
  initializeDatabase();

  const hydratedCount = hydrateFunctionsFromDatabase();

  // Connect server transport FIRST (don't block on data loading)
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("MTA:SA Documentation MCP Server running");
  console.error(`Hydrated ${hydratedCount} functions from local cache`);
  console.error(
    "Using vector similarity search for intelligent function discovery",
  );

  // Load MTA:SA functions from wiki in the background (don't block startup)
  loadMtasaFunctions().catch((err) => {
    console.error("Failed to load MTA:SA functions:", err);
  });
};

// Cleanup on exit
process.on("exit", () => {
  closeDatabase();
});

process.on("SIGINT", () => {
  closeDatabase();
  process.exit(0);
});

main().catch(console.error);
