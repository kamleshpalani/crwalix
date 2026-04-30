// apps/web/src/server/lib/usage.ts
//
// Phase 2.7 — Usage metering.
// Fire-and-forget helper that writes a UsageEvent row. Errors are swallowed
// so that metering never interrupts the primary path.

import { prisma, Prisma } from "@crawlix/db";

export interface EmitUsageInput {
  organizationId: string;
  kind: string;
  quantity?: number;
  /** Cost in USD micro-cents (1 USD = 100_000_000 micro-cents). */
  costMicroCents?: number;
  /** Optional FK to the triggering entity (leadId, enrichmentId, etc.). */
  refId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Append a single UsageEvent row. Never throws — metering must be
 * transparent to callers.
 */
export async function emitUsage(input: EmitUsageInput): Promise<void> {
  try {
    await prisma.usageEvent.create({
      data: {
        organizationId: input.organizationId,
        kind: input.kind,
        quantity: input.quantity ?? 1,
        costMicroCents: input.costMicroCents ?? 0,
        refId: input.refId ?? null,
        meta:
          input.meta === undefined
            ? Prisma.DbNull
            : (input.meta as Prisma.InputJsonValue),
      },
    });
  } catch {
    // Never surface metering errors to callers.
  }
}
