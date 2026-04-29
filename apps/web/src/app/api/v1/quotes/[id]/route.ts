import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { quoteService } from "@/server/services/quote.service";

const ItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().min(0).max(1_000_000),
  unitPriceCents: z.number().int().min(0).max(1_000_000_000),
});

const Body = z.object({
  title: z.string().min(1).max(200),
  dealId: z.string().uuid().nullish(),
  leadId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  currency: z.string().length(3).optional(),
  discountCents: z.number().int().min(0).max(1_000_000_000).optional(),
  taxRateBps: z.number().int().min(0).max(20_000).optional(),
  notes: z.string().max(4000).nullish(),
  terms: z.string().max(8000).nullish(),
  validUntil: z.string().datetime().nullish(),
  items: z.array(ItemSchema).min(1).max(50),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const quote = await quoteService.get(ctx.orgId, params.id);
  if (!quote)
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ quote });
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
) {
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
  try {
    const quote = await quoteService.update(ctx.orgId, params.id, parsed.data);
    return NextResponse.json({ quote });
  } catch (e) {
    const code = e instanceof Error ? e.message : "ERROR";
    const status =
      code === "NOT_FOUND" ? 404 : code === "NOT_EDITABLE" ? 409 : 500;
    return NextResponse.json({ error: { code } }, { status });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  await quoteService.remove(ctx.orgId, params.id);
  return NextResponse.json({ ok: true });
}
