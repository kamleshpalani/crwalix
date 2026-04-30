import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import {
  reportingService,
  type ReportRange,
} from "@/server/services/reporting.service";

const VALID: ReportRange[] = ["7d", "30d", "90d", "365d"];

function parseRange(req: Request): ReportRange {
  const url = new URL(req.url);
  const r = url.searchParams.get("range") as ReportRange | null;
  return r && VALID.includes(r) ? r : "30d";
}

export async function GET(
  req: Request,
  { params }: { params: { kind: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const range = parseRange(req);
  switch (params.kind) {
    case "leads":
      return NextResponse.json({
        report: await reportingService.leads(ctx.orgId, range),
      });
    case "sales":
      return NextResponse.json({
        report: await reportingService.sales(ctx.orgId, range),
      });
    case "billing":
      return NextResponse.json({
        report: await reportingService.billing(ctx.orgId, range),
      });
    default:
      return NextResponse.json(
        { error: { code: "UNKNOWN_REPORT" } },
        { status: 404 },
      );
  }
}
