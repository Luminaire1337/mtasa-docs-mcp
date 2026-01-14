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

# Build the project
pnpm build

# Test with MCP inspector
pnpm inspector
```

## What It Does

This MCP server gives AI assistants access to MTA:SA function documentation with:

- Vector similarity search for finding relevant functions
- Smart keyword expansion (e.g., "database" → finds `dbQuery`, `dbPoll`)
- Deprecation warnings for outdated functions
- SQLite caching for fast repeated access

## Documentation

- **[AGENTS.md](AGENTS.md)** - Complete technical documentation for developers
- **[FEATURES.md](FEATURES.md)** - Planned features and roadmap

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

See [LICENSE](LICENSE) file for details.
