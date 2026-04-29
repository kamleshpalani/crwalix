// apps/web/src/server/services/audit.service.ts
//
// Module #20 — Audit log writer + viewer.
//
// Lightweight, fire-and-forget recording of high-signal events. Failures
// never throw to the caller — losing an audit row must not break a business
// op. Reads use RLS-scoped client.

import { prisma, withOrg } from "@crawlix/db";

export interface AuditRecordInput {
  orgId: string | null;
  userId?: string | null;
  action: string; // e.g. "invoice.send", "contract.sign", "settings.update"
  target?: string | null; // resource id or label
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditEntryDto {
  id: string;
  organizationId: string | null;
  userId: string | null;
  userEmail: string | null;
  action: string;
  target: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditListOptions {
  action?: string;
  target?: string;
  userId?: string;
  since?: string; // ISO date
  until?: string; // ISO date
  limit?: number; // default 100, max 500
}

async function record(input: AuditRecordInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: input.orgId,
        userId: input.userId ?? null,
        action: input.action.slice(0, 100),
        target: input.target?.slice(0, 200) ?? null,
        metadata: (input.metadata ?? undefined) as object | undefined,
        ip: input.ip?.slice(0, 64) ?? null,
        userAgent: input.userAgent?.slice(0, 500) ?? null,
      },
    });
  } catch (err) {
    // Never break the caller — log and swallow.
    console.warn("[audit] failed to record", input.action, err);
  }
}

async function list(
  orgId: string,
  opts: AuditListOptions = {},
): Promise<AuditEntryDto[]> {
  return withOrg(orgId, async (tx) => {
    const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
    const rows = await tx.auditLog.findMany({
      where: {
        organizationId: orgId,
        action: opts.action ? { equals: opts.action } : undefined,
        target: opts.target ? { equals: opts.target } : undefined,
        userId: opts.userId ? { equals: opts.userId } : undefined,
        createdAt: {
          gte: opts.since ? new Date(opts.since) : undefined,
          lte: opts.until ? new Date(opts.until) : undefined,
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { email: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      userId: r.userId,
      userEmail: r.user?.email ?? null,
      action: r.action,
      target: r.target,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      ip: r.ip,
      userAgent: r.userAgent,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

export const auditService = { record, list };
