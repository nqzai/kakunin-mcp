/**
 * @kakunin/mcp — Unit Tests
 *
 * Tests the three tool handlers directly (no MCP transport needed).
 * Mocks KakuninMcpClient to isolate tool logic.
 */

import { describe, it, expect, vi } from 'vitest';
import { verifyScopeHandler } from '../src/tools/verify-scope.js';
import { checkRiskHandler } from '../src/tools/check-risk.js';
import { auditLogAppendHandler } from '../src/tools/audit-log-append.js';
import type { KakuninMcpClient, AgentCertificate, RiskProfile } from '../src/client.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const activeCert: AgentCertificate = {
  id: 'cert_1',
  serial_number: 'c4f9-17a2',
  status: 'active',
  permitted_actions: ['read:invoices', 'write:drafts', 'transaction_initiated'],
  financial_scope: {
    max_single_trade_usd: 50_000,
    daily_limit_usd: 500_000,
    permitted_venues: ['euronext', 'xetra'],
  },
  expires_at: '2027-05-20T00:00:00Z',
};

const lowRiskProfile: RiskProfile = {
  agent_id: 'agt_1',
  avg_score: 0.12,
  dominant_band: 'low',
  drift: { drift_score: 0.05, drift_trend: 'stable' },
  recent_high_risk_events: [],
};

function makeClient(overrides: Partial<KakuninMcpClient> = {}): KakuninMcpClient {
  return {
    agentId: 'agt_1',
    getActiveCertificate: vi.fn().mockResolvedValue(activeCert),
    getRiskProfile: vi.fn().mockResolvedValue(lowRiskProfile),
    ingestEvent: vi.fn().mockResolvedValue({
      event_id: 'evt_abc',
      risk_score: 0.12,
      risk_band: 'low',
      revocation_check_queued: false,
    }),
    ...overrides,
  } as unknown as KakuninMcpClient;
}

// ── verify_agent_scope ────────────────────────────────────────────────────────

describe('verify_agent_scope', () => {
  it('allows a permitted action by exact scope match', async () => {
    const client = makeClient();
    const result = await verifyScopeHandler(client, { action: 'read:invoices' });
    expect(result.allowed).toBe(true);
    expect(result.certificate_status).toBe('active');
  });

  it('denies an action not in permitted_actions', async () => {
    const client = makeClient();
    const result = await verifyScopeHandler(client, { action: 'write:orders' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in the permitted actions');
  });

  it('denies when no active certificate', async () => {
    const client = makeClient({
      getActiveCertificate: vi.fn().mockResolvedValue(null),
    });
    const result = await verifyScopeHandler(client, { action: 'read:invoices' });
    expect(result.allowed).toBe(false);
    expect(result.certificate_status).toBe('none');
  });

  it('denies when certificate is revoked', async () => {
    const client = makeClient({
      getActiveCertificate: vi.fn().mockResolvedValue({ ...activeCert, status: 'revoked' }),
    });
    const result = await verifyScopeHandler(client, { action: 'read:invoices' });
    expect(result.allowed).toBe(false);
    expect(result.certificate_status).toBe('revoked');
  });

  it('denies when transaction amount exceeds financial scope', async () => {
    const client = makeClient();
    const result = await verifyScopeHandler(client, {
      action: 'transaction_initiated',
      amount_usd: 100_000, // exceeds max_single_trade_usd: 50_000
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceeds the per-trade limit');
  });

  it('allows when transaction amount is within limit', async () => {
    const client = makeClient();
    const result = await verifyScopeHandler(client, {
      action: 'transaction_initiated',
      amount_usd: 25_000,
    });
    expect(result.allowed).toBe(true);
  });

  it('denies when venue not in permitted_venues', async () => {
    const client = makeClient();
    const result = await verifyScopeHandler(client, {
      action: 'transaction_initiated',
      venue: 'nasdaq', // not in ['euronext', 'xetra']
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in the permitted venues');
  });

  it('allows when venue is in permitted_venues', async () => {
    const client = makeClient();
    const result = await verifyScopeHandler(client, {
      action: 'transaction_initiated',
      venue: 'euronext',
    });
    expect(result.allowed).toBe(true);
  });

  it('returns permitted_actions in result', async () => {
    const client = makeClient();
    const result = await verifyScopeHandler(client, { action: 'read:invoices' });
    expect(result.permitted_actions).toEqual(activeCert.permitted_actions);
  });
});

// ── check_risk_score ──────────────────────────────────────────────────────────

describe('check_risk_score', () => {
  it('returns low risk profile with stable trend', async () => {
    const client = makeClient();
    const result = await checkRiskHandler(client);
    expect(result.band).toBe('low');
    expect(result.score).toBe(0.12);
    expect(result.trend).toBe('stable');
    expect(result.recommendation).toContain('LOW');
  });

  it('returns high risk recommendation with revocation warning', async () => {
    const client = makeClient({
      getRiskProfile: vi.fn().mockResolvedValue({
        ...lowRiskProfile,
        avg_score: 0.91,
        dominant_band: 'high',
        drift: { drift_score: 0.8, drift_trend: 'increasing' },
        recent_high_risk_events: [{ event_id: 'evt_x', action_type: 'transaction_anomaly', risk_score: 0.91, occurred_at: '2026-05-20T00:00:00Z' }],
      }),
    });
    const result = await checkRiskHandler(client);
    expect(result.band).toBe('high');
    expect(result.recommendation).toContain('HIGH');
    expect(result.recommendation).toContain('revocation');
    expect(result.recent_high_risk_events).toHaveLength(1);
  });

  it('returns medium increasing recommendation', async () => {
    const client = makeClient({
      getRiskProfile: vi.fn().mockResolvedValue({
        ...lowRiskProfile,
        avg_score: 0.45,
        dominant_band: 'medium',
        drift: { drift_score: 0.3, drift_trend: 'increasing' },
      }),
    });
    const result = await checkRiskHandler(client);
    expect(result.band).toBe('medium');
    expect(result.trend).toBe('increasing');
    expect(result.recommendation).toContain('increasing');
  });

  it('handles null drift (< 30 days of data)', async () => {
    const client = makeClient({
      getRiskProfile: vi.fn().mockResolvedValue({
        ...lowRiskProfile,
        drift: { drift_score: null, drift_trend: null },
      }),
    });
    const result = await checkRiskHandler(client);
    expect(result.trend).toBe('insufficient_data');
  });
});

// ── audit_log_append ──────────────────────────────────────────────────────────

describe('audit_log_append', () => {
  it('returns tx_id and risk score on success', async () => {
    const client = makeClient();
    const result = await auditLogAppendHandler(client, {
      event_type: 'transaction_initiated',
      metadata: { amount: 840, currency: 'EUR', venue: 'euronext' },
    });
    expect(result.inserted).toBe(true);
    expect(result.tx_id).toBe('evt_abc');
    expect(result.risk_band).toBe('low');
    expect(result.revocation_check_queued).toBe(false);
  });

  it('passes session_id through to ingestEvent', async () => {
    const ingestMock = vi.fn().mockResolvedValue({
      event_id: 'evt_xyz',
      risk_score: 0.3,
      risk_band: 'medium',
      revocation_check_queued: false,
    });
    const client = makeClient({ ingestEvent: ingestMock });

    await auditLogAppendHandler(client, {
      event_type: 'api_call',
      metadata: { endpoint: '/api/v1/invoices' },
      session_id: 'sess_123',
    });

    expect(ingestMock).toHaveBeenCalledWith(
      'api_call',
      { endpoint: '/api/v1/invoices' },
      'sess_123',
    );
  });

  it('flags revocation_check_queued on high-risk event', async () => {
    const client = makeClient({
      ingestEvent: vi.fn().mockResolvedValue({
        event_id: 'evt_high',
        risk_score: 0.91,
        risk_band: 'high',
        revocation_check_queued: true,
      }),
    });
    const result = await auditLogAppendHandler(client, {
      event_type: 'unauthorized_access_attempt',
      metadata: { attempted_endpoint: '/admin/secrets' },
    });
    expect(result.revocation_check_queued).toBe(true);
    expect(result.risk_band).toBe('high');
  });
});
