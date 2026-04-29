/**
 * GET /api/v1/billing/invoices — list org invoices.
 *
 * Returns invoices sorted by creation date (newest first). Used by the
 * billing settings page to show payment history.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma, withOrg } from "@crawlix/db";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const invoices = await withOrg(ctx.orgId, (tx) =>
    tx.invoice.findMany({
      where: { organizationId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        amountDueCents: true,
        currency: true,
        dueAt: true,
        paidAt: true,
        hostedUrl: true,
        pdfUrl: true,
        createdAt: true,
      },
    }),
  );

  return NextResponse.json({ invoices }, { status: 200 });
}
