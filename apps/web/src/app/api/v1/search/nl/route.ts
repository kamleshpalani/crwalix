import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { nlSearchService } from "@/server/services/nl-search.service";
import { rateLimitOrg } from "@/lib/rate-limit";

const Query = z.object({
  q: z.string().min(1).max(500),
});

export async function GET(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const limited = await rateLimitOrg(ctx.orgId, "ai");
  if (limited) return limited;

  const url = new URL(req.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  const result = await nlSearchService.run(ctx.orgId, parsed.data.q);
  return NextResponse.json(result);
}
