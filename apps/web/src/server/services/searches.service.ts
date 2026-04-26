import { withOrg } from '@crawlix/db';
import { enqueue } from '@/lib/queue';
import { JobName, QueueName, type CreateSearchInput } from '@crawlix/shared';

export const searchesService = {
  async list(orgId: string, projectId?: string) {
    return withOrg(orgId, (tx) =>
      tx.search.findMany({
        where: projectId ? { projectId } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { runs: { orderBy: { createdAt: 'desc' }, take: 1 } }
      })
    );
  },

  async get(orgId: string, id: string) {
    return withOrg(orgId, (tx) =>
      tx.search.findFirst({
        where: { id },
        include: {
          project: true,
          runs: { orderBy: { createdAt: 'desc' }, take: 20 }
        }
      })
    );
  },

  async createAndDispatch(orgId: string, userId: string, input: CreateSearchInput) {
    const { search, run } = await withOrg(orgId, async (tx) => {
      const search = await tx.search.create({
        data: {
          organizationId: orgId,
          projectId: input.projectId,
          name: input.name,
          niche: input.niche,
          keyword: input.keyword,
          country: input.country,
          state: input.state,
          city: input.city,
          postalCode: input.postalCode,
          radiusMeters: input.radiusMeters,
          resultLimit: input.resultLimit,
          provider: input.provider,
          leadFocus: input.leadFocus,
          createdById: userId
        }
      });
      const run = await tx.searchRun.create({
        data: {
          organizationId: orgId,
          searchId: search.id,
          provider: input.provider,
          status: 'QUEUED'
        }
      });
      return { search, run };
    });

    const jobId = await enqueue(QueueName.SEARCH, JobName.SEARCH_INGEST, {
      organizationId: orgId,
      searchRunId: run.id,
      provider: input.provider,
      query: {
        keyword: input.keyword,
        niche: input.niche,
        city: input.city,
        state: input.state,
        country: input.country,
        postalCode: input.postalCode,
        lat: input.lat,
        lng: input.lng,
        radiusMeters: input.radiusMeters,
        limit: input.resultLimit
      },
      options: {
        enrichOnInsert: input.enrichOnInsert,
        scoreOnInsert: input.scoreOnInsert,
        leadFocus: input.leadFocus
      }
    });

    return { search, run, jobId };
  },

  async rerun(orgId: string, searchId: string) {
    const search = await withOrg(orgId, (tx) =>
      tx.search.findFirst({ where: { id: searchId } })
    );
    if (!search) throw new Error('Search not found');

    const run = await withOrg(orgId, (tx) =>
      tx.searchRun.create({
        data: {
          organizationId: orgId,
          searchId: search.id,
          provider: search.provider,
          status: 'QUEUED'
        }
      })
    );

    const jobId = await enqueue(QueueName.SEARCH, JobName.SEARCH_INGEST, {
      organizationId: orgId,
      searchRunId: run.id,
      provider: search.provider,
      query: {
        keyword: search.keyword ?? undefined,
        niche: search.niche ?? undefined,
        city: search.city ?? undefined,
        state: search.state ?? undefined,
        country: search.country ?? undefined,
        postalCode: search.postalCode ?? undefined,
        radiusMeters: search.radiusMeters ?? undefined,
        limit: search.resultLimit
      },
      options: {
        enrichOnInsert: false,
        scoreOnInsert: true,
        leadFocus: (search.leadFocus as 'ALL' | 'NO_WEBSITE' | 'HIGH_OR_MED') ?? 'ALL'
      }
    });

    return { run, jobId };
  },

  async rescoreLeads(orgId: string, searchId: string): Promise<number> {
    const leads = await withOrg(orgId, (tx) =>
      tx.lead.findMany({
        where: { sources: { some: { searchRun: { searchId } } } },
        select: { id: true }
      })
    );
    if (leads.length === 0) return 0;
    for (const l of leads) {
      await enqueue(QueueName.SCORING, JobName.SCORE_LEAD, {
        organizationId: orgId,
        leadId: l.id,
        rulesetVersion: 'v1.0.0'
      });
    }
    return leads.length;
  },

  async remove(orgId: string, searchId: string) {
    return withOrg(orgId, async (tx) => {
      // Find leads sourced from this search.
      const leads = await tx.lead.findMany({
        where: { sources: { some: { searchRun: { searchId } } } },
        select: { id: true, sources: { select: { searchRun: { select: { searchId: true } } } } }
      });
      // Leads whose ONLY sources are from this search → delete entirely so
      // the user doesn't see stale rows from a deleted search.
      const orphanIds = leads
        .filter((l) => l.sources.every((s) => s.searchRun.searchId === searchId))
        .map((l) => l.id);
      if (orphanIds.length > 0) {
        await tx.lead.deleteMany({ where: { id: { in: orphanIds } } });
      }
      return tx.search.delete({ where: { id: searchId } });
    });
  },

  async cancelRun(orgId: string, runId: string) {
    return withOrg(orgId, (tx) =>
      tx.searchRun.updateMany({
        where: { id: runId, status: { in: ['QUEUED', 'RUNNING'] } },
        data: { status: 'CANCELED', finishedAt: new Date(), error: 'Canceled by user' }
      })
    );
  }
};
