/**
 * Kakunin MCP — thin API client
 *
 * Shared HTTP wrapper used by all three MCP tools.
 * Authenticates with the agent's API key via Bearer token.
 * No retry logic — MCP tools are called in LLM context where
 * latency matters; callers should handle transient failures.
 */

const DEFAULT_BASE_URL = 'https://api.kakunin.ai/v1';

export interface KakuninMcpConfig {
  apiKey: string;
  agentId: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface AgentCertificate {
  id: string;
  serial_number: string;
  status: 'active' | 'revoked' | 'expired';
  permitted_actions: string[];
  financial_scope?: {
    max_single_trade_usd?: number;
    daily_limit_usd?: number;
    permitted_instruments?: string[];
    permitted_venues?: string[];
    leverage_permitted?: boolean;
  };
  expires_at: string;
}

export interface RiskProfile {
  agent_id: string;
  avg_score: number;
  dominant_band: 'low' | 'medium' | 'high';
  drift: {
    drift_score: number | null;
    drift_trend: 'increasing' | 'decreasing' | 'stable' | null;
  };
  recent_high_risk_events: Array<{
    event_id: string;
    action_type: string;
    risk_score: number;
    occurred_at: string;
  }>;
}

export interface IngestResult {
  event_id: string;
  risk_score: number;
  risk_band: 'low' | 'medium' | 'high';
  revocation_check_queued: boolean;
}

export class KakuninMcpClient {
  private readonly apiKey: string;
  readonly agentId: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: KakuninMcpConfig) {
    this.apiKey = config.apiKey;
    this.agentId = config.agentId;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? 8_000;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': `@kakunin/mcp/0.1.0`,
          ...options.headers,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
      throw new Error(`Kakunin API error ${res.status}: ${body.error ?? res.statusText}`);
    }

    const json = await res.json() as { data: T };
    return json.data;
  }

  /** Fetch the agent's current active certificate, including permitted_actions. */
  async getActiveCertificate(): Promise<AgentCertificate | null> {
    const agent = await this.request<{ certificates: AgentCertificate[] }>(
      `/agents/${this.agentId}`,
    );
    // certificates are sorted newest-first
    const active = agent.certificates.find((c) => c.status === 'active');
    return active ?? null;
  }

  /** Fetch rolling 30-day risk profile. */
  async getRiskProfile(): Promise<RiskProfile> {
    return this.request<RiskProfile>(`/agents/${this.agentId}/risk`);
  }

  /** Ingest a behavioral event. Returns risk score synchronously. */
  async ingestEvent(
    actionType: string,
    metadata: Record<string, unknown>,
    sessionId?: string,
  ): Promise<IngestResult> {
    return this.request<IngestResult>('/events', {
      method: 'POST',
      body: JSON.stringify({
        agent_id: this.agentId,
        action_type: actionType,
        details: metadata,
        ...(sessionId !== undefined ? { session_id: sessionId } : {}),
        occurred_at: new Date().toISOString(),
      }),
    });
  }
}
