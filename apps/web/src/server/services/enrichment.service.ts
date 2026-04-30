// apps/web/src/server/services/enrichment.service.ts
//
// Module #4 — Lead enrichment pipeline.
//
// Manages on-demand enrichment of leads. For each (leadId, kind) tuple it:
//  1. Creates an Enrichment row with status QUEUED.
//  2. Enqueues the appropriate worker job.
//
// Currently the worker runs WEBSITE_VALIDATION end-to-end. Other kinds are
// queued and recorded so an external provider integration can be plugged in
// later — the worker dispatch is responsible for either executing or marking
// SKIPPED with a clear reason.

import { withOrg } from "@crawlix/db";
import {
  EnrichmentKind,
  EnrichmentStatus,
  JobName,
  QueueName,
} from "@crawlix/shared";
import { enqueue } from "@/lib/queue";

export type EnrichmentKindStr =
  | "WEBSITE_VALIDATION"
  | "EMAIL"
  | "EMAIL_VERIFY"
  | "SOCIAL"
  | "COMPANY"
  | "CONTACT";

export interface EnrichmentDto {
  id: string;
  leadId: string;
  leadName: string | null;
  kind: EnrichmentKindStr;
  provider: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  attempts: number;
  cost: number;
  error: string | null;
  normalized: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

const JOB_BY_KIND: Record<EnrichmentKindStr, string> = {
  WEBSITE_VALIDATION: JobName.ENRICH_WEBSITE,
  EMAIL: JobName.ENRICH_EMAIL,
  EMAIL_VERIFY: JobName.ENRICH_EMAIL_VERIFY,
  SOCIAL: JobName.ENRICH_SOCIAL,
  COMPANY: JobName.ENRICH_COMPANY,
  CONTACT: JobName.ENRICH_CONTACT,
};

const PROVIDER_BY_KIND: Record<EnrichmentKindStr, string> = {
  WEBSITE_VALIDATION: "crawlix-auditor",
  EMAIL: "crawlix-email",
  EMAIL_VERIFY: "crawlix-verifier",
  SOCIAL: "crawlix-social",
  COMPANY: "crawlix-company",
  CONTACT: "crawlix-contact",
};

export interface QueueInput {
  leadId: string;
  kinds: EnrichmentKindStr[];
}

export interface BulkQueueInput {
  leadIds: string[];
  kinds: EnrichmentKindStr[];
}

interface QueueOneResult {
  leadId: string;
  kind: EnrichmentKindStr;
  enrichmentId?: string;
  error?: string;
}

async function queueOne(
  orgId: string,
  leadId: string,
  kind: EnrichmentKindStr,
): Promise<QueueOneResult> {
  return withOrg(orgId, async (tx) => {
    const lead = await tx.lead.findFirst({
      where: { id: leadId, organizationId: orgId },
      select: { id: true, website: true, email: true },
    });
    if (!lead) return { leadId, kind, error: "LEAD_NOT_FOUND" };

    // Skip pre-conditions per kind to avoid pointless work.
    if (kind === "WEBSITE_VALIDATION" && !lead.website) {
      return { leadId, kind, error: "NO_WEBSITE" };
    }
    if (kind === "EMAIL_VERIFY" && !lead.email) {
      return { leadId, kind, error: "NO_EMAIL" };
    }

    const enrichment = await tx.enrichment.create({
      data: {
        organizationId: orgId,
        leadId,
        kind: EnrichmentKind[kind],
        provider: PROVIDER_BY_KIND[kind],
        status: EnrichmentStatus.QUEUED,
      },
    });

    await enqueue(QueueName.ENRICHMENT, JOB_BY_KIND[kind], {
      organizationId: orgId,
      enrichmentId: enrichment.id,
      leadId,
      kind: EnrichmentKind[kind],
      provider: PROVIDER_BY_KIND[kind],
    });
    return { leadId, kind, enrichmentId: enrichment.id };
  });
}

async function queue(
  orgId: string,
  input: QueueInput,
): Promise<QueueOneResult[]> {
  const results: QueueOneResult[] = [];
  for (const kind of input.kinds) {
    results.push(await queueOne(orgId, input.leadId, kind));
  }
  return results;
}

async function bulkQueue(
  orgId: string,
  input: BulkQueueInput,
): Promise<{
  queued: number;
  skipped: number;
  errors: QueueOneResult[];
}> {
  let queued = 0;
  let skipped = 0;
  const errors: QueueOneResult[] = [];
  // Cap batch size to avoid runaway costs.
  const ids = input.leadIds.slice(0, 1000);
  for (const leadId of ids) {
    for (const kind of input.kinds) {
      const r = await queueOne(orgId, leadId, kind);
      if (r.enrichmentId) queued++;
      else if (r.error === "NO_WEBSITE" || r.error === "NO_EMAIL") {
        skipped++;
      } else {
        errors.push(r);
      }
    }
  }
  return { queued, skipped, errors };
}

export interface ListOptions {
  status?: string;
  kind?: string;
  leadId?: string;
  limit?: number;
}

async function list(
  orgId: string,
  opts: ListOptions = {},
): Promise<EnrichmentDto[]> {
  return withOrg(orgId, async (tx) => {
    const limit = Math.min(500, Math.max(1, opts.limit ?? 200));
    const rows = await tx.enrichment.findMany({
      where: {
        organizationId: orgId,
        status: opts.status ? (opts.status as EnrichmentStatus) : undefined,
        kind: opts.kind ? (opts.kind as EnrichmentKind) : undefined,
        leadId: opts.leadId,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { lead: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      leadId: r.leadId,
      leadName: r.lead?.name ?? null,
      kind: r.kind as EnrichmentKindStr,
      provider: r.provider,
      status: r.status as EnrichmentDto["status"],
      attempts: r.attempts,
      cost: r.cost,
      error: r.error,
      normalized: r.normalized ?? null,
      startedAt: r.startedAt ? r.startedAt.toISOString() : null,
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

async function get(orgId: string, id: string): Promise<EnrichmentDto | null> {
  return withOrg(orgId, async (tx) => {
    const row = await tx.enrichment.findFirst({
      where: { id, organizationId: orgId },
      include: { lead: { select: { name: true } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      leadId: row.leadId,
      leadName: row.lead?.name ?? null,
      kind: row.kind as EnrichmentKindStr,
      provider: row.provider,
      status: row.status as EnrichmentDto["status"],
      attempts: row.attempts,
      cost: row.cost,
      error: row.error,
      normalized: row.normalized ?? null,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

async function summary(
  orgId: string,
): Promise<{ status: string; count: number }[]> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx.enrichment.groupBy({
      by: ["status"],
      where: { organizationId: orgId },
      _count: { _all: true },
    });
    return rows.map((r) => ({ status: r.status, count: r._count._all }));
  });
}

export const enrichmentService = { queue, bulkQueue, list, get, summary };
