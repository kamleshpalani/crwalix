// apps/worker/src/lib/usage.ts
//
// Phase 2.7 — Usage metering (worker-side).
// Mirrors apps/web/src/server/lib/usage.ts — fire-and-forget UsageEvent rows.

import { prisma } from "@crawlix/db";

export interface EmitUsageInput {
  organizationId: string;
  kind: string;
  quantity?: number;
  /** Cost in USD micro-cents (1 USD = 100_000_000 micro-cents). */
  costMicroCents?: number;
  refId?: string;
  meta?: Record<string, unknown>;
}

export async function emitUsage(input: EmitUsageInput): Promise<void> {
  try {
    await prisma.usageEvent.create({
      data: {
        organizationId: input.organizationId,
        kind: input.kind,
        quantity: input.quantity ?? 1,
        costMicroCents: input.costMicroCents ?? 0,
        refId: input.refId ?? null,
        meta: input.meta ?? null,
      },
    });
  } catch {
    // Never surface metering errors to callers.
  }
}
