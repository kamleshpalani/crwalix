import { withOrg } from '@crawlix/db';
import { z } from 'zod';

export const CreateProjectSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional()
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = CreateProjectSchema.extend({
  id: z.string().min(1)
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

export const projectsService = {
  async list(orgId: string) {
    return withOrg(orgId, (tx) =>
      tx.project.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
    );
  },

  async create(orgId: string, userId: string, input: CreateProjectInput) {
    return withOrg(orgId, (tx) =>
      tx.project.create({
        data: {
          organizationId: orgId,
          createdById: userId,
          name: input.name,
          description: input.description
        }
      })
    );
  },

  async update(orgId: string, input: UpdateProjectInput) {
    return withOrg(orgId, (tx) =>
      tx.project.update({
        where: { id: input.id },
        data: { name: input.name, description: input.description ?? null }
      })
    );
  },

  async remove(orgId: string, id: string) {
    return withOrg(orgId, async (tx) => {
      // Delete leads that exist only because of searches in this project.
      const leads = await tx.lead.findMany({
        where: { sources: { some: { searchRun: { search: { projectId: id } } } } },
        select: {
          id: true,
          sources: { select: { searchRun: { select: { search: { select: { projectId: true } } } } } }
        }
      });
      const orphanIds = leads
        .filter((l) => l.sources.every((s) => s.searchRun.search.projectId === id))
        .map((l) => l.id);
      if (orphanIds.length > 0) {
        await tx.lead.deleteMany({ where: { id: { in: orphanIds } } });
      }
      return tx.project.delete({ where: { id } });
    });
  },

  async get(orgId: string, id: string) {
    return withOrg(orgId, (tx) =>
      tx.project.findFirst({
        where: { id },
        include: { searches: { orderBy: { createdAt: 'desc' }, take: 10 } }
      })
    );
  }
};
