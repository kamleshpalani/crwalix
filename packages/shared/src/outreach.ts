// packages/shared/src/outreach.ts
//
// DTOs for sequence templates + run starts. Keeps the API surface small
// while the UI is still being built — additional list/get DTOs can be
// added as they're needed.

import { z } from "zod";

export const SequenceStatus = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type SequenceStatus =
  (typeof SequenceStatus)[keyof typeof SequenceStatus];

export const SequenceRunStatus = {
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  REPLIED: "REPLIED",
  BOUNCED: "BOUNCED",
  FAILED: "FAILED",
  STOPPED: "STOPPED",
} as const;
export type SequenceRunStatus =
  (typeof SequenceRunStatus)[keyof typeof SequenceRunStatus];

export const SequenceStepInput = z.object({
  position: z.number().int().min(0),
  delayHours: z
    .number()
    .int()
    .min(0)
    .max(24 * 90),
  subjectTemplate: z.string().min(1).max(255),
  bodyTemplate: z.string().min(1).max(50_000),
  bodyIsHtml: z.boolean().optional(),
});
export type SequenceStepInput = z.infer<typeof SequenceStepInput>;

export const CreateSequenceInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  status: z
    .enum([
      SequenceStatus.DRAFT,
      SequenceStatus.ACTIVE,
      SequenceStatus.ARCHIVED,
    ])
    .optional(),
  fromEmail: z.string().email().optional(),
  replyToEmail: z.string().email().optional(),
  quietStartHour: z.number().int().min(0).max(23).optional(),
  quietEndHour: z.number().int().min(0).max(23).optional(),
  timezone: z.string().min(1).max(64).optional(),
  steps: z.array(SequenceStepInput).min(1).max(20),
});
export type CreateSequenceInput = z.infer<typeof CreateSequenceInput>;

export const StartSequenceRunInput = z.object({
  sequenceId: z.string().uuid(),
  toEmail: z.string().email(),
  leadId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  /** Variables exposed to step templates (e.g. { lead: { firstName: "..." } }). */
  vars: z.record(z.unknown()).optional(),
});
export type StartSequenceRunInput = z.infer<typeof StartSequenceRunInput>;
