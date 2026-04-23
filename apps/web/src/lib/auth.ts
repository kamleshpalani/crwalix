import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { prisma } from '@crawlix/db';

export interface AuthContext {
  userId: string;
  clerkOrgId: string;
  orgId: string;
  role: string;
}

/**
 * Resolve the current Clerk session → Crawlix Organization row.
 * Creates mirror rows if missing (first-login bootstrap).
 * Throws via NextResponse on failure; callers return the thrown response.
 */
export async function requireOrg(): Promise<AuthContext | NextResponse> {
  const { userId, orgId: clerkOrgId, orgRole } = auth();
  if (!userId) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }, { status: 401 });
  }
  if (!clerkOrgId) {
    return NextResponse.json(
      { error: { code: 'NO_ORG', message: 'No active organization — create or select one.' } },
      { status: 403 }
    );
  }

  const org = await prisma.organization.upsert({
    where: { clerkOrgId },
    update: {},
    create: { clerkOrgId, slug: clerkOrgId.toLowerCase(), name: 'New Organization' }
  });

  await prisma.user.upsert({
    where: { clerkId: userId },
    update: {},
    create: { clerkId: userId, email: `${userId}@placeholder.local` }
  });

  return { userId, clerkOrgId, orgId: org.id, role: orgRole ?? 'member' };
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}
