import { withOrg } from '@crawlix/db';
import {
  CreateExportSchema,
  ExportFormat,
  ExportStatus,
  JobName,
  QueueName,
  type CreateExportInput,
  type LeadFilter
} from '@crawlix/shared';
import { enqueue } from '@/lib/queue';

export { CreateExportSchema };

export const exportsService = {
  async list(orgId: string) {
    return withOrg(orgId, (tx) =>
      tx.exportJob.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 50
      })
    );
  },

  async get(orgId: string, id: string) {
    return withOrg(orgId, (tx) =>
      tx.exportJob.findFirst({ where: { id, organizationId: orgId } })
    );
  },

  async createAndDispatch(orgId: string, userId: string, input: CreateExportInput) {
    const exportJob = await withOrg(orgId, (tx) =>
      tx.exportJob.create({
        data: {
          organizationId: orgId,
          createdById: userId,
          format: input.format,
          status: ExportStatus.QUEUED,
          listId: input.source.kind === 'list' ? input.source.listId : null,
          projectId: input.source.kind === 'project' ? input.source.projectId : null,
          searchId: input.source.kind === 'search' ? input.source.searchId : null,
          filterJson:
            input.source.kind === 'filter'
              ? (input.source.filter as unknown as object)
              : undefined
        }
      })
    );

    let jobId: string | null = null;
    try {
      jobId = await enqueue(QueueName.EXPORT, JobName.EXPORT_BUILD, {
        organizationId: orgId,
        exportJobId: exportJob.id,
        format: input.format,
        source: input.source,
        options: input.options
      });
    } catch (err) {
      // If Redis isn't available locally we still create the row so users can
      // download via the synchronous CSV API. The worker will just never pick
      // it up — that's a deployment concern, not a UX-blocker.
      // eslint-disable-next-line no-console
      console.warn('[exportsService] enqueue failed; export row created without worker dispatch', err);
    }

    return { exportJob, jobId };
  }
};

export interface ExportRowSource {
  kind: 'list' | 'project' | 'search' | 'filter';
  listId?: string;
  projectId?: string;
  searchId?: string;
  filter?: LeadFilter;
}

export const ExportFormats = ExportFormat;
