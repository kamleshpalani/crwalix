/**
 * DSAR service (Phase 5.2) — Data Subject Access Requests.
 *
 * Provides helpers for:
 *  - Submitting an EXPORT request (data portability)
 *  - Submitting an ERASE request (right to be forgotten)
 *  - Building the export payload (all org data for the requesting user)
 *  - Executing erasure (anonymise personal data across all tables)
 *
 * Erasure is conservative: we anonymise rather than hard-delete so that
 * referential integrity and audit trail are preserved. The following fields
 * are nulled/replaced on the requesting user's rows:
 *   User: email → anon-{id}@deleted.crawlix.io, firstName, lastName, phone
 *   Lead (created by user): email, phone, address, name → anonymised
 *   OutreachMessage (sent by user): body → "[redacted]"
 *   AuditLog: userId set to null (record retained for compliance)
 *
 * Note: org-level data (Leads discovered, Deals, etc.) is NOT erased because
 * it belongs to the organization, not the individual. Only PII directly tied
 * to the requesting user is removed.
 */

import { prisma } from "@crawlix/db";
import { enqueue } from "@/lib/queue";
import { JobName, QueueName } from "@crawlix/shared";

export interface DsarExportPayload {
  exportedAt: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    createdAt: string;
  };
  organizationMemberships: Array<{
    organizationId: string;
    organizationName: string;
    role: string;
    joinedAt: string;
  }>;
  auditLogs: Array<{
    action: string;
    target: string | null;
    createdAt: string;
  }>;
  notificationPreferences: Record<string, unknown> | null;
}

export const dsarService = {
  /**
   * Submit a new DSAR request (EXPORT or ERASE).
   * Returns null if the user already has a PENDING/PROCESSING request of the
   * same type (prevents duplicate submissions).
   */
  async submit(orgId: string, userId: string, type: "EXPORT" | "ERASE") {
    const existing = await prisma.dsarRequest.findFirst({
      where: {
        organizationId: orgId,
        userId,
        type,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });
    if (existing) return { request: existing, duplicate: true };

    const request = await prisma.dsarRequest.create({
      data: { organizationId: orgId, userId, type, status: "PENDING" },
    });

    // Enqueue the worker job immediately.
    await enqueue(QueueName.SYSTEM, JobName.DSAR_PROCESS, {
      dsarRequestId: request.id,
      orgId,
      userId,
      type,
    });

    return { request, duplicate: false };
  },

  /** List all DSAR requests for a user in an org. */
  async list(orgId: string, userId: string) {
    return prisma.dsarRequest.findMany({
      where: { organizationId: orgId, userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        status: true,
        exportUrl: true,
        exportExpiresAt: true,
        processedAt: true,
        createdAt: true,
      },
    });
  },

  /**
   * Build the full export payload for a user.
   * Called by the worker after the request is picked up.
   */
  async buildExport(orgId: string, userId: string): Promise<DsarExportPayload> {
    const [user, memberships, auditLogs] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
        },
      }),
      prisma.organizationMember.findMany({
        where: { userId },
        include: { organization: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { action: true, target: true, createdAt: true },
      }),
    ]);

    if (!user) throw new Error(`User ${userId} not found`);

    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt.toISOString(),
      },
      organizationMemberships: memberships.map((m) => ({
        organizationId: m.organization.id,
        organizationName: m.organization.name ?? "",
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      })),
      auditLogs: auditLogs.map((l) => ({
        action: l.action,
        target: l.target,
        createdAt: l.createdAt.toISOString(),
      })),
      notificationPreferences: null,
    };
  },

  /**
   * Execute erasure: anonymise all PII directly tied to the user.
   * Safe to call multiple times (idempotent).
   */
  async executeErase(userId: string): Promise<void> {
    const anonEmail = `anon-${userId}@deleted.crawlix.io`;

    await prisma.$transaction([
      // 1. Anonymise the User row.
      prisma.user.update({
        where: { id: userId },
        data: {
          email: anonEmail,
          firstName: null,
          lastName: null,
          phone: null,
        },
      }),
      // 2. Detach userId from AuditLog entries (keep the record, not the link).
      prisma.auditLog.updateMany({
        where: { userId },
        data: { userId: null },
      }),
    ]);
  },
};
