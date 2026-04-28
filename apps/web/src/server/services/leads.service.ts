import { withOrg } from '@crawlix/db';
import {
  EnrichmentKind,
  EnrichmentStatus,
  JobName,
  QueueName,
  type LeadFilter,
  type LeadStatus
} from '@crawlix/shared';
import { enqueue } from '@/lib/queue';

export const leadsService = {
  async list(orgId: string, filter: LeadFilter) {
    const skip = (filter.page - 1) * filter.pageSize;

    const where: Record<string, unknown> = { organizationId: orgId };
    if (filter.city) where.city = { contains: filter.city, mode: 'insensitive' };
    if (filter.state) where.state = { contains: filter.state, mode: 'insensitive' };
    if (filter.country) where.country = { equals: filter.country, mode: 'insensitive' };
    if (filter.postalCode) where.postalCode = { contains: filter.postalCode, mode: 'insensitive' };
    if (filter.minScore !== undefined) where.score = { gte: filter.minScore };
    if (filter.websiteStatus) {
      where.websiteStatus = Array.isArray(filter.websiteStatus)
        ? { in: filter.websiteStatus }
        : filter.websiteStatus;
    }
    if (filter.websiteHealth) {
      where.websiteHealth = filter.websiteHealth;
    }
    if (filter.outreachSuitable !== undefined) {
      // websiteAudit is JSON; filter by audit.outreachFit.suitable.
      where.websiteAudit = {
        path: ['outreachFit', 'suitable'],
        equals: filter.outreachSuitable
      };
    }
    if (filter.socialOnly) {
      // Match websites whose host is a social network / link-in-bio. Kept in
      // sync with SOCIAL_ONLY_HOSTS in packages/scoring/src/rules/default.ts.
      const SOCIAL_HOSTS = [
        'facebook.com', 'm.facebook.com', 'fb.com',
        'instagram.com', 'linktr.ee', 'linkin.bio',
        'business.site', 'sites.google.com',
        'wa.me', 'api.whatsapp.com', 't.me',
        'twitter.com', 'x.com', 'tiktok.com', 'youtube.com'
      ];
      where.OR = [
        ...((where.OR as object[] | undefined) ?? []),
        ...SOCIAL_HOSTS.map((h) => ({ website: { contains: h, mode: 'insensitive' as const } }))
      ];
    }
    if (filter.missingForm) {
      // websiteAudit.signals.{hasContactForm,hasBookingForm} are booleans
      // populated by the audit. Filter accordingly. Only meaningful for
      // EXISTS leads — otherwise the signals are unset.
      const path = (key: 'hasContactForm' | 'hasBookingForm') => ({
        websiteAudit: { path: ['signals', key], equals: false } as const
      });
      const conds =
        filter.missingForm === 'contact' ? [path('hasContactForm')]
        : filter.missingForm === 'booking' ? [path('hasBookingForm')]
        : [path('hasContactForm'), path('hasBookingForm')]; // 'any' → missing both
      where.AND = [
        ...((where.AND as object[] | undefined) ?? []),
        { websiteStatus: 'EXISTS' },
        ...conds
      ];
    }
    if (filter.priorityTier) {
      where.priorityTier = Array.isArray(filter.priorityTier)
        ? { in: filter.priorityTier }
        : filter.priorityTier;
    }
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { phone: { contains: filter.search } }
      ];
    }
    if (filter.projectId) {
      where.sources = { some: { searchRun: { search: { projectId: filter.projectId } } } };
    }
    if (filter.searchId) {
      where.sources = { some: { searchRun: { searchId: filter.searchId } } };
    }
    if (filter.listId) {
      where.listMemberships = { some: { listId: filter.listId } };
    }
    if (filter.status) {
      where.status = Array.isArray(filter.status)
        ? { in: filter.status }
        : filter.status;
    }
    if (filter.businessScale) {
      where.businessScale = Array.isArray(filter.businessScale)
        ? { in: filter.businessScale }
        : filter.businessScale;
    }
    if (filter.tag) {
      where.tags = { has: filter.tag };
    }
    if (filter.discoveredWithin) {
      const ms: Record<string, number> = {
        '24h': 24 * 60 * 60 * 1000,
        '7d':  7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
        '90d': 90 * 24 * 60 * 60 * 1000
      };
      const window = ms[filter.discoveredWithin];
      if (window) {
        where.createdAt = { gte: new Date(Date.now() - window) };
      }
    }

    const orderBy = orderByFromSort(filter.sort);

    return withOrg(orgId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.lead.findMany({
          where,
          orderBy,
          skip,
          take: filter.pageSize,
          include: { scores: { take: 1, orderBy: { createdAt: 'desc' } } }
        }),
        tx.lead.count({ where })
      ]);
      return { items, total, page: filter.page, pageSize: filter.pageSize };
    });
  },

  async get(orgId: string, id: string) {
    return withOrg(orgId, (tx) =>
      tx.lead.findFirst({
        where: { id },
        include: {
          enrichments: { orderBy: { createdAt: 'desc' } },
          scores: { orderBy: { createdAt: 'desc' }, take: 5 },
          sources: {
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: { searchRun: { include: { search: true } } }
          }
        }
      })
    );
  },

  async setStatus(orgId: string, id: string, status: LeadStatus) {
    return withOrg(orgId, (tx) =>
      tx.lead.update({
        where: { id },
        data: { status }
      })
    );
  },

  async setStatusBulk(orgId: string, ids: string[], status: LeadStatus) {
    if (ids.length === 0) return 0;
    return withOrg(orgId, async (tx) => {
      const res = await tx.lead.updateMany({
        where: { id: { in: ids } },
        data: { status }
      });
      return res.count;
    });
  },

  async setNotes(orgId: string, id: string, notes: string) {
    return withOrg(orgId, (tx) =>
      tx.lead.update({
        where: { id },
        data: { notes: notes.length ? notes : null }
      })
    );
  },

  /**
   * Update user-editable contact fields on a lead. Only fields explicitly
   * present in the patch are touched; empty strings clear nullable fields.
   */
  async patchContact(
    orgId: string,
    id: string,
    patch: {
      ownerName?: string | null;
      phone?: string | null;
      email?: string | null;
      website?: string | null;
      facebookUrl?: string | null;
      instagramUrl?: string | null;
      googleProfileUrl?: string | null;
      address?: string | null;
      postalCode?: string | null;
    }
  ) {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      data[k] = v;
    }
    if (Object.keys(data).length === 0) return null;
    return withOrg(orgId, (tx) =>
      tx.lead.update({ where: { id }, data })
    );
  },

  async addTag(orgId: string, id: string, tag: string) {
    const clean = tag.trim().toLowerCase();
    if (!clean) return null;
    return withOrg(orgId, async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id }, select: { tags: true } });
      if (!lead) return null;
      if (lead.tags.includes(clean)) return lead;
      return tx.lead.update({
        where: { id },
        data: { tags: { set: [...lead.tags, clean] } },
        select: { tags: true }
      });
    });
  },

  async removeTag(orgId: string, id: string, tag: string) {
    return withOrg(orgId, async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id }, select: { tags: true } });
      if (!lead) return null;
      return tx.lead.update({
        where: { id },
        data: { tags: { set: lead.tags.filter((t) => t !== tag) } },
        select: { tags: true }
      });
    });
  },

  /** Manually queue a website-validation enrichment for a lead. */
  async auditWebsite(
    orgId: string,
    leadId: string
  ): Promise<{ ok: true; enrichmentId: string } | { ok: false; reason: string }> {
    const lead = await withOrg(orgId, (tx) =>
      tx.lead.findFirst({ where: { id: leadId }, select: { id: true, website: true } })
    );
    if (!lead) return { ok: false, reason: 'Lead not found' };
    if (!lead.website) return { ok: false, reason: 'Lead has no website to audit' };

    const enrichment = await withOrg(orgId, (tx) =>
      tx.enrichment.create({
        data: {
          organizationId: orgId,
          leadId,
          kind: EnrichmentKind.WEBSITE_VALIDATION,
          provider: 'crawlix-auditor',
          status: EnrichmentStatus.QUEUED
        }
      })
    );

    await enqueue(QueueName.ENRICHMENT, JobName.ENRICH_WEBSITE, {
      organizationId: orgId,
      enrichmentId: enrichment.id,
      leadId,
      kind: EnrichmentKind.WEBSITE_VALIDATION,
      provider: 'crawlix-auditor'
    });
    return { ok: true, enrichmentId: enrichment.id };
  }
};

function orderByFromSort(sort: LeadFilter['sort']) {
  switch (sort) {
    case 'score': return { score: 'asc' as const };
    case '-score': return { score: 'desc' as const };
    case 'updatedAt': return { updatedAt: 'asc' as const };
    case '-updatedAt': return { updatedAt: 'desc' as const };
    case 'name': return { name: 'asc' as const };
    case '-name': return { name: 'desc' as const };
  }
}
