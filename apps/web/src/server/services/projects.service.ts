import { withOrg } from '@crawlix/db';
import { Prisma } from '@crawlix/db';
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

  /**
   * Apply a partial update and write a `ProjectEdit` audit row capturing the
   * before/after of every changed field.
   */
  async update(orgId: string, input: UpdateProjectInput, editorUserId?: string) {
    return withOrg(orgId, async (tx) => {
      const existing = await tx.project.findFirst({ where: { id: input.id } });
      if (!existing) throw new Error('Project not found');

      const data: Prisma.ProjectUpdateInput = {};
      const diff: Record<string, { from: unknown; to: unknown }> = {};

      const nextName = input.name;
      if (nextName !== existing.name) {
        data.name = nextName;
        diff.name = { from: existing.name, to: nextName };
      }
      const nextDesc = input.description ?? null;
      if (nextDesc !== existing.description) {
        data.description = nextDesc;
        diff.description = { from: existing.description, to: nextDesc };
      }

      if (Object.keys(data).length === 0) return existing;

      const updated = await tx.project.update({ where: { id: input.id }, data });

      if (Object.keys(diff).length > 0) {
        await tx.projectEdit.create({
          data: {
            organizationId: orgId,
            projectId: input.id,
            editedById: editorUserId ?? null,
            diff: diff as unknown as Prisma.InputJsonValue
          }
        });
      }

      return updated;
    });
  },

  /**
   * Clone a project (without its searches/leads). The new project starts
   * empty so the user can decide what to copy in.
   */
  async duplicate(
    orgId: string,
    userId: string,
    sourceId: string,
    overrides: { name?: string } = {}
  ) {
    return withOrg(orgId, async (tx) => {
      const src = await tx.project.findFirst({ where: { id: sourceId } });
      if (!src) throw new Error('Source project not found');
      const newName = overrides.name?.trim() || `${src.name} (copy)`;
      return tx.project.create({
        data: {
          organizationId: orgId,
          createdById: userId,
          name: newName,
          description: src.description
        }
      });
    });
  },

  async listEdits(orgId: string, projectId: string, limit = 20) {
    return withOrg(orgId, async (tx) => {
      const edits = await tx.projectEdit.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: limit
      });
      const userIds = Array.from(
        new Set(edits.map((e) => e.editedById).filter((v): v is string => !!v))
      );
      const users = userIds.length
        ? await tx.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true, email: true }
          })
        : [];
      const byId = new Map(users.map((u) => [u.id, u]));
      return edits.map((e) => {
        const u = e.editedById ? byId.get(e.editedById) : undefined;
        return {
          ...e,
          editedByName: u?.fullName?.trim() || u?.email || null
        };
      });
    });
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
