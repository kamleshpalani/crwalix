import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireOrg,
  isResponse,
  isAuthError,
  hasFinanceAccess,
  requireRole,
} from "@/lib/auth";
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

export async function GET() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const invoices = await invoiceService.list(ctx.orgId);
  return NextResponse.json({ invoices });
}

export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const denied = requireRole(ctx, hasFinanceAccess);
  if (denied) return denied;

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
  const invoice = await invoiceService.create(
    ctx.orgId,
    parsed.data,
    ctx.userId,
  );
  return NextResponse.json({ invoice });
}
