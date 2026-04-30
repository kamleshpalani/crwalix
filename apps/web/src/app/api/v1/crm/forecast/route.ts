import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { forecastService } from "@/server/services/forecast.service";

const Query = z.object({
  horizonDays: z.coerce.number().int().min(7).max(365).optional(),
  pipelineId: z.string().uuid().optional(),
});

export async function GET(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const url = new URL(req.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  const result = await forecastService.run(ctx.orgId, parsed.data);
  return NextResponse.json(result);
}
