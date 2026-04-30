import { NextResponse } from "next/server";
import { LeadFilterSchema, CreateLeadSchema } from "@crawlix/shared";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { leadsService } from "@/server/services/leads.service";
import { auditService } from "@/server/services/audit.service";

export async function GET(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = LeadFilterSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid filter",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }
  const result = await leadsService.list(ctx.orgId, parsed.data);
  return NextResponse.json(result);
}

/**
 * Manual lead entry (Section 7.2). Body is CreateLeadInput. Dedup is on
 * by default — supply `?mode=create_anyway` to bypass merge.
 */
export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }
  const parsed = CreateLeadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid lead payload",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const mode =
    url.searchParams.get("mode") === "create_anyway"
      ? "create_anyway"
      : "merge";
  const result = await leadsService.create(ctx.orgId, parsed.data, {
    mode,
    createdByUserId: ctx.userId,
  });

  void auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: result.created ? "lead.create" : "lead.merge",
    target: result.leadId,
    metadata: result.created
      ? { provider: parsed.data.provider ?? "manual", mode }
      : {
          provider: parsed.data.provider ?? "manual",
          mergedReason: result.mergedReason,
        },
  });

  return NextResponse.json(result, { status: result.created ? 201 : 200 });
}
