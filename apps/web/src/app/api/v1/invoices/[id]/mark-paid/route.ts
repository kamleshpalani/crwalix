import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { invoiceService } from "@/server/services/invoice.service";

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
    return NextResponse.json({ invoice });
  } catch (e) {
    const code = e instanceof Error ? e.message : "ERROR";
    const status =
      code === "NOT_FOUND"
        ? 404
        : code === "ALREADY_PAID" || code === "VOIDED"
          ? 409
          : 500;
    return NextResponse.json({ error: { code } }, { status });
  }
}
