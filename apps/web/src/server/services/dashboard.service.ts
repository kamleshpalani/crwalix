import { withOrg } from '@crawlix/db';

export const dashboardService = {
  async stats(orgId: string) {
    return withOrg(orgId, async (tx) => {
      const [
        projects,
        searches,
        leadsTotal,
        leadsHigh,
        leadsNoWebsite,
        recentRuns,
        topLeads
      ] = await Promise.all([
        tx.project.count(),
        tx.search.count(),
        tx.lead.count(),
        tx.lead.count({ where: { priorityTier: 'HIGH' } }),
        tx.lead.count({
          where: { websiteStatus: { in: ['LIKELY_NONE', 'HIGH_CONFIDENCE_NONE'] } }
        }),
        tx.searchRun.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: { search: { select: { id: true, name: true, projectId: true } } }
        }),
        tx.lead.findMany({
          where: { score: { not: null } },
          orderBy: { score: 'desc' },
          take: 5,
          select: {
            id: true,
            name: true,
            city: true,
            country: true,
            score: true,
            priorityTier: true,
            websiteStatus: true
          }
        })
      ]);
      return {
        projects,
        searches,
        leadsTotal,
        leadsHigh,
        leadsNoWebsite,
        recentRuns,
        topLeads
      };
    });
  }
};
