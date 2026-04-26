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
    if (filter.city) where.city = filter.city;
    if (filter.state) where.state = filter.state;
    if (filter.country) where.country = filter.country;
    if (filter.minScore !== undefined) where.score = { gte: filter.minScore };
    if (filter.websiteStatus) {
      where.websiteStatus = Array.isArray(filter.websiteStatus)
        ? { in: filter.websiteStatus }
        : filter.websiteStatus;
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
    if (filter.tag) {
      where.tags = { has: filter.tag };
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
