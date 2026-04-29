import { z } from "zod";
import { ProjectStatus, ProjectTaskStatus } from "./enums";

export const ProjectKickoffMetaSchema = z.object({
  dealId: z.string(),
  triggeredByUserId: z.string().nullable(),
});

export const ProjectTaskDtoSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.nativeEnum(ProjectTaskStatus),
  position: z.number().int(),
  dueAt: z.string().nullable(),
  assigneeUserId: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type ProjectTaskDto = z.infer<typeof ProjectTaskDtoSchema>;

export const CreateProjectTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  position: z.number().int().nonnegative().optional(),
  dueAt: z.coerce.date().optional(),
  assigneeUserId: z.string().uuid().optional(),
});
export type CreateProjectTaskInput = z.infer<typeof CreateProjectTaskSchema>;

export const UpdateProjectTaskSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: z.nativeEnum(ProjectTaskStatus).optional(),
    position: z.number().int().nonnegative().optional(),
    dueAt: z.coerce.date().nullable().optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });
export type UpdateProjectTaskInput = z.infer<typeof UpdateProjectTaskSchema>;

export const UpdateProjectStatusSchema = z.object({
  status: z.nativeEnum(ProjectStatus),
});
export type UpdateProjectStatusInput = z.infer<
  typeof UpdateProjectStatusSchema
>;
