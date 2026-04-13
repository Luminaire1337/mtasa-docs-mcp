# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- No changes yet.

## [1.0.1] - 2026-04-13

### Changed

- Simplified CI/release automation by consolidating the live test workflow into
  `ci.yml` and streamlining release jobs.
- Hardened release publishing for tag-triggered detached HEAD runs.
- Updated README install guidance and Cursor quick-install button behavior.

## [1.0.0] - 2026-04-13

### Added

- Added a release workflow that publishes to npm using trusted publishing
  (OIDC + provenance) and creates GitHub Releases from changelog entries.
- Added `CHANGELOG.md` validation (`pnpm check:changelog`) and release utility
  scripts for tag/version consistency and release note extraction.

### Changed

- Expanded CI verification to run on both Ubuntu and macOS for better native
  module coverage.
- Updated README with production-ready installation, usage, CI, and release
  guidance.
- Added one-click MCP install links and expanded manual setup instructions for
  popular MCP clients.
- Added a public security policy with private vulnerability reporting guidance.

### Fixed

- Made smoke verification derive tools and prompts dynamically from source registration to reduce manual drift.

[Unreleased]: https://github.com/Luminaire1337/mtasa-docs-mcp/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/Luminaire1337/mtasa-docs-mcp/releases/tag/v1.0.1
[1.0.0]: https://github.com/Luminaire1337/mtasa-docs-mcp/releases/tag/v1.0.0
