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
- **Package Manager**: pnpm (works with npm/yarn/bun launchers; runtime is still Node.js)
- **MCP SDK**: @modelcontextprotocol/sdk v1.29.0

### Project Structure

```
scripts/
├── build.mjs                     # Build bundle script
├── smoke.mjs                     # MCP smoke verification script
├── check-version-consistency.mjs # package/server version guard
├── check-changelog-consistency.mjs
├── check-tool-name-drift.mjs
├── check-release-tag.mjs
└── extract-changelog-entry.mjs

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

**Solution**:

1. Use upstream API in `@sqliteai/sqlite-vector`: `getExtensionPath()`
2. Let package managers install platform binaries through `optionalDependencies`
3. Keep install guidance clear when optional deps are skipped

```typescript
import { getExtensionPath } from "@sqliteai/sqlite-vector";
db.loadExtension(getExtensionPath());
```

**Why**: Keeps runtime aligned with upstream package behavior and avoids custom platform resolution logic.

### 3. **Single File Build**

**Decision**: Bundle everything into one `build/index.js` file.

```javascript
// scripts/build.mjs
esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "build/index.js",
  minify: true,
  external: ["better-sqlite3", "@sqliteai/sqlite-vector"],
});
```

**Why**:

- Easier deployment (one file + native modules)
- Faster startup (less I/O)
- Simpler debugging

### 4. **Naming Convention: concise tool names**

**Decision**: Tool and prompt names are concise and unprefixed; namespace comes from server id (`mtasa-docs`).

**Examples**:

- `search_functions`
- `search_events`
- `get_function_docs`
- `find_functions_for_task`
- `find_events_for_task`
- `recommend_doc_workflow`

**Why**:

- Avoids redundant names in runners that already prefix by server id
- Keeps tool names shorter and easier for models to call correctly
- Still namespaced by the `mtasa-docs` MCP server identity

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
  }),
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

**Cause**: Platform optional dependency was not installed.

**Fix**:

1. Reinstall with optional dependencies enabled: `pnpm install --force`
2. Confirm your package manager did not use a `--no-optional` equivalent
3. Verify `getExtensionPath()` is used in `connection.ts`

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

1. Clear cache: `clear_cache` tool with `function_name: "all"`
2. Reload functions (triggers embedding generation)
3. Check `embedding IS NOT NULL` in queries

---

## 🚀 Build & Deployment

### Build Process

```bash
pnpm build
```

This runs `scripts/build.mjs`:

1. TypeScript compilation (type checking)
2. esbuild bundling (with minification)
3. Sets executable permissions on `build/index.js`

**Output**: Single `build/index.js` file (~574KB minified)

### Release Automation

The repository includes a release workflow at `.github/workflows/release.yml`.

On pushes to `master`, the workflow:

1. Reads the version from `package.json`
2. Skips publishing if that version already exists on npm
3. Runs `pnpm verify:full` (checks + tests + smoke + live tests)
4. Creates and pushes tag `v<version>` if missing
5. Publishes to npm using trusted publishing with provenance
6. Creates/updates a GitHub Release using the version section from `CHANGELOG.md`
7. Installs the just-published package from npm and runs smoke checks

Release-related commands:

- `pnpm check:changelog` - Ensure `CHANGELOG.md` has `[Unreleased]` and current version heading
- `pnpm release:check-tag` - Ensure release tag matches `package.json` version
- `pnpm release:notes` - Extract current version notes from `CHANGELOG.md` into `release-notes.md`

### Optional Dependency Resolution

The project relies on `@sqliteai/sqlite-vector` optional dependencies for platform binaries.

If binaries are missing on install:

1. Ensure optional dependencies are not disabled by your environment
2. Reinstall dependencies (`pnpm install --force`)
3. Validate runtime loading with a local run/build test

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

### Agent Development Cycle

For substantial features, refactors, or multi-file updates, follow a full development cycle:

1. Analyze the current implementation and define scope.
2. Implement changes in coherent steps.
3. Validate with checks (`pnpm exec tsc --noEmit`, `pnpm build`, and relevant tests).
4. Update documentation when behavior or architecture changes.
5. If you edit a file that contains a `Last Updated` field, update it to the current date in the same change.
6. After a significant update, create a git commit with a concise message explaining the purpose of the change.

This keeps progress shippable and avoids leaving large, uncommitted updates in the working tree.

### Branching & Merge Policy

- Before `v1.0.0`, direct pushes to `master` are acceptable during rapid iteration.
- Starting at `v1.0.0`, switch to PR-based development for all changes targeting `master`.
- For post-`v1.0.0` work, require CI to pass before merge.

### Release Compatibility Policy

- Before `v1.0.0`, breaking tool/prompt renames are allowed while APIs stabilize.
- Starting at `v1.0.0`, avoid breaking tool/prompt names in patch/minor releases.
- For post-`v1.0.0` renames, add a deprecation window first, document it, then remove in a planned later release.

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
  "tool_name",
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
  },
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
- [ ] If tools/prompts changed, smoke and manifest tests were updated (or validated as auto-derived)

### Automated Test Commands

- `pnpm test` - Run Vitest suite
- `pnpm test:watch` - Run tests continuously while developing
- `pnpm test:coverage` - Generate coverage report
- `pnpm test:live` - Run live parser integration tests against wiki pages
- `pnpm check:versions` - Ensure `package.json` and MCP server versions match
- `pnpm check:changelog` - Ensure changelog has required release sections
- `pnpm check:tool-names` - Ensure legacy `mtasa_` tool/prompt names are not reintroduced
- `pnpm smoke` - Build and run MCP client smoke checks against the built server
- `pnpm verify` - Run version checks, drift checks, tests, and smoke gate
- `pnpm verify:full` - Run full gate (`verify`) plus live integration tests

### CI Workflows

- `.github/workflows/ci.yml` - Runs on push/PR to `master`, executes `pnpm verify` on Ubuntu and macOS
- `.github/workflows/live-tests.yml` - Runs on manual dispatch, or on labeled PRs (`run-live-tests`) with relevant parser/live-test changes, executes `pnpm test:live`
- `.github/workflows/release.yml` - Runs on push to `master`, publishes new npm versions, creates GitHub Releases, and verifies published package install/smoke

---

## 📚 Key Learnings from Development

### 1. **MCP SDK API Evolution**

The MCP SDK has high-level and low-level APIs:

- **High-level**: `server.registerTool()`, `server.registerPrompt()`
- **Low-level**: `server.server.setRequestHandler(Schema, handler)`

**Always use high-level APIs** unless you need custom protocol handling.

### 2. **Native Modules in ESM**

Loading native Node.js modules (`.node` files) in ESM requires:

1. Using `getExtensionPath()` from `@sqliteai/sqlite-vector`
2. Ensuring platform optional dependencies are installed
3. Keeping the native package external in bundling

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

- **v0.9.0** (January 2026): Initial pre-release
  - 9 MCP tools for comprehensive documentation access
  - Vector similarity search using SQLite-vec
  - Smart keyword expansion (60+ aliases)
  - Deprecation detection and warnings
  - MCP prompts for resource structure and MCP-first usage policy
  - Async server startup for instant availability
  - Multi-package-manager support (pnpm/npm/yarn/bun)
  - Single-file build with esbuild
  - 30-day intelligent caching

- **v0.9.1** (April 2026): Event-first discovery and cleaner docs defaults
  - Added `search_events` for event-only lookup
  - Added `find_events_for_task` for event intent matching
  - Clarified single-item scope of `get_function_docs`
  - Added `include_optional_arguments` to single and batch docs tools (default hidden)
  - Strengthened MCP-first usage prompt to reduce manual WebFetch fallback

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

**Last Updated**: April 13, 2026  
**Maintainer**: @Luminaire1337  
**Version**: 0.9.1  
**Repository**: https://github.com/Luminaire1337/mtasa-docs-mcp  
**License**: GPL-3.0

---

**Remember**: This document is living documentation. Update it when you make architectural changes!
