import { PriorityTier } from '@crawlix/shared';
import type { Ruleset, ScorableLead, ScoreContribution, ScoreResult } from './types.js';

export function score(lead: ScorableLead, ruleset: Ruleset): ScoreResult {
  const breakdown: ScoreContribution[] = [];
  let total = 0;

  for (const rule of ruleset.rules) {
    if (!rule.applies(lead)) continue;
    const { contribution, reason } = rule.evaluate(lead);
    const weighted = contribution * rule.weight;
    total += weighted;
    breakdown.push({
      ruleId: rule.id,
      weight: rule.weight,
      contribution: weighted,
      reason,
    });
  }

  const clamped = Math.max(0, Math.min(100, Math.round(total)));
  const tier: PriorityTier =
    clamped >= ruleset.tiers.high
      ? PriorityTier.HIGH
      : clamped >= ruleset.tiers.medium
      ? PriorityTier.MEDIUM
      : PriorityTier.LOW;

  return { score: clamped, priorityTier: tier, breakdown, rulesetVersion: ruleset.version };
}
