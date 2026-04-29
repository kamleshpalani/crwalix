import { z } from "zod";
import { ActivityKind, DealStatus, ProposalStatus } from "./enums";

// -------- Pipeline -----------------------------------------------------------

/** Stage row returned in pipeline detail responses. */
export const PipelineStageDtoSchema = z.object({
  id: z.string(),
  pipelineId: z.string(),
  name: z.string(),
  position: z.number().int().nonnegative(),
  probability: z.number().int().min(0).max(100),
  isWon: z.boolean(),
  isLost: z.boolean(),
});
export type PipelineStageDto = z.infer<typeof PipelineStageDtoSchema>;

/** Pipeline + its ordered stages. */
export const PipelineDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  stages: z.array(PipelineStageDtoSchema),
});
export type PipelineDto = z.infer<typeof PipelineDtoSchema>;

// -------- Deal ---------------------------------------------------------------

/** Filters / pagination for the deal list endpoint. */
export const DealFilterSchema = z.object({
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  status: z.nativeEnum(DealStatus).optional(),
  ownerUserId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  sort: z
    .enum([
      "-createdAt",
      "createdAt",
      "-amountCents",
      "amountCents",
      "-updatedAt",
      "updatedAt",
    ])
    .default("-createdAt"),
});
export type DealFilter = z.infer<typeof DealFilterSchema>;

/** Create-deal request. `stageId` defaults to the pipeline's first stage. */
export const CreateDealSchema = z.object({
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  amountCents: z.number().int().nonnegative().default(0),
  currency: z.string().length(3).default("USD"),
  ownerUserId: z.string().uuid().optional(),
  expectedCloseAt: z.coerce.date().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateDealInput = z.infer<typeof CreateDealSchema>;

/**
 * Patch a deal. Used for kanban drag-drop (`stageId` only) as well as detail
 * editing. All fields optional; supplying `status: WON|LOST` stamps `closedAt`.
 */
export const UpdateDealSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    stageId: z.string().uuid().optional(),
    amountCents: z.number().int().nonnegative().optional(),
    currency: z.string().length(3).optional(),
    status: z.nativeEnum(DealStatus).optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    expectedCloseAt: z.coerce.date().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });
export type UpdateDealInput = z.infer<typeof UpdateDealSchema>;

/** Public deal shape returned by API list endpoints. */
export const DealListItemSchema = z.object({
  id: z.string(),
  pipelineId: z.string(),
  stageId: z.string(),
  leadId: z.string().nullable(),
  projectId: z.string().nullable(),
  title: z.string(),
  amountCents: z.number().int(),
  currency: z.string(),
  status: z.nativeEnum(DealStatus),
  ownerUserId: z.string().nullable(),
  expectedCloseAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DealListItem = z.infer<typeof DealListItemSchema>;

// -------- Activity -----------------------------------------------------------

export const CreateActivitySchema = z.object({
  kind: z.nativeEnum(ActivityKind).default(ActivityKind.NOTE),
  summary: z.string().min(1).max(500),
  metadata: z.record(z.unknown()).optional(),
  occurredAt: z.coerce.date().optional(),
});
export type CreateActivityInput = z.infer<typeof CreateActivitySchema>;

export const ActivityListFilterSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});
export type ActivityListFilter = z.infer<typeof ActivityListFilterSchema>;

// -------- Proposal -----------------------------------------------------------

/**
 * Patch a proposal. Status transitions follow the lifecycle:
 *   DRAFT → READY → SENT → (VIEWED) → ACCEPTED | DECLINED
 * Editing `bodyHtml` is only allowed while the proposal is DRAFT or READY.
 */
export const UpdateProposalSchema = z
  .object({
    status: z.nativeEnum(ProposalStatus).optional(),
    bodyHtml: z.string().min(1).max(200_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });
export type UpdateProposalInput = z.infer<typeof UpdateProposalSchema>;

/** Shape returned by the public share endpoint (no AI cost / provenance). */
export const PublicProposalDtoSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  status: z.nativeEnum(ProposalStatus),
  bodyHtml: z.string(),
  dealTitle: z.string(),
  organizationName: z.string(),
  sentAt: z.string().nullable(),
});
export type PublicProposalDto = z.infer<typeof PublicProposalDtoSchema>;
