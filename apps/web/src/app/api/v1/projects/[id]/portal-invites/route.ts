/**
 * POST /api/v1/projects/[id]/portal-invites — invite a client by email.
 * GET  /api/v1/projects/[id]/portal-invites — list grants.
 *
 * Org-side admin endpoints (requires Clerk auth, NOT portal cookie).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import {
  portalService,
  isPortalConfigured,
} from "@/server/services/portal.service";

const Schema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const items = await portalService.listForProject(ctx.orgId, params.id);
  return NextResponse.json({ items });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", issues: parsed.error.issues } },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? `${url.protocol}//${url.host}`;

  const access = await portalService.invite(ctx.orgId, ctx.userId, {
    projectId: params.id,
    email: parsed.data.email,
    name: parsed.data.name,
    baseUrl,
  });
  if (!access)
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  return NextResponse.json(
    {
      access,
      portalConfigured: isPortalConfigured(),
    },
    { status: 201 },
  );
}
