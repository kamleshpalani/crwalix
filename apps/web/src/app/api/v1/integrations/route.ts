import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import {
  integrationService,
  PROVIDER_CATALOG,
} from "@/server/services/integration.service";

const Body = z.object({
  provider: z.enum([
    "slack",
    "gmail",
    "outlook",
    "hubspot",
    "salesforce",
    "zapier",
    "webhook",
  ]),
  accountLabel: z.string().max(120).nullish(),
  credentials: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

export async function GET() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const integrations = await integrationService.list(ctx.orgId);
  return NextResponse.json({ integrations, catalog: PROVIDER_CATALOG });
}

export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON" } },
      { status: 400 },
    );
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  const integration = await integrationService.connect(
    ctx.orgId,
    ctx.userId,
    parsed.data,
  );
  return NextResponse.json({ integration });
}
