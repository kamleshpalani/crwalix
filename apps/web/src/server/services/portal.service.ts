/**
 * Client portal service (Phase 3.3).
 *
 * Magic-link authentication for external clients. Flow:
 *   1. Org member invites client by email → PortalAccess (PENDING).
 *   2. Client requests login → we generate random secret, store SHA-256 hash
 *      as PortalLoginToken, email raw secret as `/portal/verify?t=<secret>`.
 *   3. Client clicks link → we hash the param, look up + consume the token,
 *      mark PortalAccess ACTIVE, set a signed session cookie.
 *   4. Client requests pages under /portal → middleware/handler reads cookie,
 *      verifies signature, attaches portal context.
 *
 * Cookie payload is signed with HMAC-SHA256 using PORTAL_SESSION_SECRET.
 * No Clerk seat required — completely separate auth surface.
 */

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { prisma, withOrg } from "@crawlix/db";
import { sendEmail } from "@crawlix/email";

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface PortalSession {
  accessId: string;
  projectId: string;
  orgId: string;
  email: string;
  exp: number; // unix ms
}

function sessionSecret(): string {
  const s = process.env.PORTAL_SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "PORTAL_SESSION_SECRET must be set (>= 32 chars) for client portal",
    );
  }
  return s;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function hmacSign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

/** Encode session as `<base64url(JSON)>.<hmac>`. */
function encodeSession(session: PortalSession): string {
  const json = JSON.stringify(session);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = hmacSign(b64);
  return `${b64}.${sig}`;
}

/** Verify and decode a session cookie. Returns null if invalid/expired. */
export function decodePortalSession(
  cookie: string | undefined,
): PortalSession | null {
  if (!cookie) return null;
  const [b64, sig] = cookie.split(".");
  if (!b64 || !sig) return null;

  const expected = hmacSign(b64);
  // Constant-time compare.
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (typeof parsed?.exp !== "number" || parsed.exp < Date.now()) return null;
    return parsed as PortalSession;
  } catch {
    return null;
  }
}

export const portalService = {
  /**
   * Org member invites a client to a project. Idempotent on (projectId, email).
   * Returns the PortalAccess row (created or existing).
   */
  async invite(
    orgId: string,
    invitedById: string,
    input: { projectId: string; email: string; name?: string },
  ) {
    const email = input.email.trim().toLowerCase();
    return withOrg(orgId, async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: input.projectId, organizationId: orgId },
        select: { id: true },
      });
      if (!project) return null;

      return tx.portalAccess.upsert({
        where: { projectId_email: { projectId: input.projectId, email } },
        update: { name: input.name ?? undefined, revokedAt: null },
        create: {
          organizationId: orgId,
          projectId: input.projectId,
          email,
          name: input.name ?? null,
          status: "PENDING",
          invitedById,
        },
      });
    });
  },

  async listForProject(orgId: string, projectId: string) {
    return withOrg(orgId, (tx) =>
      tx.portalAccess.findMany({
        where: { organizationId: orgId, projectId },
        orderBy: { invitedAt: "desc" },
      }),
    );
  },

  async revoke(orgId: string, accessId: string) {
    return withOrg(orgId, (tx) =>
      tx.portalAccess.updateMany({
        where: { id: accessId, organizationId: orgId },
        data: { status: "REVOKED", revokedAt: new Date() },
      }),
    );
  },

  /**
   * Public entry point: client requests a magic link. We don't reveal whether
   * the email is known (anti-enumeration) — always return ok.
   */
  async requestLoginLink(email: string, baseUrl: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;

    // Find ALL active grants for this email (a client may have access to
    // multiple projects across orgs). Send one email per active grant.
    const accesses = await prisma.portalAccess.findMany({
      where: { email: normalized, status: { not: "REVOKED" } },
    });
    if (accesses.length === 0) {
      // Silent no-op to prevent email enumeration.
      return;
    }

    for (const access of accesses) {
      const secret = randomBytes(32).toString("base64url");
      const hash = sha256Hex(secret);
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

      await prisma.portalLoginToken.create({
        data: {
          organizationId: access.organizationId,
          portalAccessId: access.id,
          tokenHash: hash,
          expiresAt,
        },
      });

      const url = new URL("/portal/verify", baseUrl);
      url.searchParams.set("t", secret);

      await sendEmail({
        to: normalized,
        subject: "Your secure project access link",
        text: `Click to access your project portal: ${url.toString()}\n\nThis link expires in 30 minutes.`,
        html: `<p>Click to access your project portal:</p><p><a href="${url.toString()}">Open project portal</a></p><p>This link expires in 30 minutes.</p>`,
      });
    }
  },

  /**
   * Verify a magic link secret and return a signed session cookie value.
   * Returns null if token is invalid/expired/already-used.
   */
  async verifyAndCreateSession(
    rawSecret: string,
  ): Promise<{ cookieValue: string; session: PortalSession } | null> {
    const hash = sha256Hex(rawSecret);
    const token = await prisma.portalLoginToken.findUnique({
      where: { tokenHash: hash },
    });
    if (!token) return null;
    if (token.consumedAt) return null;
    if (token.expiresAt.getTime() < Date.now()) return null;

    const access = await prisma.portalAccess.findUnique({
      where: { id: token.portalAccessId },
    });
    if (!access || access.status === "REVOKED") return null;

    // Consume token + activate access in a single tx.
    await prisma.$transaction([
      prisma.portalLoginToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      }),
      prisma.portalAccess.update({
        where: { id: access.id },
        data: { status: "ACTIVE", lastLoginAt: new Date() },
      }),
    ]);

    const session: PortalSession = {
      accessId: access.id,
      projectId: access.projectId,
      orgId: access.organizationId,
      email: access.email,
      exp: Date.now() + SESSION_TTL_MS,
    };

    return { cookieValue: encodeSession(session), session };
  },
};

export const PORTAL_COOKIE_NAME = "crawlix_portal";
