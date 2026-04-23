import { withOrg } from '@crawlix/db';
import { z } from 'zod';

export const CreateProjectSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional()
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

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

  async get(orgId: string, id: string) {
    return withOrg(orgId, (tx) =>
      tx.project.findFirst({
        where: { id },
        include: { searches: { orderBy: { createdAt: 'desc' }, take: 10 } }
      })
    );
  }
};
