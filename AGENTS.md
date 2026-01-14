# MTA:SA Documentation MCP Server - Agent Guide

**For AI Agents, LLMs, and Future Contributors**

This document contains critical architectural decisions, implementation details, and context that was developed through iterative problem-solving. Read this BEFORE making changes.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Decisions](#architecture-decisions)
3. [Critical Implementation Details](#critical-implementation-details)
4. [Database Schema](#database-schema)
5. [Vector Search System](#vector-search-system)
6. [Keyword Expansion](#keyword-expansion)
7. [Deprecation Detection](#deprecation-detection)
8. [Common Pitfalls & Solutions](#common-pitfalls--solutions)
9. [Build & Deployment](#build--deployment)
10. [Contributing Guidelines](#contributing-guidelines)

---

## 🎯 Project Overview

### What This Is

An MCP (Model Context Protocol) server that provides AI assistants with access to MTA:SA (Multi Theft Auto: San Andreas) documentation through intelligent search, vector similarity, and caching.

### Key Technologies

- **Runtime**: Node.js v24+
- **Language**: TypeScript
- **Database**: better-sqlite3 + @sqliteai/sqlite-vector
- **Bundler**: esbuild
- **Package Manager**: pnpm (but supports npm/yarn/bun via postinstall)
- **MCP SDK**: @modelcontextprotocol/sdk v1.25.2

### Project Structure

```
src/
├── index.ts              # MCP server entry point, tool registration
├── config/
│   └── constants.ts      # Configuration values
├── database/
│   ├── connection.ts     # SQLite initialization, vector extension loading
│   └── queries.ts        # Prepared SQL statements
├── types/
│   └── interfaces.ts     # TypeScript interfaces
└── utils/
    ├── loader.ts         # Wiki scraping & function loading
    ├── parser.ts         # HTML parsing & deprecation detection
    ├── formatter.ts      # Documentation formatting
    └── search.ts         # Keyword expansion & vector search
```

---

## 🏗️ Architecture Decisions

### 1. **Async Server Startup (CRITICAL)**

**Problem**: Server was blocking on `await loadMtasaFunctions()` before connecting to transport, causing MCP inspector timeouts.

**Solution**: Connect transport FIRST, load data in background.

```typescript
// ❌ WRONG - Blocks server startup
await loadMtasaFunctions();
await server.connect(transport);

// ✅ CORRECT - Server available immediately
await server.connect(transport);
loadMtasaFunctions().catch((err) => console.error(err));
```

**Why**: MCP clients expect servers to respond within seconds. Loading 1500+ functions from wiki takes time.

### 2. **Vector Extension Loading (CRITICAL)**

**Problem**: `@sqliteai/sqlite-vector` couldn't find platform-specific native module (`.node` file).

**Solution**: Multi-step approach:

1. Postinstall script detects package manager (pnpm/npm/yarn/bun)
2. Installs `@sqliteai/sqlite-vector-<platform>` driver
3. Uses `createRequire` to load from correct path

```typescript
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sqliteVec = require("@sqliteai/sqlite-vector");
```

**Why**: ESM imports can't load native modules from nested `node_modules` directories.

### 3. **Single File Build**

**Decision**: Bundle everything into one `build/index.js` file.

```javascript
// build.mjs
esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: "build/index.js",
  minify: true,
  external: ["better-sqlite3", "@sqliteai/sqlite-vector*"],
});
```

**Why**:

- Easier deployment (one file + native modules)
- Faster startup (less I/O)
- Simpler debugging

### 4. **Naming Convention: "mtasa" Prefix**

**Decision**: All tools use `mtasa_` or `search_mtasa_` prefix.

**Examples**:

- `search_mtasa_functions`
- `get_mtasa_function_docs`
- `find_mtasa_functions_for_task`

**Why**:

- Prevents naming conflicts with other MCP servers
- Clear namespace in AI tool lists
- Consistent with "mtasa-docs" server name

### 5. **Type Naming: MtasaFunction (not MTAFunction)**

**Decision**: Use modern camelCase naming.

```typescript
// ✅ CORRECT
export interface MtasaFunction {
  name: string;
  category: string;
  side: "client" | "server" | "shared";
}

// ❌ WRONG
export interface MTAFunction { ... }
```

**Why**: Consistency with modern TypeScript conventions.

---

## 🔧 Critical Implementation Details

### Tool Registration

**Use `server.registerTool()` NOT `server.server.setRequestHandler()`**

```typescript
// ✅ CORRECT - High-level API
server.registerTool(
  "tool_name",
  {
    description: "...",
    inputSchema: {
      param: z.string().describe("..."),
    },
  },
  async ({ param }) => { ... }
);

// ❌ WRONG - Low-level API (for advanced use only)
server.server.setRequestHandler(CallToolRequestSchema, ...);
```

### Prompt Registration

**Use `server.registerPrompt()` for MCP prompts**

```typescript
// ✅ CORRECT
server.registerPrompt(
  "prompt_name",
  {
    title: "Display Title",
    description: "Short description",
  },
  async () => ({
    description: "Detailed description",
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "Prompt content...",
        },
      },
    ],
  })
);
```

### Parameter Consistency

**Schema parameter names MUST match destructured handler parameters**

```typescript
// ✅ CORRECT - Names match
inputSchema: {
  function_names: z.array(z.string()),
  include_examples: z.boolean().optional(),
},
async ({ function_names, include_examples }) => { ... }

// ❌ WRONG - Typo in handler
async ({ function_names, include_example }) => { ... }
//                        ^ missing 's'
```

---

## 💾 Database Schema

### Tables

#### `function_metadata`

Stores MTA:SA function metadata from wiki category pages.

```sql
CREATE TABLE function_metadata (
  name TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('client', 'server', 'shared'))
);
```

#### `function_docs`

Stores cached documentation with vector embeddings.

```sql
CREATE TABLE function_docs (
  name TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  description TEXT,
  syntax TEXT,
  parameters TEXT,
  returns TEXT,
  examples TEXT,
  related_functions TEXT,
  full_text TEXT,
  embedding BLOB,        -- 768-dim vector from @sqliteai/sqlite-vector
  deprecated TEXT,       -- Deprecation message if function is deprecated
  cached_at INTEGER NOT NULL
);
```

**Important**: `deprecated` column was added for deprecation warnings. Ensure all queries include it.

### Indexes

```sql
CREATE INDEX idx_category ON function_metadata(category);
CREATE INDEX idx_side ON function_metadata(side);
CREATE INDEX idx_cached_at ON function_docs(cached_at);
```

### Vector Search

Uses `vec_distance_L2()` for similarity search:

```sql
SELECT name, vec_distance_L2(embedding, ?) as distance
FROM function_docs
WHERE embedding IS NOT NULL
ORDER BY distance
LIMIT ?
```

---

## 🔍 Vector Search System

### How It Works

1. **Embedding Generation**: Uses `@sqliteai/sqlite-vector` to create 768-dimensional vectors from text
2. **Storage**: Stored as BLOB in `function_docs.embedding` column
3. **Search**: L2 distance calculation for similarity matching

### Embedding Source

```typescript
// Full text includes all documentation content
doc.full_text = [
  doc.description,
  doc.syntax,
  doc.parameters,
  doc.returns,
  doc.examples,
].join(" ");
```

### Why Vector Search?

- **Semantic Understanding**: "spawn vehicle" finds `createVehicle`, `addVehicleUpgrade`
- **Typo Tolerance**: "databse" still finds database functions
- **Context Aware**: Understands intent, not just keywords

---

## 🔑 Keyword Expansion

### The Problem

Users search with colloquial terms that don't match function names:

- "database" but functions are `dbQuery`, `dbPoll`
- "gui" but functions are `guiCreateWindow`, `dgsCreateWindow`
- "browser" but functions are `createBrowser`, `injectBrowserMouseMove`

### The Solution: KEYWORD_ALIASES

Located in `src/utils/search.ts`:

```typescript
const KEYWORD_ALIASES: Record<string, string[]> = {
  // User searches for these → Expand to these prefixes
  database: ["db"],
  sqlite: ["db"],
  sql: ["db"],
  query: ["db"],

  gui: ["gui", "dgs"],
  cegui: ["gui", "dgs"],
  interface: ["gui", "dgs"],

  browser: ["browser", "create", "inject"],
  cef: ["browser", "create", "inject"],
  html: ["browser", "create", "inject"],

  // ... 60+ mappings
};
```

### How It's Used

```typescript
export const expandKeywords = (query: string): string[] => {
  const keywords = [query.toLowerCase()];

  for (const [key, aliases] of Object.entries(KEYWORD_ALIASES)) {
    if (query.toLowerCase().includes(key)) {
      keywords.push(...aliases);
    }
  }

  return [...new Set(keywords)];
};
```

### Data-Driven Approach

The aliases were created by analyzing actual function prefixes:

```sql
-- Query used to find common prefixes
SELECT
  substr(name, 1, instr(name || 'X', upper(substr(name, 2, 1))) - 1) as prefix,
  COUNT(*) as count
FROM function_metadata
GROUP BY prefix
HAVING count > 5
ORDER BY count DESC;
```

**Results**:

- `get*`: 438 functions
- `set*`: 311 functions
- `on*`: 226 functions (events)
- `dgs*`: 144 functions (DGS GUI)
- `gui*`: 132 functions (CEGUI)
- `db*`: 6 functions (database)

---

## ⚠️ Deprecation Detection

### Why It Matters

MTA:SA deprecated several getter functions in favor of predefined variables:

- `getLocalPlayer()` → `localPlayer` variable
- `getRootElement()` → `root` variable
- `getResourceRootElement()` → `resourceRoot` variable

### How It Works

**1. Detection Patterns** (in `src/utils/parser.ts`):

```typescript
const deprecationPatterns = [
  // "You should use predefined variable localPlayer instead"
  /You should use (?:predefined variable )?([\\w]+)(?: variable)? instead/i,

  // "This function is deprecated, use setElementHealth instead"
  /(?:deprecated|obsolete|no longer recommended)[^.]*?(?:use|replaced by|instead use) ([\\w]+)/i,

  // "The predefined variable 'root' is getRootElement()"
  /predefined variable '?([\\w]+)'? is/i,
];
```

**2. Extraction** (in `src/utils/parser.ts`):

```typescript
let deprecated: string | null = null;

for (const pattern of deprecationPatterns) {
  const match = html.match(pattern);
  if (match) {
    deprecated = match[0].trim();
    break;
  }
}

doc.deprecated = deprecated;
```

**3. Storage** (in `src/database/queries.ts`):

```typescript
queries.insertDoc = db.prepare(`
  INSERT OR REPLACE INTO function_docs (
    name, url, description, syntax, parameters, returns,
    examples, related_functions, full_text, embedding,
    deprecated, cached_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
```

**4. Display** (in `src/utils/formatter.ts`):

```typescript
if (doc.deprecated) {
  output += `⚠️ **DEPRECATED:** ${doc.deprecated}\n\n`;
}
```

### Testing Deprecation

Functions to test:

- `getLocalPlayer` - Should show "use localPlayer instead"
- `getRootElement` - Should show "use root instead"
- `getResourceRootElement` - Should show "use resourceRoot instead"

---

## ⚡ Common Pitfalls & Solutions

### 1. **"Tools not appearing in MCP inspector"**

**Cause**: Server blocked on slow initialization before connecting transport.

**Fix**: Move `loadMtasaFunctions()` AFTER `server.connect()`.

### 2. **"Cannot find module '@sqliteai/sqlite-vector'"**

**Cause**: Platform driver not installed or ESM can't find it.

**Fix**:

1. Run `pnpm install` (triggers postinstall)
2. Check `node_modules/@sqliteai/sqlite-vector-darwin-arm64` (or your platform) exists
3. Verify `createRequire` is used in `connection.ts`

### 3. **"TypeScript error: Property 'schema' does not exist"**

**Cause**: Using low-level `server.server.setRequestHandler({ schema: "..." })` instead of high-level API.

**Fix**: Use `server.registerTool()` or `server.registerPrompt()`.

### 4. **"Function call failed: missing required parameter"**

**Cause**: Parameter name mismatch between schema and handler.

**Fix**: Ensure destructured parameter names exactly match `inputSchema` keys.

### 5. **"Vector search returns no results"**

**Cause**:

- Embeddings not generated (cached before vector support)
- Wrong distance function
- Database locked

**Fix**:

1. Clear cache: `clear_mtasa_cache` tool with `function_name: "all"`
2. Reload functions (triggers embedding generation)
3. Check `embedding IS NOT NULL` in queries

---

## 🚀 Build & Deployment

### Build Process

```bash
pnpm build
```

This runs `build.mjs`:

1. TypeScript compilation (type checking)
2. esbuild bundling (with minification)
3. Sets executable permissions on `build/index.js`

**Output**: Single `build/index.js` file (~574KB minified)

### Package Manager Detection

The `scripts/postinstall.mjs` script:

1. Detects which package manager is running (pnpm/npm/yarn/bun)
2. Installs platform-specific driver:
   - macOS ARM64: `@sqliteai/sqlite-vector-darwin-arm64`
   - macOS x64: `@sqliteai/sqlite-vector-darwin-x64`
   - Linux x64: `@sqliteai/sqlite-vector-linux-x64-gnu`
   - Windows x64: `@sqliteai/sqlite-vector-win32-x64-msvc`

### MCP Configuration

Add to `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "mtasa-docs": {
      "command": "node",
      "args": ["/path/to/mtasa-docs-mcp/build/index.js"]
    }
  }
}
```

Or use `pnpm inspector` for testing.

---

## 🤝 Contributing Guidelines

### Before Making Changes

1. **Read this document completely**
2. **Check [FEATURES.md](FEATURES.md)** for planned features
3. **Run `pnpm build`** to ensure no TypeScript errors
4. **Test with `pnpm inspector`**

### Code Style

- Use **TypeScript** for all code
- Use **camelCase** for variables/functions
- Use **PascalCase** for types/interfaces
- Prefix interfaces with purpose: `MtasaFunction`, `CachedDoc`
- Use `const` over `let` where possible

### Database Changes

When modifying schema:

1. Update `connection.ts` CREATE TABLE statements
2. Update `queries.ts` prepared statements
3. Update `interfaces.ts` TypeScript types
4. Update this document's schema section
5. Consider migration path (or clear cache)

### Adding New Tools

Template:

```typescript
server.registerTool(
  "tool_name_with_mtasa_prefix",
  {
    description: "Clear, concise description of what it does",
    inputSchema: {
      param_name: z.type().describe("Parameter description"),
    },
  },
  async ({ param_name }): Promise<CallToolResult> => {
    // Implementation
    return {
      content: [
        {
          type: "text",
          text: "Result text",
        },
      ],
    };
  }
);
```

### Testing Checklist

- [ ] `pnpm build` succeeds
- [ ] No TypeScript errors
- [ ] Tool appears in `pnpm inspector`
- [ ] Tool executes without errors
- [ ] Returns expected format
- [ ] Handles edge cases (empty results, errors)
- [ ] Parameter validation works

---

## 📚 Key Learnings from Development

### 1. **MCP SDK API Evolution**

The MCP SDK has high-level and low-level APIs:

- **High-level**: `server.registerTool()`, `server.registerPrompt()`
- **Low-level**: `server.server.setRequestHandler(Schema, handler)`

**Always use high-level APIs** unless you need custom protocol handling.

### 2. **Native Modules in ESM**

Loading native Node.js modules (`.node` files) in ESM requires:

1. `createRequire()` from `module`
2. Proper package manager detection
3. Platform-specific module installation

Can't use `import` directly for native modules in nested dependencies.

### 3. **Vector Embeddings Are Expensive**

Generating 768-dim vectors for 1500+ functions takes time:

- Cache aggressively (30-day default)
- Generate on background thread
- Only regenerate when content changes

### 4. **HTML Parsing Is Fragile**

MTA:SA Wiki HTML structure varies:

- Multiple syntax formats (`<syntaxhighlight>`, `<pre>`)
- Inconsistent heading levels (`<h2>`, `<h3>`)
- Nested tables and divs

**Solution**: Multiple regex patterns with fallbacks.

### 5. **AI Tool Calling Is Imperfect**

Even advanced models sometimes:

- Forget required parameters
- Use wrong parameter names
- Ignore tool descriptions

**Solution**:

- Clear, detailed descriptions
- Sensible defaults
- Helpful error messages

---

## 🔗 Related Resources

- **MCP Specification**: https://modelcontextprotocol.io/
- **MTA:SA Wiki**: https://wiki.multitheftauto.com/
- **SQLite-vec**: https://github.com/asg017/sqlite-vec
- **MCP TypeScript SDK**: https://github.com/modelcontextprotocol/typescript-sdk

---

## 📝 Changelog Summary

- **v1.0.0** (January 2026): Initial release
  - 8 MCP tools for comprehensive documentation access
  - Vector similarity search using SQLite-vec
  - Smart keyword expansion (60+ aliases)
  - Deprecation detection and warnings
  - MCP prompt for resource structure guide
  - Async server startup for instant availability
  - Multi-package-manager support (pnpm/npm/yarn/bun)
  - Single-file build with esbuild
  - 30-day intelligent caching

---

## ❓ FAQ for Agents

**Q: Can I add new data sources beyond MTA:SA Wiki?**
A: Yes! Add new scraping functions in `loader.ts` and extend the database schema.

**Q: How do I improve search accuracy?**
A:

1. Add more keyword aliases in `KEYWORD_ALIASES`
2. Improve `full_text` content in parser
3. Tune vector distance threshold

**Q: Can this be adapted for other game engines?**
A: Absolutely! The architecture is generic:

- Replace wiki scraper with your docs source
- Update schema for your data structure
- Adjust keyword aliases for your API

**Q: Why not use an external vector database?**
A:

- Simplicity: One SQLite file
- Performance: Embedded database = no network
- Portability: Works offline
- SQLite-vec is surprisingly fast for <100k vectors

**Q: How do I debug MCP communication?**
A: Use `pnpm inspector` - it shows all JSON-RPC messages between client and server.

---

**Last Updated**: January 14, 2026  
**Maintainer**: @Luminaire1337  
**Version**: 1.0.0  
**Repository**: https://github.com/Luminaire1337/mtasa-docs-mcp  
**License**: GPL-3.0

---

**Remember**: This document is living documentation. Update it when you make architectural changes!
