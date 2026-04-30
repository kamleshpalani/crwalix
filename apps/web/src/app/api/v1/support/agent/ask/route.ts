import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { supportService } from "@/server/services/support.service";
import { rateLimitOrg } from "@/lib/rate-limit";

const Body = z.object({
  question: z.string().min(1).max(4000),
  ticketId: z.string().uuid().optional(),
  brandVoice: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const limited = await rateLimitOrg(ctx.orgId, "ai");
  if (limited) return limited;

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
  const result = await supportService.askAgent({
    orgId: ctx.orgId,
    question: parsed.data.question,
    ticketId: parsed.data.ticketId,
    brandVoice: parsed.data.brandVoice,
  });
  return NextResponse.json(result);
}
