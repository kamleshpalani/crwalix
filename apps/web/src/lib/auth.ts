import { auth } from '@clerk/nextjs/server';
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
 */
export async function requireOrg(): Promise<AuthContext | NextResponse | AuthError> {
  const { userId, orgId: clerkOrgId, orgRole } = auth();
  if (!userId) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }, { status: 401 });
  }
  if (!clerkOrgId) {
    return { code: 'NO_ORG' } satisfies AuthError;
  }

  const org = await prisma.organization.upsert({
    where: { clerkOrgId },
    update: {},
    create: { clerkOrgId, slug: clerkOrgId.toLowerCase(), name: 'New Organization' }
  });

  const user = await prisma.user.upsert({
    where: { clerkId: userId },
    update: {},
    create: { clerkId: userId, email: `${userId}@placeholder.local` }
  });

  return { userId: user.id, clerkUserId: userId, clerkOrgId, orgId: org.id, role: orgRole ?? 'member' };
}
