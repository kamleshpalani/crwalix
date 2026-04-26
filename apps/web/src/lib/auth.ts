import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { prisma } from '@crawlix/db';

export interface AuthContext {
  userId: string; // Crawlix User.id (internal)
  clerkUserId: string;
  clerkOrgId: string;
  orgId: string;
  role: string;
}

export type AuthError = { code: 'UNAUTHORIZED' | 'NO_ORG' };

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}

export function isAuthError(x: unknown): x is AuthError {
  return typeof x === 'object' && x !== null && 'code' in x;
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
export async function requireOrg(): Promise<AuthContext | NextResponse | AuthError> {
  const { userId, orgId: clerkOrgIdFromJwt, orgRole } = auth();
  if (!userId) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in required' } },
      { status: 401 }
    );
  }

  // Ensure we have an internal User row (used by the local-org fallback below).
  const user = await prisma.user.upsert({
    where: { clerkId: userId },
    update: {},
    create: { clerkId: userId, email: `${userId}@placeholder.local` }
  });

  let clerkOrgId = clerkOrgIdFromJwt ?? null;
  let role = orgRole ?? null;

  // Fallback 1: Clerk Backend API (handles JWT propagation lag right after
  // setActive). May fail with a transient "fetch failed" — that's fine, we
  // have a second fallback.
  if (!clerkOrgId) {
    try {
      const memberships = await clerkClient().users.getOrganizationMembershipList({
        userId
      });
      const list = memberships?.data ?? [];
      if (list.length > 0) {
        const sorted = [...list].sort(
          (a, b) => Number(b.createdAt) - Number(a.createdAt)
        );
        const m = sorted[0]!;
        clerkOrgId = m.organization.id;
        role = m.role;
      }
    } catch (e) {
      console.warn('[auth] Backend membership lookup failed', e);
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
      orderBy: { createdAt: 'desc' }
    });
    if (localMember?.organization?.clerkOrgId) {
      clerkOrgId = localMember.organization.clerkOrgId;
      role = localMember.role;
    }
  }

  if (!clerkOrgId) {
    return { code: 'NO_ORG' } satisfies AuthError;
  }

  const org = await prisma.organization.upsert({
    where: { clerkOrgId },
    update: {},
    create: { clerkOrgId, slug: clerkOrgId.toLowerCase(), name: 'New Organization' }
  });

  // Cache the membership locally so we can recover from Clerk API outages.
  await prisma.organizationMember
    .upsert({
      where: {
        organizationId_userId: { organizationId: org.id, userId: user.id }
      },
      update: {},
      create: { organizationId: org.id, userId: user.id, role: 'MEMBER' }
    })
    .catch((e) => {
      console.warn('[auth] OrganizationMember upsert failed', e);
    });

  return {
    userId: user.id,
    clerkUserId: userId,
    clerkOrgId,
    orgId: org.id,
    role: role ?? 'member'
  };
}
