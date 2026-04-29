import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { contractService } from "@/server/services/contract.service";

const Body = z.object({
  title: z.string().min(1).max(200),
  bodyMarkdown: z.string().min(1).max(100_000),
  counterpartyName: z.string().max(200).nullish(),
  counterpartyEmail: z.string().email().max(200).nullish(),
  expiresAt: z.string().datetime().nullish(),
  dealId: z.string().uuid().nullish(),
  leadId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  quoteId: z.string().uuid().nullish(),
});

export async function GET() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const contracts = await contractService.list(ctx.orgId);
  return NextResponse.json({ contracts });
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
  const contract = await contractService.create(
    ctx.orgId,
    parsed.data,
    ctx.userId,
  );
  return NextResponse.json({ contract });
}
