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
import { auditService } from "@/server/services/audit.service";

const Body = z
  .object({
    method: z.string().max(50).optional(),
    reference: z.string().max(200).optional(),
  })
  .optional();

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const denied = requireRole(ctx, hasFinanceAccess);
  if (denied) return denied;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body OK */
  }
  const parsed = Body.safeParse(body);
  const data = parsed.success && parsed.data ? parsed.data : {};
  try {
    const invoice = await invoiceService.markPaid(ctx.orgId, params.id, data);
    await auditService.record({
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "invoice.mark_paid",
      target: invoice.id,
      metadata: { number: invoice.number, method: data.method ?? "manual" },
    });
    return NextResponse.json({ invoice });
  } catch (e) {
    const code = e instanceof Error ? e.message : "ERROR";
    let status = 500;
    if (code === "NOT_FOUND") status = 404;
    else if (code === "ALREADY_PAID" || code === "VOIDED") status = 409;
    return NextResponse.json({ error: { code } }, { status });
  }
}
