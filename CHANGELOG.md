# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/).

## [0.2.2] — 2026-07-08
### Changed
- Manifest marks `KAKUNIN_API_KEY` / `KAKUNIN_AGENT_ID` as not required to start,
  so registries can install and introspect the server.
- Corrected package license to Apache-2.0 (matches the LICENSE file).

## [0.2.1] — 2026-07-08
### Fixed
- Lazy auth — the server registers and lists its tools without credentials;
  credentials are only required when a tool is actually invoked.
### Added
- Dockerfile for registry builds (e.g. Glama).

## [0.2.0] — 2026-07-07
### Added
- Public release of `@kakunin/mcp` (Apache-2.0) with provenance: tools
  `verify_agent_scope`, `check_risk_score`, `audit_log_append`.
