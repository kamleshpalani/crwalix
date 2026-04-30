import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@crawlix/db";

export interface AuthContext {
  userId: string; // Crawlix User.id (internal)
  clerkUserId: string;
  clerkOrgId: string;
  orgId: string;
  role: string;
  isSuperAdmin: boolean;
}

export type AuthError = {
  code:
    | "UNAUTHORIZED"
    | "NO_ORG"
    | "USER_SUSPENDED"
    | "ORG_SUSPENDED"
    | "MFA_REQUIRED";
};

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}

export function isAuthError(x: unknown): x is AuthError {
  return typeof x === "object" && x !== null && "code" in x;
}

// ---------------------------------------------------------------------------
// Spec Section 4 — Granular role helpers
// ---------------------------------------------------------------------------
//
// Role hierarchy (each role is a superset of those below it):
//   OWNER > ADMIN > (SALES | PROJECT_MANAGER | FINANCE) > MEMBER
//
// "Elevated" roles are the Clerk-native "admin" / "org:admin" strings as well
// as our DB-level OWNER and ADMIN values. The four named functional roles each
// grant access to a specific feature area only. MEMBER has read-only access.

/** Normalise a Clerk org role string or DB Role enum value to lower-case. */
function norm(role: string) {
  return role.toLowerCase();
}

const ELEVATED = new Set(["owner", "admin", "org:admin"]);

/** OWNER or ADMIN — can do everything an org member can do. */
export function isElevated(ctx: AuthContext): boolean {
  return ctx.isSuperAdmin || ELEVATED.has(norm(ctx.role));
}

/** Spec 4.3 — Sales User: leads, outreach, CRM, proposals, quotes. */
export function hasSalesAccess(ctx: AuthContext): boolean {
  return isElevated(ctx) || norm(ctx.role) === "sales";
}

/** Spec 4.4 — Project Manager: projects, tasks, milestones, files, portal. */
export function hasProjectAccess(ctx: AuthContext): boolean {
  return isElevated(ctx) || norm(ctx.role) === "project_manager";
}

/** Spec 4.5 — Finance User: invoices, billing history, exports. */
export function hasFinanceAccess(ctx: AuthContext): boolean {
  return isElevated(ctx) || norm(ctx.role) === "finance";
}

/** Return a 403 NextResponse if the predicate is false. */
export function requireRole(
  ctx: AuthContext,
  check: (c: AuthContext) => boolean,
): NextResponse | null {
  return check(ctx)
    ? null
    : NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
}

/**
 * Spec 6.1 — checks whether the Clerk session JWT contains a verified second
 * factor. Clerk stores this in the `fva` (factor verification array) claim:
 *   fva[0] = seconds since first-factor verification
 *   fva[1] = seconds since second-factor verification (-1 if never verified)
 */
function hasCompletedMfa(
  sessionClaims: Record<string, unknown> | null | undefined,
): boolean {
  const fva = sessionClaims?.fva;
  const secondFactorAge =
    Array.isArray(fva) && fva.length >= 2 ? (fva[1] as number) : -1;
  return secondFactorAge !== -1;
}

/**
 * Resolve the current Clerk session → Crawlix Organization row.
 * Returns AuthError if not logged in or no active org.
 *
 * In Clerk dev instances the session JWT doesn't always update synchronously
 * after `setActive({ organization })`. To avoid bouncing the user back to the
 * "no organization" banner, we fall back to the Backend API: if the user has
 * exactly one membership, treat that as the active org. This makes the UX
 * deterministic for single-org workspaces and recovers from JWT propagation
 * lag for multi-org users (we pick the most recently created).
 */
export async function requireOrg(): Promise<
  AuthContext | NextResponse | AuthError
> {
  const { userId, orgId: clerkOrgIdFromJwt, orgRole, sessionClaims } = auth();
  if (!userId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in required" } },
      { status: 401 },
    );
  }

  // Ensure we have an internal User row (used by the local-org fallback below).
  const user = await prisma.user.upsert({
    where: { clerkId: userId },
    update: {},
    create: { clerkId: userId, email: `${userId}@placeholder.local` },
  });

  // Section 6.1 — block suspended/deleted/pending users immediately.
  if (user.status !== "ACTIVE") {
    return { code: "USER_SUSPENDED" } satisfies AuthError;
  }

  let clerkOrgId = clerkOrgIdFromJwt ?? null;
  let role = orgRole ?? null;

  // Fallback 1: Clerk Backend API (handles JWT propagation lag right after
  // setActive). May fail with a transient "fetch failed" — that's fine, we
  // have a second fallback.
  if (!clerkOrgId) {
    try {
      const memberships =
        await clerkClient().users.getOrganizationMembershipList({
          userId,
        });
      const list = memberships?.data ?? [];
      if (list.length > 0) {
        const sorted = [...list].sort(
          (a, b) => Number(b.createdAt) - Number(a.createdAt),
        );
        const m = sorted[0]!;
        clerkOrgId = m.organization.id;
        role = m.role;
      }
    } catch (e) {
      console.warn("[auth] Backend membership lookup failed", e);
    }
  }

  // Fallback 2: local DB. Once we've successfully resolved an org for this
  // user once, we cache the membership in our OrganizationMember table; this
  // makes server actions work even when Clerk's Backend API is briefly
  // unreachable.
  if (!clerkOrgId) {
    const localMember = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: { organization: true },
      orderBy: { createdAt: "desc" },
    });
    if (localMember?.organization?.clerkOrgId) {
      clerkOrgId = localMember.organization.clerkOrgId;
      role = localMember.role;
    }
  }

  if (!clerkOrgId) {
    return { code: "NO_ORG" } satisfies AuthError;
  }

  const org = await prisma.organization.upsert({
    where: { clerkOrgId },
    update: {},
    create: {
      clerkOrgId,
      slug: clerkOrgId.toLowerCase(),
      name: "New Organization",
    },
  });

  // Section 6.2 — block suspended/deleted/pending orgs.
  if (org.status !== "ACTIVE") {
    return { code: "ORG_SUSPENDED" } satisfies AuthError;
  }

  // Spec 6.1 — per-org MFA enforcement.
  // When requireMfa = true, the Clerk session must have a verified second factor.
  // Clerk encodes MFA status in the JWT claim `fva` (factor verification array):
  //   fva[0] = time since first factor verified (seconds), fva[1] = time since second factor.
  // A value of -1 means the factor type was never verified in this session.
  if (org.requireMfa && !hasCompletedMfa(sessionClaims)) {
    return { code: "MFA_REQUIRED" } satisfies AuthError;
  }

  // Best-effort lastLoginAt (debounced ~1h to avoid hot-path writes).
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  if (!user.lastLoginAt || user.lastLoginAt.getTime() < oneHourAgo) {
    prisma.user
      .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      .catch(() => {});
  }

  // Cache the membership locally so we can recover from Clerk API outages.
  await prisma.organizationMember
    .upsert({
      where: {
        organizationId_userId: { organizationId: org.id, userId: user.id },
      },
      update: {},
      create: { organizationId: org.id, userId: user.id, role: "MEMBER" },
    })
    .catch((e) => {
      console.warn("[auth] OrganizationMember upsert failed", e);
    });

  return {
    userId: user.id,
    clerkUserId: userId,
    clerkOrgId,
    orgId: org.id,
    role: role ?? "member",
    isSuperAdmin: user.isSuperAdmin,
  };
}

/**
 * Section 6.1 — Super-admin gate for cross-tenant platform endpoints.
 * Returns the authed user's id, or an `AuthError` / `NextResponse`.
 */
export async function requireSuperAdmin(): Promise<
  { userId: string } | NextResponse | AuthError
> {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in required" } },
      { status: 401 },
    );
  }
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, status: true, isSuperAdmin: true },
  });
  if (!user || !user.isSuperAdmin) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Super admin only" } },
      { status: 403 },
    );
  }
  if (user.status !== "ACTIVE") {
    return { code: "USER_SUSPENDED" } satisfies AuthError;
  }
  return { userId: user.id };
}

/**
 * Phase 5.8 — API key authentication.
 *
 * Accepts either a Clerk session (browser) or a `Authorization: Bearer ck_...`
 * header (programmatic access via API key).  Returns the same AuthContext
 * shape so route handlers work identically regardless of auth method.
 *
 * API key format: `ck_live_<random>` — the full key is hashed with SHA-256
 * and stored in ApiKey.keyHash.  The prefix (first 8 chars of the random
 * portion) is stored in ApiKey.keyPrefix for display in the UI.
 */
export async function requireOrgOrApiKey(
  req: Request | { headers: Headers },
): Promise<AuthContext | NextResponse | AuthError> {
  const authorization =
    (req as Request).headers?.get?.("authorization") ?? null;
  const raw = authorization?.replace(/^Bearer\s+/i, "") ?? "";

  if (raw.startsWith("ck_")) {
    // API key path.
    const hash = createHash("sha256").update(raw).digest("hex");

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash: hash },
      include: { organization: true },
    });

    if (!apiKey || apiKey.revokedAt !== null) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid or revoked API key",
          },
        },
        { status: 401 },
      );
    }

    if (apiKey.organization.status !== "ACTIVE") {
      return { code: "ORG_SUSPENDED" } satisfies AuthError;
    }

    // Best-effort lastUsedAt stamp (fire-and-forget).
    prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    // We don't have a per-user context for machine keys, so we use the key
    // creator as the userId for audit purposes.
    const creator = await prisma.user.findUnique({
      where: { id: apiKey.createdById },
      select: { id: true, isSuperAdmin: true },
    });

    return {
      userId: apiKey.createdById,
      clerkUserId: creator?.id ?? apiKey.createdById,
      clerkOrgId: apiKey.organization.clerkOrgId ?? apiKey.organizationId,
      orgId: apiKey.organizationId,
      role: "api_key",
      isSuperAdmin: creator?.isSuperAdmin ?? false,
    };
  }

  // Fall through to Clerk session.
  return requireOrg();
}
