import { PriorityTier } from "@crawlix/shared";
import type {
  Ruleset,
  ScorableLead,
  ScoreContribution,
  ScoreResult,
} from "./types";

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

  // §10.1 — 5-tier classification
  let tier: PriorityTier;
  if (clamped >= ruleset.tiers.critical) {
    tier = PriorityTier.CRITICAL;
  } else if (clamped >= ruleset.tiers.high) {
    tier = PriorityTier.HIGH;
  } else if (clamped >= ruleset.tiers.medium) {
    tier = PriorityTier.MEDIUM;
  } else if (clamped >= ruleset.tiers.low) {
    tier = PriorityTier.LOW;
  } else {
    tier = PriorityTier.NOT_RECOMMENDED;
  }

  return {
    score: clamped,
    priorityTier: tier,
    breakdown,
    rulesetVersion: ruleset.version,
  };
}
