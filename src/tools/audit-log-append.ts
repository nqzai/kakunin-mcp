/**
 * audit_log_append tool
 *
 * Lets an agent voluntarily submit a behavioral event to Kakunin.
 * This feeds the rolling risk score and produces an immutable audit trail.
 *
 * Fire-and-forget safe: the MCP server awaits the call, but the risk scoring
 * is synchronous on the API side (p99 200ms). The LLM gets back a tx_id
 * it can reference if the event is later queried.
 */

import { z } from 'zod';
import type { KakuninMcpClient } from '../client.js';

// Mirror the action type enum from @kakunin/sdk for consistency
const ACTION_TYPES = [
  'api_call',
  'authentication_attempt',
  'authentication_failure',
  'data_access',
  'data_mutation',
  'transaction_initiated',
  'transaction_anomaly',
  'unauthorized_access_attempt',
  'message_signed',
  'message_verification_failed',
] as const;

export const auditLogAppendInputSchema = z.object({
  event_type: z
    .enum(ACTION_TYPES)
    .describe(
      'Type of behavioral event being logged. ' +
        'Use "transaction_initiated" for financial operations, ' +
        '"data_mutation" for write/delete ops, ' +
        '"api_call" for standard API calls.',
    ),
  metadata: z
    .record(z.string(), z.unknown())
    .describe(
      'Arbitrary key-value pairs describing the event. ' +
        'For transactions: include amount, currency, venue. ' +
        'For data ops: include resource_type, resource_id, operation. ' +
        'Avoid PII — this is stored in the immutable audit log.',
    ),
  session_id: z
    .string()
    .optional()
    .describe('Optional session ID for grouping related events in the audit trail.'),
});

export type AuditLogAppendInput = z.infer<typeof auditLogAppendInputSchema>;

export interface AuditLogAppendResult {
  inserted: boolean;
  tx_id: string;
  risk_score: number;
  risk_band: 'low' | 'medium' | 'high';
  /** True if the platform has queued a certificate revocation check */
  revocation_check_queued: boolean;
  logged_at: string;
}

export async function auditLogAppendHandler(
  client: KakuninMcpClient,
  input: AuditLogAppendInput,
): Promise<AuditLogAppendResult> {
  const result = await client.ingestEvent(
    input.event_type,
    input.metadata,
    input.session_id,
  );

  return {
    inserted: true,
    tx_id: result.event_id,
    risk_score: result.risk_score,
    risk_band: result.risk_band,
    revocation_check_queued: result.revocation_check_queued,
    logged_at: new Date().toISOString(),
  };
}
