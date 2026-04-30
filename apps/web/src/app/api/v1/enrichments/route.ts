import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { enrichmentService } from "@/server/services/enrichment.service";
import { auditService } from "@/server/services/audit.service";

const Kind = z.enum([
  "WEBSITE_VALIDATION",
  "EMAIL",
  "EMAIL_VERIFY",
  "SOCIAL",
  "COMPANY",
  "CONTACT",
]);

const Body = z.union([
  z.object({
    leadId: z.string().uuid(),
    kinds: z.array(Kind).min(1).max(6),
  }),
  z.object({
    leadIds: z.array(z.string().uuid()).min(1).max(1000),
    kinds: z.array(Kind).min(1).max(6),
  }),
]);

export async function GET(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const url = new URL(req.url);
  const summary = url.searchParams.get("summary") === "1";
  if (summary) {
    const counts = await enrichmentService.summary(ctx.orgId);
    return NextResponse.json({ counts });
  }
  const enrichments = await enrichmentService.list(ctx.orgId, {
    status: url.searchParams.get("status") ?? undefined,
    kind: url.searchParams.get("kind") ?? undefined,
    leadId: url.searchParams.get("leadId") ?? undefined,
    limit: url.searchParams.get("limit")
      ? parseInt(url.searchParams.get("limit")!, 10)
      : undefined,
  });
  return NextResponse.json({ enrichments });
}

export async function POST(req: Request) {
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

  if ("leadId" in parsed.data) {
    const results = await enrichmentService.queue(ctx.orgId, parsed.data);
    await auditService.record({
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "enrichment.queue",
      target: parsed.data.leadId,
      metadata: { kinds: parsed.data.kinds },
    });
    return NextResponse.json({ results });
  }
  const summary = await enrichmentService.bulkQueue(ctx.orgId, parsed.data);
  await auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "enrichment.bulk_queue",
    target: null,
    metadata: {
      leadCount: parsed.data.leadIds.length,
      kinds: parsed.data.kinds,
      ...summary,
    },
  });
  return NextResponse.json({ summary });
}
