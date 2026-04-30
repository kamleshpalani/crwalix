import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { leadsService } from "@/server/services/leads.service";
import { auditService } from "@/server/services/audit.service";

export const runtime = "nodejs";

/**
 * CSV / Excel-as-CSV bulk lead import (Section 7.2).
 *
 * Accepts either:
 *   - text/csv body (raw CSV string), or
 *   - multipart/form-data with a `file` field (CSV file).
 *
 * Optional query: `?provider=hubspot_export` to label rows.
 *
 * Header columns supported (case-insensitive, any subset):
 *   name (required), phone, email, website, address, city, state,
 *   country, postal_code, category, industry, owner_name, facebook,
 *   instagram, rating, review_count, lat, lng.
 *
 * Returns counts of created vs merged. Merged rows do NOT count against
 * the org's lead quota (Section 7.4: "Duplicate records should not be
 * charged again").
 */
export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx)) {
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  }

  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") || "csv_import";
  const contentType = req.headers.get("content-type") ?? "";

  let csv = "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Missing 'file' part" } },
        { status: 400 },
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "CSV must be ≤10MB" } },
        { status: 413 },
      );
    }
    csv = await file.text();
  } else {
    csv = await req.text();
    if (csv.length > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "CSV must be ≤10MB" } },
        { status: 413 },
      );
    }
  }

  if (!csv.trim()) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Empty CSV" } },
      { status: 400 },
    );
  }

  const result = await leadsService.importCsv(ctx.orgId, csv, { provider });

  void auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "lead.import_csv",
    target: provider,
    metadata: {
      provider,
      created: result.created,
      merged: result.merged,
      failed: result.failed,
    },
  });

  return NextResponse.json(result);
}
