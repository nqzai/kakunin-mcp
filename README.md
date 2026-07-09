# @kakunin/mcp — MCP server for AI agent identity & compliance

[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/kakunin-ai/kakunin-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/kakunin-ai/kakunin-mcp)
[![kakunin-mcp MCP server](https://glama.ai/mcp/servers/kakunin-ai/kakunin-mcp/badges/score.svg)](https://glama.ai/mcp/servers/kakunin-ai/kakunin-mcp)

<a href="https://glama.ai/mcp/servers/kakunin-ai/kakunin-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/kakunin-ai/kakunin-mcp/badges/card.svg" alt="kakunin-mcp MCP server" />
</a>

Model Context Protocol server for the [Kakunin](https://kakunin.ai) AI agent compliance API. Lets AI agents self-verify scope, check their own risk score, and log behavioral events — all from within Claude, Cursor, or any MCP-compatible runtime.

```bash
npx @kakunin/mcp
```

## Tools

### `verify_agent_scope`
Check whether this agent is authorised to perform an action before executing it. Verifies the active X.509 certificate, permitted_actions scope, financial limits, and revocation status.

```json
{
  "action": "initiate EUR/USD trade on euronext for 50000 USD",
  "venue": "euronext",
  "amount_usd": 50000
}
```

Returns `{ allowed: true|false, reason, certificate_status, permitted_actions }`.

### `check_risk_score`
Retrieve the agent's rolling 30-day risk score, band (`low`/`medium`/`high`), drift trend, and actionable guidance. No input required.

### `audit_log_append`
Append a behavioral event to the agent's immutable audit log. Returns risk score + transaction ID. Events scoring ≥ 0.85 auto-trigger a certificate revocation check.

```json
{
  "action_type": "transaction_initiated",
  "details": { "amount_usd": 50000, "venue": "NYSE" }
}
```

## Setup

**Prerequisites:** Node ≥ 18, Kakunin API key + Agent ID from [kakunin.ai/dashboard](https://kakunin.ai/dashboard).

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kakunin": {
      "command": "npx",
      "args": ["-y", "@kakunin/mcp"],
      "env": {
        "KAKUNIN_API_KEY": "kak_live_...",
        "KAKUNIN_AGENT_ID": "agt_..."
      }
    }
  }
}
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `KAKUNIN_API_KEY` | ✅ | API key (`kak_live_...` or `kak_test_...`) |
| `KAKUNIN_AGENT_ID` | ✅ | Agent ID the server acts on behalf of |
| `KAKUNIN_BASE_URL` | optional | Override API base (default: `https://kakunin.ai`) |

## Sandbox mode

Use a `kak_test_...` key for development — hits the sandbox CA, no cost, 100 free certs/day.

Full docs at [docs.kakunin.ai](https://docs.kakunin.ai).

## Contributors

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
<!-- ALL-CONTRIBUTORS-BADGE:END -->

Thanks to everyone who contributes ([emoji key](https://allcontributors.org/docs/en/emoji-key)) — code and non-code alike:

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

Contributions of any kind are welcome — this project follows the [all-contributors](https://allcontributors.org) spec.
