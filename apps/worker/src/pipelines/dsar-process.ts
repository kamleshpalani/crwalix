import { prisma } from "@crawlix/db";
import type { DsarProcessJob } from "@crawlix/shared";
import { logger } from "../lib/logger";

/**
 * system.dsarProcess
 *
 * Handles both EXPORT and ERASE Data Subject Access Requests.
 *
 * EXPORT: serialises all personal data for the user into JSON, stores it as
 *   a base64-encoded data URI (for self-hosted simplicity; swap for S3 / GCS
 *   signed URL in production).  ExpiresAt is set to 7 days from now.
 *
 * ERASE: anonymises the user's PII across all relevant tables (email, name,
 *   phone, audit-log links).  See dsar.service.ts for the exact field list.
 *
 * On success the DsarRequest row is stamped COMPLETED with processedAt.
 * On failure it is stamped FAILED with errorMessage.
 */
export async function runDsarProcess(data: DsarProcessJob): Promise<void> {
  const { dsarRequestId, orgId, userId, type } = data;

  // Guard: request must exist and be in PENDING/PROCESSING state.
  const req = await prisma.dsarRequest.findUnique({
    where: { id: dsarRequestId },
  });
  if (!req) {
    logger.warn({ dsarRequestId }, "dsarProcess: request not found");
    return;
  }
  if (req.status === "COMPLETED" || req.status === "FAILED") {
    logger.info(
      { dsarRequestId, status: req.status },
      "dsarProcess: already settled, skipping",
    );
    return;
  }

  // Mark as PROCESSING.
  await prisma.dsarRequest.update({
    where: { id: dsarRequestId },
    data: { status: "PROCESSING" },
  });

  try {
    if (type === "EXPORT") {
      await handleExport(dsarRequestId, orgId, userId);
    } else {
      await handleErase(dsarRequestId, userId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ dsarRequestId, type, err: message }, "dsarProcess: failed");
    await prisma.dsarRequest.update({
      where: { id: dsarRequestId },
      data: { status: "FAILED", errorMessage: message },
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

async function handleExport(
  dsarRequestId: string,
  orgId: string,
  userId: string,
): Promise<void> {
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

  const payload = {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
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
      target: l.target ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
  };

  // Encode as a data URL (base64 JSON) — swap for a pre-signed storage URL
  // in production.  Max practical size is ~5 MB which is well within limits
  // for typical user datasets.
  const json = JSON.stringify(payload, null, 2);
  const dataUrl =
    "data:application/json;base64," + Buffer.from(json).toString("base64");

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.dsarRequest.update({
    where: { id: dsarRequestId },
    data: {
      status: "COMPLETED",
      exportUrl: dataUrl,
      exportExpiresAt: expiresAt,
      processedAt: new Date(),
    },
  });

  logger.info({ dsarRequestId, userId }, "dsarProcess: export complete");
}

// ---------------------------------------------------------------------------
// ERASE
// ---------------------------------------------------------------------------

async function handleErase(
  dsarRequestId: string,
  userId: string,
): Promise<void> {
  const anonEmail = `anon-${userId}@deleted.crawlix.io`;

  await prisma.$transaction([
    // Anonymise the User row.
    prisma.user.update({
      where: { id: userId },
      data: {
        email: anonEmail,
        firstName: null,
        lastName: null,
        phone: null,
      },
    }),
    // Detach userId from AuditLog entries (keep record, remove the link).
    prisma.auditLog.updateMany({
      where: { userId },
      data: { userId: null },
    }),
    // Stamp the request as completed.
    prisma.dsarRequest.update({
      where: { id: dsarRequestId },
      data: { status: "COMPLETED", processedAt: new Date() },
    }),
  ]);

  logger.info({ dsarRequestId, userId }, "dsarProcess: erase complete");
}
