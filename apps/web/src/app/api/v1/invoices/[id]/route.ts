import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { invoiceService } from "@/server/services/invoice.service";

const Line = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(0).max(100_000),
  unitCents: z.number().int().min(0).max(1_000_000_000),
});

const Body = z.object({
  title: z.string().max(200).nullish(),
  customerName: z.string().max(200).nullish(),
  customerEmail: z.string().email().max(200).nullish(),
  currency: z.string().length(3).optional(),
  memo: z.string().max(2000).nullish(),
  lineItems: z.array(Line).min(1).max(100),
  taxRatePct: z.number().min(0).max(100).optional(),
  dueAt: z.string().datetime().nullish(),
  dealId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const invoice = await invoiceService.get(ctx.orgId, params.id);
  if (!invoice)
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ invoice });
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
    const invoice = await invoiceService.update(
      ctx.orgId,
      params.id,
      parsed.data,
    );
    return NextResponse.json({ invoice });
  } catch (e) {
    const code = e instanceof Error ? e.message : "ERROR";
    const status =
      code === "NOT_FOUND"
        ? 404
        : code === "NOT_EDITABLE" || code === "STRIPE_MANAGED"
          ? 409
          : 500;
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
  try {
    await invoiceService.remove(ctx.orgId, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const code = e instanceof Error ? e.message : "ERROR";
    const status =
      code === "NOT_DRAFT" || code === "STRIPE_MANAGED" ? 409 : 500;
    return NextResponse.json({ error: { code } }, { status });
  }
}
