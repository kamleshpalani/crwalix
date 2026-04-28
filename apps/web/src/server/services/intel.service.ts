import { withOrg } from '@crawlix/db';
import { Prisma } from '@crawlix/db';
import { JobName, QueueName } from '@crawlix/shared';
import { z } from 'zod';
import { enqueue } from '@/lib/queue';

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const urlField = z
  .string()
  .min(4)
  .max(2048)
  .transform((v) => v.trim())
  .refine((v) => v.length > 0, 'URL is required')
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    try {
      const u = new URL(v);
      return !!u.hostname && u.hostname.includes('.');
    } catch {
      return false;
    }
  }, 'Invalid URL');

export const CreateIntelReportSchema = z.object({
  title: z.string().min(2).max(120),
  primaryUrl: urlField,
  category: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  country: z.string().max(80).optional(),
  competitorUrls: z.array(urlField).max(8).default([]),
  autoDetectCompetitors: z.boolean().default(true),
  maxCompetitors: z.number().int().min(0).max(8).default(5),
  leadId: z.string().min(1).optional()
});
export type CreateIntelReportInput = z.infer<typeof CreateIntelReportSchema>;

// ---------------------------------------------------------------------------
// Types for the persisted summary payload
// ---------------------------------------------------------------------------

export interface IntelSiteSummary {
  id: string;
  name: string;
  url: string;
  finalUrl: string | null;
  reachable: boolean;
  health: string;
  scores: {
    health: number;
    design: number;
    mobile: number;
    performance: number;
    seo: number;
    contact: number;
    security: number;
    business: number;
    conversion: number;
    overall: number;
  };
  signals: Record<string, unknown> | null;
  strengths: string[];
  weaknesses: string[];
  screenshotUrl?: string | null;
  contacts?: {
    primaryEmail: string | null;
    decisionMakerName: string | null;
    source: 'hunter' | 'apollo' | null;
    emailStatus?: 'valid' | 'invalid' | 'risky' | 'unknown' | null;
  };
  pageSpeed?: {
    performance: number | null;
    lcpSeconds: number | null;
    cls: number | null;
    inpMs: number | null;
  } | null;
  estimated: { monthlyVisits: number | null; actualVisitsAvailable: false };
}

export interface IntelSummaryPayload {
  generatedAt: string;
  primary: IntelSiteSummary;
  competitors: IntelSiteSummary[];
  comparison: Record<string, { leader: string; runnerUp: string | null; values: Record<string, number | string | boolean | null> }>;
  gaps: string[];
  recommendations: { kind: 'quick_win' | 'strategic'; title: string; detail: string }[];
  disclaimers: string[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const intelService = {
  async list(orgId: string, limit = 50) {
    return withOrg(orgId, (tx) =>
      tx.websiteIntelReport.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          primaryUrl: true,
          category: true,
          city: true,
          country: true,
          status: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true
        }
      })
    );
  },

  async get(orgId: string, id: string) {
    return withOrg(orgId, async (tx) => {
      const report = await tx.websiteIntelReport.findFirst({ where: { id } });
      if (!report) return null;
      const competitors = await tx.websiteIntelCompetitor.findMany({
        where: { reportId: id },
        orderBy: { createdAt: 'asc' }
      });
      return { report, competitors };
    });
  },

  async create(orgId: string, userId: string, input: CreateIntelReportInput) {
    const reportId = await withOrg(orgId, async (tx) => {
      const report = await tx.websiteIntelReport.create({
        data: {
          organizationId: orgId,
          createdById: userId,
          leadId: input.leadId ?? null,
          title: input.title,
          primaryUrl: input.primaryUrl,
          category: input.category ?? null,
          city: input.city ?? null,
          country: input.country ?? null,
          status: 'queued'
        }
      });
      // Insert manual competitors
      const seen = new Set<string>();
      for (const url of input.competitorUrls) {
        const key = hostKey(url);
        if (!key || seen.has(key) || key === hostKey(input.primaryUrl)) continue;
        seen.add(key);
        await tx.websiteIntelCompetitor.create({
          data: {
            organizationId: orgId,
            reportId: report.id,
            source: 'manual',
            url,
            status: 'queued'
          }
        });
      }
      return report.id;
    });

    // Dispatch worker job (outside the txn)
    try {
      await enqueue(QueueName.ENRICHMENT, JobName.INTEL_BUILD, {
        organizationId: orgId,
        reportId,
        autoDetectCompetitors: input.autoDetectCompetitors,
        maxCompetitors: input.maxCompetitors
      });
    } catch (err) {
      console.warn('[intelService.create] enqueue failed; report sits queued', err);
    }

    return reportId;
  },

  /** Re-run an existing report. */
  async dispatch(orgId: string, reportId: string, opts: { autoDetectCompetitors: boolean; maxCompetitors: number }) {
    await withOrg(orgId, (tx) =>
      tx.websiteIntelReport.update({
        where: { id: reportId },
        data: { status: 'queued', errorMessage: null }
      })
    );
    await enqueue(QueueName.ENRICHMENT, JobName.INTEL_BUILD, {
      organizationId: orgId,
      reportId,
      autoDetectCompetitors: opts.autoDetectCompetitors,
      maxCompetitors: opts.maxCompetitors
    });
  },

  async delete(orgId: string, reportId: string) {
    await withOrg(orgId, (tx) =>
      tx.websiteIntelReport.deleteMany({ where: { id: reportId } })
    );
  }
};

function hostKey(url: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export type { Prisma };
