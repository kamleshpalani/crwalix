import { withOrg } from '@crawlix/db';

const SOCIAL_HOSTS = [
  'facebook.com', 'm.facebook.com', 'fb.com',
  'instagram.com', 'linktr.ee', 'linkin.bio',
  'business.site', 'sites.google.com',
  'wa.me', 'api.whatsapp.com', 't.me',
  'twitter.com', 'x.com', 'tiktok.com', 'youtube.com'
];

export const dashboardService = {
  async stats(orgId: string) {
    return withOrg(orgId, async (tx) => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [
        projects,
        searches,
        leadsTotal,
        leadsHigh,
        leadsNoWebsite,
        leadsSocialOnly,
        leadsBroken,
        leadsOutdated,
        leadsNoForm,
        leadsNew,
        recentRuns,
        topLeads,
        newlyDiscovered
      ] = await Promise.all([
        tx.project.count(),
        tx.search.count(),
        tx.lead.count(),
        tx.lead.count({ where: { priorityTier: 'HIGH' } }),
        tx.lead.count({
          where: { websiteStatus: { in: ['LIKELY_NONE', 'HIGH_CONFIDENCE_NONE'] } }
        }),
        tx.lead.count({
          where: {
            OR: SOCIAL_HOSTS.map((h) => ({
              website: { contains: h, mode: 'insensitive' as const }
            }))
          }
        }),
        tx.lead.count({ where: { websiteHealth: 'UNREACHABLE' } }),
        tx.lead.count({ where: { websiteHealth: 'OUTDATED' } }),
        tx.lead.count({
          where: {
            websiteStatus: 'EXISTS',
            AND: [
              { websiteAudit: { path: ['signals', 'hasContactForm'], equals: false } },
              { websiteAudit: { path: ['signals', 'hasBookingForm'], equals: false } }
            ]
          }
        }),
        tx.lead.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
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
        }),
        tx.lead.findMany({
          where: { createdAt: { gte: sevenDaysAgo } },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            name: true,
            city: true,
            country: true,
            provider: true,
            createdAt: true,
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
        leadsSocialOnly,
        leadsBroken,
        leadsOutdated,
        leadsNoForm,
        leadsNew,
        recentRuns,
        topLeads,
        newlyDiscovered
      };
    });
  }
};
