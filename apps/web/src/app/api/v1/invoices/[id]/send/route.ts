import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { invoiceService } from "@/server/services/invoice.service";
import { auditService } from "@/server/services/audit.service";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  try {
    const invoice = await invoiceService.send(ctx.orgId, params.id);
    await auditService.record({
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "invoice.send",
      target: invoice.id,
      metadata: { number: invoice.number, totalCents: invoice.totalCents },
    });
    return NextResponse.json({ invoice });
  } catch (e) {
    const code = e instanceof Error ? e.message : "ERROR";
    const status =
      code === "NOT_FOUND"
        ? 404
        : code === "NOT_DRAFT" || code === "STRIPE_MANAGED"
          ? 409
          : 500;
    return NextResponse.json({ error: { code } }, { status });
  }
}
