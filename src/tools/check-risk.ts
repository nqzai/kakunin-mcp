/**
 * check_risk_score tool
 *
 * Returns the agent's rolling 30-day risk profile.
 * Enables the agent to self-throttle, escalate to human review,
 * or refuse a high-risk action before executing it.
 *
 * No input required — the agent ID is set at server startup.
 */

import type { KakuninMcpClient, RiskProfile } from '../client.js';

export interface CheckRiskResult {
  score: number;
  band: 'low' | 'medium' | 'high';
  trend: 'increasing' | 'decreasing' | 'stable' | 'insufficient_data';
  /** Guidance the agent can act on */
  recommendation: string;
  recent_high_risk_events: RiskProfile['recent_high_risk_events'];
  checked_at: string;
}

export async function checkRiskHandler(client: KakuninMcpClient): Promise<CheckRiskResult> {
  const profile = await client.getRiskProfile();
  const checkedAt = new Date().toISOString();

  const trend = profile.drift.drift_trend ?? 'insufficient_data';

  const recommendation = buildRecommendation(profile.dominant_band, trend, profile.avg_score);

  return {
    score: profile.avg_score,
    band: profile.dominant_band,
    trend,
    recommendation,
    recent_high_risk_events: profile.recent_high_risk_events,
    checked_at: checkedAt,
  };
}

function buildRecommendation(
  band: 'low' | 'medium' | 'high',
  trend: 'increasing' | 'decreasing' | 'stable' | 'insufficient_data',
  score: number,
): string {
  if (band === 'high') {
    return (
      `Risk score ${score.toFixed(2)} is HIGH. Certificate revocation check has been queued. ` +
      'You should pause non-essential operations and notify your human operator immediately.'
    );
  }

  if (band === 'medium' && trend === 'increasing') {
    return (
      `Risk score ${score.toFixed(2)} is MEDIUM and increasing. ` +
      'Consider reducing transaction frequency or scope until trend stabilises.'
    );
  }

  if (band === 'medium') {
    return (
      `Risk score ${score.toFixed(2)} is MEDIUM. ` +
      'Continue with caution — avoid high-value or irreversible operations without human confirmation.'
    );
  }

  if (trend === 'increasing') {
    return (
      `Risk score ${score.toFixed(2)} is LOW but trend is increasing. ` +
      'Monitor closely — consider logging additional context with audit_log_append.'
    );
  }

  return `Risk score ${score.toFixed(2)} is LOW. Normal operations permitted.`;
}
