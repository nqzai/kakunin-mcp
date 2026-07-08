/**
 * Kakunin MCP Server
 *
 * Model Context Protocol server exposing three tools for AI agents:
 *   verify_agent_scope   — "Can I perform this action?" (scope + revocation check)
 *   check_risk_score     — rolling 30-day risk profile + self-throttle guidance
 *   audit_log_append     — voluntary behavioral event logging
 *
 * Transport: stdio (default) or SSE via --transport=sse flag.
 * Auth: KAKUNIN_API_KEY + KAKUNIN_AGENT_ID environment variables.
 *
 * Usage:
 *   npx @kakunin/mcp
 *   KAKUNIN_API_KEY=kak_live_... KAKUNIN_AGENT_ID=agt_... npx @kakunin/mcp
 *
 * MCP client config (e.g. Claude Desktop):
 *   {
 *     "mcpServers": {
 *       "kakunin": {
 *         "command": "npx",
 *         "args": ["-y", "@kakunin/mcp"],
 *         "env": {
 *           "KAKUNIN_API_KEY": "kak_live_...",
 *           "KAKUNIN_AGENT_ID": "agt_..."
 *         }
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { KakuninMcpClient } from './client.js';
import { verifyScopeInputSchema, verifyScopeHandler } from './tools/verify-scope.js';
import { checkRiskHandler } from './tools/check-risk.js';
import { auditLogAppendInputSchema, auditLogAppendHandler } from './tools/audit-log-append.js';

// ── Config from environment ───────────────────────────────────────────────────

const apiKey = process.env['KAKUNIN_API_KEY'];
const agentId = process.env['KAKUNIN_AGENT_ID'];
const baseUrl = process.env['KAKUNIN_BASE_URL'];

// Lazy client. The server registers and lists its tools WITHOUT any
// credentials, so registries and introspection tools can start it and read
// its tool list. Credentials are only required when a tool is actually called.
let _client: KakuninMcpClient | undefined;
function getClient(): KakuninMcpClient {
  if (!apiKey) {
    throw new Error(
      'KAKUNIN_API_KEY is required to call Kakunin tools. Set it in your MCP server environment.',
    );
  }
  if (!agentId) {
    throw new Error(
      'KAKUNIN_AGENT_ID is required to call Kakunin tools. Set it in your MCP server environment.',
    );
  }
  _client ??= new KakuninMcpClient({
    apiKey,
    agentId,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
  });
  return _client;
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'kakunin',
  version: '0.2.1',
});

// Tool 1: verify_agent_scope
server.tool(
  'verify_agent_scope',
  'Check whether this agent is authorised to perform a specific action or call a specific endpoint. ' +
    'Verifies the active X.509 certificate, permitted_actions scope, financial limits, and revocation status. ' +
    'Call this BEFORE executing any action that might exceed scope — not after.',
  verifyScopeInputSchema.shape,
  async (input) => {
    const result = await verifyScopeHandler(getClient(), input);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

// Tool 2: check_risk_score
server.tool(
  'check_risk_score',
  'Retrieve this agent\'s rolling 30-day risk score, risk band (low/medium/high), ' +
    'and drift trend. Returns actionable guidance — use this to decide whether to ' +
    'self-throttle, escalate to a human, or proceed normally.',
  // No input parameters
  {},
  async () => {
    const result = await checkRiskHandler(getClient());
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

// Tool 3: audit_log_append
server.tool(
  'audit_log_append',
  'Append a behavioral event to this agent\'s immutable audit log. ' +
    'Use this to voluntarily record actions — transactions, data operations, API calls. ' +
    'Returns the risk score for the event and a transaction ID for traceability. ' +
    'High-risk events (score >= 0.85) automatically trigger a certificate revocation check.',
  auditLogAppendInputSchema.shape,
  async (input) => {
    // Validate input against schema before passing to handler
    const parsed = auditLogAppendInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: parsed.error.message }, null, 2),
          },
        ],
        isError: true,
      };
    }
    const result = await auditLogAppendHandler(getClient(), parsed.data);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

// ── Transport ─────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

// Keep the process alive — MCP servers run until the client disconnects
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});
