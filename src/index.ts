import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  initializeDatabase,
  closeDatabase,
  isVectorExtensionLoaded,
} from "./database/connection.js";
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
    version: "1.0.2",
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
const EVENT_CATEGORY_SET = new Set<string>(["Client Events", "Server Events"]);

const isEventEntry = (entry: MtasaFunction): boolean => {
  return EVENT_CATEGORY_SET.has(entry.category);
};

const filterEventEntries = (entries: MtasaFunction[]): MtasaFunction[] => {
  return entries.filter((entry) => isEventEntry(entry));
};

const normalizeFunctionInput = (value: string): string => {
  return canonicalizeFunctionName(value.trim());
};

const dedupeFunctionsByName = (functions: MtasaFunction[]): MtasaFunction[] => {
  const seen = new Set<string>();
  const unique: MtasaFunction[] = [];

  for (const func of functions) {
    if (seen.has(func.name)) {
      continue;
    }

    seen.add(func.name);
    unique.push(func);
  }

  return unique;
};

const formatFunctionList = (functions: MtasaFunction[]): string => {
  return functions
    .map((func, index) => {
      return `${index + 1}. **${func.name}** [${func.side}] - ${func.category}`;
    })
    .join("\n");
};

// Register tool: search_functions
server.registerTool(
  "search_functions",
  {
    description:
      "Primary discovery tool. Search MTA:SA functions and events by name or keyword before coding. Returns canonical function names with side/category so LLMs can reliably chain into docs tools.",
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
    const formatted =
      results.length > 0
        ? results.map((f) => `${f.name} [${f.side}] - ${f.category}`).join("\n")
        : "No entries found.";

    const nextSteps =
      results.length > 0
        ? "\n\nNext: call `get_function_docs` for one entry or `get_multiple_function_docs` for several results from this list."
        : "\n\nTip: try broader keywords (e.g., database, gui, dx, event, vehicle) or use `find_functions_for_task`.";

    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} MTA:SA functions/events:\n\n${formatted}${nextSteps}`,
        },
      ],
    };
  },
);

server.registerTool(
  "search_events",
  {
    description:
      "Event discovery tool. Search MTA:SA client/server events only (not regular functions), then chain into docs tools with exact event names.",
    inputSchema: {
      query: z.string().describe("Event name or keyword to search for"),
      side: z
        .enum(["client", "server"])
        .optional()
        .describe("Filter by client-side or server-side events"),
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
    const results = filterEventEntries(searchFunctions(query, side, limit));
    const formatted =
      results.length > 0
        ? results.map((event) => `${event.name} [${event.side}]`).join("\n")
        : "No events found.";

    const nextSteps =
      results.length > 0
        ? "\n\nNext: call `get_function_docs` for one event or `get_multiple_function_docs` for multiple events in one request."
        : "\n\nTip: try terms like onPlayer, onClient, trigger, handler, resource, marker, vehicle.";

    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} MTA:SA events:\n\n${formatted}${nextSteps}`,
        },
      ],
    };
  },
);

// Register tool: find_functions_for_task
server.registerTool(
  "find_functions_for_task",
  {
    description:
      "Task-to-functions matcher. Use this FIRST when user intent is high-level (e.g., 'vehicle dealership', 'login panel'). Returns ranked MTA:SA functions/events optimized for follow-up documentation retrieval.",
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
            text: `No MTA:SA functions/events found for task: "${task_description}". Try using different keywords or search for specific entry names.`,
          },
        ],
      };
    }

    let output = `# MTA:SA Entries for: ${task_description}\n\n`;
    output += `Found ${results.length} relevant functions/events:\n\n`;

    results.forEach((f, i) => {
      output += `${i + 1}. **${f.name}** [${f.side}] - ${f.category}\n`;
    });

    output +=
      "\n\nNext: call `get_multiple_function_docs` with the top 3-8 names from this list, then generate code from those docs.";

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

server.registerTool(
  "find_events_for_task",
  {
    description:
      "Task-to-events matcher. Use when you need event names for handlers/triggers (e.g., resource lifecycle, player joins, marker hits). Returns ranked MTA:SA events only.",
    inputSchema: {
      task_description: z
        .string()
        .describe(
          "Description of the event workflow you need (e.g., 'when player joins', 'resource start', 'on marker hit')",
        ),
      side: z
        .enum(["client", "server"])
        .optional()
        .describe("Filter by client-side or server-side events"),
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
  async ({ task_description, side, limit }): Promise<CallToolResult> => {
    const semanticMatches = filterEventEntries(
      findRelatedFunctions(task_description, Math.max(limit * 3, limit)),
    );
    const nameMatches = filterEventEntries(
      searchFunctions(task_description, side, Math.max(limit * 3, limit)),
    );

    const merged = dedupeFunctionsByName([...semanticMatches, ...nameMatches])
      .filter((entry) => (side ? entry.side === side : true))
      .slice(0, limit);

    if (merged.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No MTA:SA events found for task: "${task_description}". Try terms like onPlayer, onClient, trigger, handler, resource, marker, vehicle.`,
          },
        ],
      };
    }

    let output = `# MTA:SA Events for: ${task_description}\n\n`;
    output += `Found ${merged.length} relevant events:\n\n`;

    merged.forEach((event, index) => {
      output += `${index + 1}. **${event.name}** [${event.side}] - ${event.category}\n`;
    });

    output +=
      "\n\nNext: call `get_multiple_function_docs` with the top 3-8 event names from this list for handler signatures and argument details.";

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

// Register tool: get_function_docs
server.registerTool(
  "get_function_docs",
  {
    description:
      "Fetch authoritative docs for exactly ONE MTA:SA function/event by canonical name. Preferred over manual web browsing. For multiple names, use get_multiple_function_docs in one call.",
    inputSchema: {
      function_name: z
        .string()
        .describe("Function/event name (case-insensitive)"),
      use_cache: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to use cached documentation"),
      include_optional_arguments: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Whether to include optional arguments in the parameters section",
        ),
    },
  },
  async ({
    function_name,
    use_cache,
    include_optional_arguments,
  }): Promise<CallToolResult> => {
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
            text: `Function/event "${function_name}" not found in MTA:SA metadata. Use search_functions or search_events to find the correct name.`,
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

    const formatted = formatDocumentation(doc, func, {
      includeExamples: true,
      includeOptionalArguments: include_optional_arguments,
    });
    const suggestedRelated = findRelatedFunctions(func.name, 5)
      .filter((candidate) => candidate.name !== func.name)
      .slice(0, 5);

    let relatedHint = "";
    if (suggestedRelated.length > 0) {
      relatedHint =
        "\n\nSuggested follow-up entries:\n" +
        formatFunctionList(suggestedRelated) +
        "\n\nNext: call `get_multiple_function_docs` with the exact names above if you need implementation context.";
    }

    return {
      content: [
        {
          type: "text",
          text: `${formatted}${relatedHint}`,
        },
      ],
    };
  },
);

// Register tool: get_function_examples
server.registerTool(
  "get_function_examples",
  {
    description:
      "Get only code examples for one function/event after docs lookup. Use when writing implementation snippets and tests.",
    inputSchema: {
      function_name: z
        .string()
        .describe("Function/event name (case-insensitive)"),
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
            text: `Function/event "${function_name}" not found in MTA:SA metadata.`,
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

// Register tool: get_multiple_function_docs
server.registerTool(
  "get_multiple_function_docs",
  {
    description:
      "Batch docs retrieval for implementation phase. Provide exact function/event names (ideally from search/find tools) and get combined authoritative docs in one response.",
    inputSchema: {
      function_names: z
        .array(z.string())
        .min(1)
        .max(MAX_BULK_DOCS)
        .describe("Array of function/event names to fetch"),
      include_examples: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to include code examples"),
      include_optional_arguments: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Whether to include optional arguments in each parameters section",
        ),
    },
  },
  async ({
    function_names,
    include_examples,
    include_optional_arguments,
  }): Promise<CallToolResult> => {
    const requestedNames = Array.from(
      new Set(function_names.map(normalizeFunctionInput).filter(Boolean)),
    ).slice(0, MAX_BULK_DOCS);

    let output = `# Documentation for Multiple MTA:SA Entries\n\n`;
    output += `Requested ${requestedNames.length} function/event name(s).\n\n`;

    if (!include_optional_arguments) {
      output +=
        "Optional arguments are hidden by default. Set include_optional_arguments=true to include them.\n\n";
    }

    const entries = await Promise.all(
      requestedNames.map(async (requestedName) => {
        const func = findMetadataByName(requestedName);
        if (!func) {
          return {
            requestedName,
            error: `Function/event \"${requestedName}\" not found`,
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

      output += formatDocumentation(entry.doc, entry.func, {
        includeExamples: include_examples,
        includeOptionalArguments: include_optional_arguments,
      });
      output += `---\n\n`;
    }

    output +=
      "Use these docs as the source of truth for code generation and avoid manually scraping wiki pages in the same task.";

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

// Register tool: list_functions_by_category
server.registerTool(
  "list_functions_by_category",
  {
    description:
      "Enumerate canonical function/event names in a category. Useful for discovery when query terms are vague.",
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

// Register tool: get_cache_stats
server.registerTool(
  "get_cache_stats",
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
            `- Cached MTA:SA docs: ${count.count}\n` +
            `- Database size: ${(dbStats.size / 1024 / 1024).toFixed(2)} MB\n` +
            `- Database path: ${DB_PATH}\n` +
            `- Cache duration: ${CACHE_DURATION / 1000 / 60 / 60 / 24} days`,
        },
      ],
    };
  },
);

// Register tool: recommend_doc_workflow
server.registerTool(
  "recommend_doc_workflow",
  {
    description:
      "Planner tool that tells LLMs exactly which mtasa-docs tools to call next for a given task. Use this to enforce MCP-first workflows and avoid manual wiki scraping.",
    inputSchema: {
      task_description: z
        .string()
        .describe("What the user wants to build or debug"),
      known_function_names: z
        .array(z.string())
        .optional()
        .default([])
        .describe("Function names already known in the conversation"),
    },
  },
  async ({
    task_description,
    known_function_names,
  }): Promise<CallToolResult> => {
    const normalizedKnown = dedupeFunctionsByName(
      known_function_names
        .map(normalizeFunctionInput)
        .map((name) => findMetadataByName(name))
        .filter((item): item is MtasaFunction => Boolean(item)),
    );

    const taskMatches = dedupeFunctionsByName(
      findRelatedFunctions(task_description, 8),
    );
    const eventTaskMatches = filterEventEntries(taskMatches).slice(0, 6);

    const searchHints = task_description
      .split(/[^A-Za-z0-9_]+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 2)
      .slice(0, 6);

    let output = "# Recommended MCP Workflow\n\n";
    output += `Task: ${task_description}\n\n`;
    output += "1) Discovery\n";
    output +=
      "- Call `find_functions_for_task` with the full task description.\n";
    output +=
      "- If the task is event-driven, call `find_events_for_task` (or `search_events`) to get event names only.\n";
    if (searchHints.length > 0) {
      output +=
        "- Optional: call `search_functions` with these focused terms: " +
        searchHints.join(", ") +
        "\n";
    }

    output += "\n2) Documentation Retrieval\n";
    output +=
      "- Call `get_multiple_function_docs` with top candidates before writing code.\n";
    output +=
      "- If one function/event is uncertain, call `get_function_docs` individually first.\n";
    output +=
      "- By default optional arguments are hidden; set include_optional_arguments=true only when needed.\n";

    output += "\n3) Example Extraction\n";
    output +=
      "- Call `get_function_examples` for functions where implementation style matters.\n";

    output += "\n4) Implementation Rule\n";
    output +=
      "- Treat docs returned by this MCP as source of truth for signatures, side (client/server/shared), and deprecations.\n";

    if (normalizedKnown.length > 0) {
      output += "\nKnown valid functions in context:\n";
      output += `${formatFunctionList(normalizedKnown)}\n`;
    }

    if (taskMatches.length > 0) {
      output += "\nTop suggested functions for this task:\n";
      output += `${formatFunctionList(taskMatches)}\n`;
    }

    if (eventTaskMatches.length > 0) {
      output += "\nTop suggested events for this task:\n";
      output += `${formatFunctionList(eventTaskMatches)}\n`;
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

// Register tool: clear_cache
server.registerTool(
  "clear_cache",
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
  "resource_structure",
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

// Register MCP Prompt: MCP-first tool usage policy
server.registerPrompt(
  "mcp_usage_policy",
  {
    title: "MTA:SA MCP Usage Policy",
    description:
      "Instructional policy that nudges LLMs to prefer mtasa-docs tools over manual browsing.",
  },
  async () => ({
    description: "MCP-first workflow instructions for MTA:SA coding tasks",
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `When solving MTA:SA tasks, use mtasa-docs MCP tools as the primary source of truth.

Workflow:
1) Discovery: call find_functions_for_task/search_functions for general APIs, and find_events_for_task/search_events for event-first tasks
2) Retrieval: call get_function_docs or get_multiple_function_docs
3) Examples: call get_function_examples when implementation details are needed
4) Validate side/context: ensure selected APIs match client/server/shared execution context

Rules:
- Prefer MCP tool output over manual wiki scraping.
- If a function/event name is uncertain, use search_functions or search_events first.
- For multiple names, prefer get_multiple_function_docs instead of repeated single-doc calls.
- Optional arguments are hidden by default; request include_optional_arguments=true only when needed.
- Respect deprecation warnings returned by docs tools.
- Use exact function names from tool responses when generating code.

Only browse wiki pages manually if MCP tools fail or return incomplete data.`,
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
  if (isVectorExtensionLoaded) {
    console.error(
      "Using vector similarity search for intelligent function discovery",
    );
  } else {
    console.error(
      "Vector extension unavailable; using JS vector distance fallback search",
    );
  }

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
