/**
 * verify_agent_scope tool
 *
 * Lets an agent ask: "Am I allowed to call this endpoint / perform this action?"
 * Checks the agent's active certificate for permitted_actions and revocation status.
 *
 * Returns immediately with a definitive allowed/denied answer + reason,
 * so the LLM can decide before making the call — not after.
 */

import { z } from 'zod';
import type { KakuninMcpClient } from '../client.js';

export const verifyScopeInputSchema = z.object({
  action: z
    .string()
    .min(1)
    .describe(
      'The action or endpoint the agent wants to perform. ' +
        'Can be a scope string (e.g. "write:invoices"), an API path ' +
        '(e.g. "/api/v1/execute_trade"), or a plain description ' +
        '(e.g. "initiate EUR/USD trade on euronext for 50000 USD").',
    ),
  venue: z
    .string()
    .optional()
    .describe('Optional trading venue or system being accessed (e.g. "euronext", "xetra").'),
  amount_usd: z
    .number()
    .optional()
    .describe('Optional transaction amount in USD for financial scope enforcement.'),
});

export type VerifyScopeInput = z.infer<typeof verifyScopeInputSchema>;

export interface VerifyScopeResult {
  allowed: boolean;
  reason: string;
  certificate_status: 'active' | 'revoked' | 'expired' | 'none';
  permitted_actions: string[];
  checked_at: string;
}

export async function verifyScopeHandler(
  client: KakuninMcpClient,
  input: VerifyScopeInput,
): Promise<VerifyScopeResult> {
  const cert = await client.getActiveCertificate();
  const checkedAt = new Date().toISOString();

  if (!cert) {
    return {
      allowed: false,
      reason: 'No active certificate found. Agent must be certified before performing actions.',
      certificate_status: 'none',
      permitted_actions: [],
      checked_at: checkedAt,
    };
  }

  if (cert.status !== 'active') {
    return {
      allowed: false,
      reason: `Certificate is ${cert.status}. All actions are blocked until a new certificate is issued.`,
      certificate_status: cert.status,
      permitted_actions: cert.permitted_actions,
      checked_at: checkedAt,
    };
  }

  // Check financial scope constraints when relevant
  if (input.amount_usd !== undefined && cert.financial_scope?.max_single_trade_usd !== undefined) {
    if (input.amount_usd > cert.financial_scope.max_single_trade_usd) {
      return {
        allowed: false,
        reason: `Transaction amount $${input.amount_usd.toLocaleString()} USD exceeds the per-trade limit of $${cert.financial_scope.max_single_trade_usd.toLocaleString()} USD encoded in this certificate.`,
        certificate_status: 'active',
        permitted_actions: cert.permitted_actions,
        checked_at: checkedAt,
      };
    }
  }

  if (input.venue !== undefined && cert.financial_scope?.permitted_venues !== undefined) {
    const venues = cert.financial_scope.permitted_venues;
    if (!venues.includes(input.venue)) {
      return {
        allowed: false,
        reason: `Venue "${input.venue}" is not in the permitted venues list: ${venues.join(', ')}.`,
        certificate_status: 'active',
        permitted_actions: cert.permitted_actions,
        checked_at: checkedAt,
      };
    }
  }

  // Check permitted_actions scope strings
  // Match by: exact match, prefix match (e.g. "write:*" covers "write:invoices"),
  // or path-segment match for API-style paths
  const action = input.action;
  const allowed = isActionPermitted(action, cert.permitted_actions);

  return {
    allowed,
    reason: allowed
      ? `Action "${action}" is within the scope of this certificate.`
      : `Action "${action}" is not in the permitted actions for this certificate. Permitted: ${cert.permitted_actions.join(', ')}.`,
    certificate_status: 'active',
    permitted_actions: cert.permitted_actions,
    checked_at: checkedAt,
  };
}

/**
 * Check if a requested action is covered by the list of permitted actions.
 * Supports exact match, wildcard prefix (write:*), and substring match
 * for API-path style queries.
 */
function isActionPermitted(action: string, permitted: string[]): boolean {
  const normalized = action.toLowerCase().trim();

  for (const perm of permitted) {
    const p = perm.toLowerCase().trim();

    // Exact match
    if (p === normalized) return true;

    // Wildcard: "write:*" covers "write:anything"
    if (p.endsWith(':*')) {
      const prefix = p.slice(0, -1); // "write:"
      if (normalized.startsWith(prefix)) return true;
    }

    // API path: permitted "write:invoices" should cover "/api/v1/invoices" writes
    // Extract resource name from scope and check if it appears in the path
    if (normalized.startsWith('/') || normalized.startsWith('http')) {
      const resource = p.includes(':') ? p.split(':')[1] : p;
      if (resource && normalized.includes(resource)) return true;
    }

    // Plain keyword match for natural-language queries
    if (!normalized.startsWith('/') && !normalized.includes(':')) {
      if (p.includes(normalized) || normalized.includes(p.replace(/.*:/, ''))) return true;
    }
  }

  return false;
}
