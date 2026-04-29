import { withOrg } from "@crawlix/db";
import {
  ProjectStatus,
  ProjectTaskStatus,
  type CreateProjectTaskInput,
  type UpdateProjectTaskInput,
} from "@crawlix/shared";

/**
 * Project kickoff + tasks service.
 *
 * `kickoffFromDeal` is the bridge between CRM (Won deal) and delivery
 * (a project with a checklist). It is idempotent — re-running for the
 * same deal returns the existing project instead of creating a second one.
 */
export const projectKickoffService = {
  /**
   * Create (or fetch existing) project for a deal that just moved to a Won
   * stage. Wraps the SQL `seed_default_project_tasks` function so the task
   * list stays in sync with the migration definition.
   */
  async kickoffFromDeal(
    orgId: string,
    userId: string | null,
    deal: {
      readonly id: string;
      readonly leadId: string | null;
      readonly title: string;
      readonly projectId: string | null;
    },
  ) {
    return withOrg(orgId, async (tx) => {
      // Idempotency: if the deal already has a project, just return it.
      if (deal.projectId) {
        const existing = await tx.project.findFirst({
          where: { id: deal.projectId, organizationId: orgId },
        });
        if (existing) return { project: existing, created: false };
      }

      const project = await tx.project.create({
        data: {
          organizationId: orgId,
          createdById: userId,
          name: deal.title,
          dealId: deal.id,
          leadId: deal.leadId,
          status: ProjectStatus.PLANNING,
          kickoffAt: new Date(),
        },
      });

      // Mirror the deal back to the project for UI navigation.
      await tx.deal.update({
        where: { id: deal.id },
        data: { projectId: project.id },
      });

      // Seed kickoff checklist via the migration's SQL function so the
      // canonical task list lives in one place.
      await tx.$executeRaw`select public.seed_default_project_tasks(${project.id}, ${orgId})`;

      return { project, created: true };
    });
  },

  async listTasks(orgId: string, projectId: string) {
    return withOrg(orgId, (tx) =>
      tx.projectTask.findMany({
        where: { organizationId: orgId, projectId },
        orderBy: { position: "asc" },
      }),
    );
  },

  async createTask(
    orgId: string,
    projectId: string,
    input: CreateProjectTaskInput,
  ) {
    return withOrg(orgId, async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: projectId, organizationId: orgId },
        select: { id: true },
      });
      if (!project) return null;

      let position = input.position;
      if (position === undefined) {
        const last = await tx.projectTask.findFirst({
          where: { organizationId: orgId, projectId },
          orderBy: { position: "desc" },
          select: { position: true },
        });
        position = (last?.position ?? -1) + 1;
      }

      return tx.projectTask.create({
        data: {
          organizationId: orgId,
          projectId,
          title: input.title,
          description: input.description ?? null,
          position,
          dueAt: input.dueAt ?? null,
          assigneeUserId: input.assigneeUserId ?? null,
        },
      });
    });
  },

  async updateTask(
    orgId: string,
    taskId: string,
    input: UpdateProjectTaskInput,
  ) {
    return withOrg(orgId, async (tx) => {
      const existing = await tx.projectTask.findFirst({
        where: { id: taskId, organizationId: orgId },
      });
      if (!existing) return null;

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description;
      if (input.position !== undefined) data.position = input.position;
      if (input.dueAt !== undefined) data.dueAt = input.dueAt;
      if (input.assigneeUserId !== undefined)
        data.assigneeUserId = input.assigneeUserId;
      if (input.status !== undefined) {
        data.status = input.status;
        // Stamp completedAt iff transitioning to/from DONE.
        if (
          input.status === ProjectTaskStatus.DONE &&
          existing.status !== ProjectTaskStatus.DONE
        ) {
          data.completedAt = new Date();
        } else if (
          input.status !== ProjectTaskStatus.DONE &&
          existing.status === ProjectTaskStatus.DONE
        ) {
          data.completedAt = null;
        }
      }

      return tx.projectTask.update({
        where: { id: taskId },
        data,
      });
    });
  },

  async deleteTask(orgId: string, taskId: string) {
    return withOrg(orgId, async (tx) => {
      const existing = await tx.projectTask.findFirst({
        where: { id: taskId, organizationId: orgId },
        select: { id: true },
      });
      if (!existing) return false;
      await tx.projectTask.delete({ where: { id: taskId } });
      return true;
    });
  },
};
