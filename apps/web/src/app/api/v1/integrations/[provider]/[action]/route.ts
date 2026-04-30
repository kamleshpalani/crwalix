import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { integrationService } from "@/server/services/integration.service";

const PROVIDERS = [
  "slack",
  "gmail",
  "outlook",
  "hubspot",
  "salesforce",
  "zapier",
  "webhook",
] as const;
type Provider = (typeof PROVIDERS)[number];
function isProvider(s: string): s is Provider {
  return (PROVIDERS as readonly string[]).includes(s);
}

export async function POST(
  _req: Request,
  { params }: { params: { provider: string; action: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  if (!isProvider(params.provider))
    return NextResponse.json(
      { error: { code: "UNKNOWN_PROVIDER" } },
      { status: 400 },
    );

  switch (params.action) {
    case "disconnect": {
      const integration = await integrationService.disconnect(
        ctx.orgId,
        ctx.userId,
        params.provider,
      );
      if (!integration)
        return NextResponse.json(
          { error: { code: "NOT_FOUND" } },
          { status: 404 },
        );
      return NextResponse.json({ integration });
    }
    case "test": {
      const result = await integrationService.test(
        ctx.orgId,
        ctx.userId,
        params.provider,
      );
      return NextResponse.json(result);
    }
    case "sync": {
      const result = await integrationService.syncNow(
        ctx.orgId,
        ctx.userId,
        params.provider,
      );
      return NextResponse.json(result);
    }
    default:
      return NextResponse.json(
        { error: { code: "UNKNOWN_ACTION" } },
        { status: 400 },
      );
  }
}
