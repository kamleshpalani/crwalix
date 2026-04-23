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
        include: { runs: { orderBy: { createdAt: 'desc' }, take: 20 } }
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
        scoreOnInsert: input.scoreOnInsert
      }
    });

    return { search, run, jobId };
  }
};
