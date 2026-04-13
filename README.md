# MTA:SA Documentation MCP Server

> **Work in Progress**: This project is currently under active development and not ready for production use. Features may be incomplete or subject to change.

A Model Context Protocol (MCP) server providing AI assistants with access to Multi Theft Auto: San Andreas documentation through intelligent search and vector similarity.

**Note**: Not yet available on npm registry.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/Luminaire1337/mtasa-docs-mcp.git
cd mtasa-docs-mcp

# Install dependencies
pnpm install

# If optional native dependencies were skipped by your environment,
# reinstall to fetch sqlite-vector platform binaries:
pnpm install --force

# If native bindings were skipped, rebuild better-sqlite3:
pnpm rebuild better-sqlite3 --config.ignore-scripts=false

# Build the project
pnpm build

# Test with MCP inspector
pnpm inspector

# Run automated test suite
pnpm test
```

## What It Does

This MCP server gives AI assistants access to MTA:SA function documentation with:

- Vector similarity search for finding relevant functions
- Event-first discovery tools for event handler workflows
- Smart keyword expansion (e.g., "database" → finds `dbQuery`, `dbPoll`)
- Deprecation warnings for outdated functions
- SQLite caching for fast repeated access
- MCP-first workflow guidance prompt/tool to reduce manual wiki fetching

## Tools

- `search_functions` - Search functions/events by name and side
- `search_events` - Search only events (client/server)
- `find_functions_for_task` - Semantic task-to-function/event matching
- `find_events_for_task` - Semantic task-to-event matching
- `get_function_docs` - Fetch docs for exactly one function/event
- `get_multiple_function_docs` - Batch docs retrieval for multiple names
- `get_function_examples` - Extract examples only
- `list_functions_by_category` - Browse entries by category
- `get_cache_stats` - Cache stats
- `recommend_doc_workflow` - MCP-first call-plan helper
- `clear_cache` - Clear one or all cached docs

Notes:

- Prefer `get_multiple_function_docs` for multi-name lookups instead of repeated single-doc calls.
- Optional arguments are hidden by default in docs responses; set `include_optional_arguments` to `true` when needed.

## Documentation

- **[AGENTS.md](AGENTS.md)** - Complete technical documentation for developers
- **[FEATURES.md](FEATURES.md)** - Planned features and roadmap

## Testing

- `pnpm test` - Run unit tests with Vitest
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:coverage` - Run tests with coverage report
- `pnpm test:live` - Run live integration tests against MTA wiki pages
- `pnpm check:versions` - Ensure package/server versions match
- `pnpm check:tool-names` - Ensure legacy tool/prompt names are not reintroduced
- `pnpm smoke` - Build and run MCP client smoke checks
- `pnpm verify` - Run version checks, drift checks, tests, and smoke in one command
- `pnpm verify:full` - Run `verify` plus live wiki integration tests

## CI

- Pull requests and pushes to `master` run `.github/workflows/ci.yml` (`pnpm verify`).
- Live wiki checks run `.github/workflows/live-tests.yml` (`pnpm test:live`) only when:
  - manually triggered (`workflow_dispatch`), or
  - a PR has label `run-live-tests` and includes relevant file changes.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

See [LICENSE](LICENSE) file for details.
