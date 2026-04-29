import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { anomaliesService } from "@/server/services/anomalies.service";

export async function GET() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const anomalies = await anomaliesService.detectAll(ctx.orgId);
  return NextResponse.json({ anomalies });
}
