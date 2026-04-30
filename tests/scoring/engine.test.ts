import { describe, it, expect } from "vitest";
import { score, defaultRuleset } from "@crawlix/scoring";
import {
  BusinessStatus,
  PriorityTier,
  WebsiteHealth,
  WebsiteStatus,
} from "@crawlix/shared";
import type { ScorableLead } from "@crawlix/scoring";

const baseLead = (overrides: Partial<ScorableLead> = {}): ScorableLead => ({
  id: "l1",
  websiteStatus: WebsiteStatus.UNKNOWN,
  websiteHealth: null,
  websiteHealthScore: null,
  businessStatus: BusinessStatus.OPERATIONAL,
  rating: null,
  reviewCount: null,
  city: null,
  state: null,
  country: null,
  categoryPrimary: null,
  categories: [],
  phone: null,
  website: null,
  ...overrides,
});

describe("scoring engine", () => {
  it("clamps score between 0 and 100", () => {
    const lead = baseLead({
      websiteStatus: WebsiteStatus.HIGH_CONFIDENCE_NONE,
      websiteHealth: WebsiteHealth.UNREACHABLE,
      reviewCount: 250,
      rating: 4.8,
    });
    const r = score(lead, defaultRuleset);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("promotes a no-website + operational lead to HIGH/MEDIUM", () => {
    const lead = baseLead({
      websiteStatus: WebsiteStatus.HIGH_CONFIDENCE_NONE,
      reviewCount: 30,
      rating: 4.5,
    });
    const r = score(lead, defaultRuleset);
    expect(r.score).toBeGreaterThanOrEqual(45);
    expect([PriorityTier.HIGH, PriorityTier.MEDIUM]).toContain(r.priorityTier);
  });

  it("demotes a fresh-website lead to NOT_RECOMMENDED", () => {
    const lead = baseLead({
      websiteStatus: WebsiteStatus.EXISTS,
      websiteHealth: WebsiteHealth.FRESH,
    });
    const r = score(lead, defaultRuleset);
    // Modern site + no contacts + no location → below the low threshold (score < 20)
    expect(r.priorityTier).toBe(PriorityTier.NOT_RECOMMENDED);
  });

  it("punishes permanently closed leads", () => {
    const closed = score(
      baseLead({ businessStatus: BusinessStatus.CLOSED_PERM }),
      defaultRuleset,
    );
    const open = score(
      baseLead({ businessStatus: BusinessStatus.OPERATIONAL }),
      defaultRuleset,
    );
    expect(closed.score).toBeLessThan(open.score);
  });

  it("returns rule breakdown", () => {
    const r = score(
      baseLead({ websiteStatus: WebsiteStatus.HIGH_CONFIDENCE_NONE }),
      defaultRuleset,
    );
    expect(r.breakdown.length).toBeGreaterThan(0);
    expect(r.breakdown[0]).toHaveProperty("ruleId");
    expect(r.breakdown[0]).toHaveProperty("reason");
  });

  it("emits the ruleset version", () => {
    const r = score(baseLead(), defaultRuleset);
    expect(r.rulesetVersion).toBe(defaultRuleset.version);
  });
});
