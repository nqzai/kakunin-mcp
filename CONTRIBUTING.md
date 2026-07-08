# Contributing

Thanks for your interest in improving the Kakunin MCP server.

## Ground rules

- **Solo-maintainer project (for now).** Best-effort support; triage target is one week. Small, focused PRs get reviewed fastest.
- **Security issues:** never open a public issue — see [SECURITY.md](./SECURITY.md).
- By contributing you agree that your contributions are licensed under Apache-2.0. A lightweight CLA check runs on your first PR.

## Development

```bash
npm ci
npm test
npm run typecheck
npm run build
```

The server exposes MCP tools (`verify-scope`, `check-risk`, `audit-log`) over stdio. Test tool behavior against the sandbox using a `kak_test_` key.

## Pull requests

1. Open an issue first for anything beyond a small fix — new tools or protocol changes need discussion.
2. Add or update tests for any behavior change.
3. Keep the tool surface and `server.json` manifest in sync; bump the version on any tool change.
4. CI must be green: build, tests, type-check.

## What we're looking for

- Bug fixes with reproduction tests
- New MCP tools that map to real Kakunin API capabilities
- Documentation improvements

## What belongs elsewhere

Features that touch the hosted platform (new API endpoints, compliance report formats, billing) are not implementable from this repository — open an issue to discuss and we'll route it.

## Claiming an issue

Before you start working on an issue, comment `/assign` on it — our bot assigns it
to you automatically. This prevents two people building the same thing (which has
already happened a couple of times). Changed your mind? Comment `/unassign`.
