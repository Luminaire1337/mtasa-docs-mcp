# MTA:SA Documentation MCP Server

An MCP (Model Context Protocol) server that gives AI assistants reliable,
structured access to Multi Theft Auto: San Andreas documentation.

It combines fast keyword search, semantic matching, and SQLite-backed caching so
agents can discover the right APIs and fetch authoritative docs without manual
wiki scraping.

## Highlights

- 11 MCP tools for discovery, docs retrieval, cache operations, and workflow
  guidance
- Event-first discovery (`search_events`, `find_events_for_task`)
- Semantic task matching with SQLite vector search
- Smart keyword expansion (for example, `database` -> `db*` APIs)
- Built-in deprecation detection and warnings
- Local SQLite cache with configurable lifetime
- CI verification gates, smoke tests, and release automation

## Installation

Requirements:

- Node.js 24+
- pnpm 10+ (for local development)

Launcher note:

- You can launch/install via `npx`, `pnpx`, `bunx`, or yarn dlx-style flows,
  but this package still runs on the Node.js runtime.

### From npm (recommended)

```bash
npm install -g mtasa-docs-mcp
```

or:

```bash
pnpm add -g mtasa-docs-mcp
```

### From source

```bash
git clone https://github.com/Luminaire1337/mtasa-docs-mcp.git
cd mtasa-docs-mcp
pnpm install
pnpm build
```

If your environment skips optional native dependencies, run:

```bash
pnpm install --force
pnpm rebuild better-sqlite3 --config.ignore-scripts=false
```

## MCP Configuration

### Option 1: Run installed binary

```json
{
  "mcpServers": {
    "mtasa-docs": {
      "command": "mtasa-docs-mcp"
    }
  }
}
```

### Option 2: Run with npx

```json
{
  "mcpServers": {
    "mtasa-docs": {
      "command": "npx",
      "args": ["-y", "mtasa-docs-mcp"]
    }
  }
}
```

### Option 3: Run local build

```json
{
  "mcpServers": {
    "mtasa-docs": {
      "command": "node",
      "args": ["/absolute/path/to/mtasa-docs-mcp/build/index.js"]
    }
  }
}
```

## Available Tools

- `search_functions`
- `search_events`
- `find_functions_for_task`
- `find_events_for_task`
- `get_function_docs`
- `get_multiple_function_docs`
- `get_function_examples`
- `list_functions_by_category`
- `get_cache_stats`
- `recommend_doc_workflow`
- `clear_cache`

## Development

```bash
pnpm build
pnpm test
pnpm smoke
pnpm verify
pnpm verify:full
```

Useful checks:

- `pnpm check:versions` - keep `package.json` and MCP server version aligned
- `pnpm check:changelog` - ensure `CHANGELOG.md` has current release heading
- `pnpm check:tool-names` - prevent legacy tool naming regressions

Scripts are located in `scripts/` (build, smoke, release guards).

## Release Flow

Release automation is handled by `.github/workflows/release.yml`.

1. Bump version in `package.json` and `src/index.ts`.
2. Move release notes from `Unreleased` into a versioned section in
   `CHANGELOG.md` using `## [x.y.z] - YYYY-MM-DD`.
3. Merge to `master`.

Branching policy:

- Before `v1.0.0`: direct pushes to `master` are allowed.
- Starting at `v1.0.0`: use PR-based development for all changes to `master`.

On `master`, the release workflow:

- checks whether the version already exists on npm
- runs `pnpm verify:full`
- publishes to npm with provenance using trusted publishing (OIDC)
- creates/updates the GitHub Release from `CHANGELOG.md`
- verifies installability of the published package and runs smoke tests

### Maintainer setup for npm trusted publishing

In npm package settings, configure a trusted publisher for this repository and
workflow:

- Repository: `Luminaire1337/mtasa-docs-mcp`
- Workflow file: `.github/workflows/release.yml`
- Environment (if used): match your GitHub Actions configuration

## CI Workflows

- `.github/workflows/ci.yml` - verification on push/PR to `master` (Ubuntu +
  macOS)
- `.github/workflows/live-tests.yml` - optional live wiki integration tests
- `.github/workflows/release.yml` - automated publish and GitHub release on
  `master`

## Project Docs

- `AGENTS.md` - architecture and contributor guidance
- `FEATURES.md` - roadmap and ideas
- `CHANGELOG.md` - release history

## License

GNU General Public License v3.0. See `LICENSE`.
