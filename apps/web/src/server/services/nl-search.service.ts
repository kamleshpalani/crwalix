// apps/web/src/server/services/nl-search.service.ts
//
// Phase 4.6 — Natural-language search across leads, deals, and projects.
//
// Pipeline:
//   1. Hand the query to the LLM, get back a strongly-typed filter spec.
//   2. Translate the spec into Prisma queries (org-scoped via withOrg).
//   3. Return up to 25 results per entity + the spec for transparency.
//
// All filters are validated/clamped in `parseSearchQuery`; we still defend
// here by ignoring undefined values rather than passing them to Prisma.

import { withOrg } from "@crawlix/db";
import {
  parseSearchQuery,
  type NlSearchSpec,
  type SearchEntity,
} from "@crawlix/ai";

const PER_ENTITY_LIMIT = 25;

export interface NlSearchLeadHit {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  status: string;
  priorityTier: string | null;
  score: number | null;
  website: string | null;
  createdAt: string;
}

export interface NlSearchDealHit {
  id: string;
  title: string;
  status: "OPEN" | "WON" | "LOST";
  amountCents: number;
  currency: string;
  expectedCloseAt: string | null;
  createdAt: string;
}

export interface NlSearchProjectHit {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

export interface NlSearchResult {
  query: string;
  spec: NlSearchSpec;
  leads: NlSearchLeadHit[];
  deals: NlSearchDealHit[];
  projects: NlSearchProjectHit[];
  totals: { leads: number; deals: number; projects: number };
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  };
}

const DAY = 86_400_000;

function withinDate(days?: number): Date | undefined {
  if (!days) return undefined;
  return new Date(Date.now() - days * DAY);
}

export const nlSearchService = {
  async run(orgId: string, query: string): Promise<NlSearchResult> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return {
        query: trimmed,
        spec: { entities: [], interpretation: "Empty query." },
        leads: [],
        deals: [],
        projects: [],
        totals: { leads: 0, deals: 0, projects: 0 },
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costUsd: 0,
        },
      };
    }

    const parsed = await parseSearchQuery({
      organizationId: orgId,
      query: trimmed,
    });
    const { usage, ...spec } = parsed;

    const entities = new Set<SearchEntity>(spec.entities);

    const result = await withOrg(orgId, async (tx) => {
      const leadsP = entities.has("leads")
        ? (async () => {
            const f = spec.leads ?? {};
            const since = withinDate(f.createdWithinDays);
            const where: Record<string, unknown> = {};
            if (f.status && f.status.length > 0)
              where.status = { in: f.status };
            if (f.priorityTier && f.priorityTier.length > 0)
              where.priorityTier = { in: f.priorityTier };
            if (f.city && f.city.length > 0)
              where.city = { in: f.city, mode: "insensitive" };
            if (f.state && f.state.length > 0)
              where.state = { in: f.state, mode: "insensitive" };
            if (f.country && f.country.length > 0)
              where.country = { in: f.country, mode: "insensitive" };
            if (typeof f.hasWebsite === "boolean") {
              where.website = f.hasWebsite ? { not: null } : null;
            }
            if (typeof f.scoreGte === "number")
              where.score = { gte: f.scoreGte };
            if (since) where.createdAt = { gte: since };
            if (f.search && f.search.length > 0)
              where.name = { contains: f.search, mode: "insensitive" };

            const [rows, count] = await Promise.all([
              tx.lead.findMany({
                where,
                orderBy: [{ score: "desc" }, { createdAt: "desc" }],
                take: PER_ENTITY_LIMIT,
                select: {
                  id: true,
                  name: true,
                  city: true,
                  state: true,
                  status: true,
                  priorityTier: true,
                  score: true,
                  website: true,
                  createdAt: true,
                },
              }),
              tx.lead.count({ where }),
            ]);
            return { rows, count };
          })()
        : Promise.resolve({ rows: [], count: 0 });

      const dealsP = entities.has("deals")
        ? (async () => {
            const f = spec.deals ?? {};
            const since = withinDate(f.createdWithinDays);
            const expectedBefore = f.expectedCloseWithinDays
              ? new Date(Date.now() + f.expectedCloseWithinDays * DAY)
              : undefined;
            const where: Record<string, unknown> = {};
            if (f.status && f.status.length > 0)
              where.status = { in: f.status };
            if (
              typeof f.amountGteCents === "number" ||
              typeof f.amountLteCents === "number"
            ) {
              where.amountCents = {
                ...(typeof f.amountGteCents === "number"
                  ? { gte: f.amountGteCents }
                  : {}),
                ...(typeof f.amountLteCents === "number"
                  ? { lte: f.amountLteCents }
                  : {}),
              };
            }
            if (since) where.createdAt = { gte: since };
            if (expectedBefore)
              where.expectedCloseAt = { lte: expectedBefore, gte: new Date() };
            if (f.search && f.search.length > 0)
              where.title = { contains: f.search, mode: "insensitive" };

            const [rows, count] = await Promise.all([
              tx.deal.findMany({
                where,
                orderBy: [{ amountCents: "desc" }, { updatedAt: "desc" }],
                take: PER_ENTITY_LIMIT,
                select: {
                  id: true,
                  title: true,
                  status: true,
                  amountCents: true,
                  currency: true,
                  expectedCloseAt: true,
                  createdAt: true,
                },
              }),
              tx.deal.count({ where }),
            ]);
            return { rows, count };
          })()
        : Promise.resolve({ rows: [], count: 0 });

      const projectsP = entities.has("projects")
        ? (async () => {
            const f = spec.projects ?? {};
            const since = withinDate(f.createdWithinDays);
            const where: Record<string, unknown> = {};
            if (f.status && f.status.length > 0)
              where.status = { in: f.status };
            if (since) where.createdAt = { gte: since };
            if (f.search && f.search.length > 0)
              where.name = { contains: f.search, mode: "insensitive" };

            const [rows, count] = await Promise.all([
              tx.project.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: PER_ENTITY_LIMIT,
                select: {
                  id: true,
                  name: true,
                  status: true,
                  createdAt: true,
                },
              }),
              tx.project.count({ where }),
            ]);
            return { rows, count };
          })()
        : Promise.resolve({ rows: [], count: 0 });

      const [leads, deals, projects] = await Promise.all([
        leadsP,
        dealsP,
        projectsP,
      ]);
      return { leads, deals, projects };
    });

    return {
      query: trimmed,
      spec,
      leads: result.leads.rows.map((r) => ({
        id: r.id,
        name: r.name,
        city: r.city,
        state: r.state,
        status: r.status as string,
        priorityTier: r.priorityTier as string | null,
        score: r.score,
        website: r.website,
        createdAt: r.createdAt.toISOString(),
      })),
      deals: result.deals.rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status as "OPEN" | "WON" | "LOST",
        amountCents: r.amountCents,
        currency: r.currency,
        expectedCloseAt: r.expectedCloseAt
          ? r.expectedCloseAt.toISOString()
          : null,
        createdAt: r.createdAt.toISOString(),
      })),
      projects: result.projects.rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      totals: {
        leads: result.leads.count,
        deals: result.deals.count,
        projects: result.projects.count,
      },
      usage,
    };
  },
};
