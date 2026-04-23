import { withOrg } from '@crawlix/db';
import type { LeadFilter } from '@crawlix/shared';

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

    const orderBy = orderByFromSort(filter.sort);

    return withOrg(orgId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.lead.findMany({ where, orderBy, skip, take: filter.pageSize }),
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
          sources: { take: 5, orderBy: { createdAt: 'desc' } }
        }
      })
    );
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
