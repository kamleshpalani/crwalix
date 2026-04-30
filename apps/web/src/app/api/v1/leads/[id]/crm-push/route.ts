/**
 * POST /api/v1/leads/[id]/crm-push
 *
 * Push a single lead to a connected CRM.
 *
 * Body: { crm: "hubspot" | "zoho" | "apollo" | "clearbit_enrich" }
 *
 * Returns: { success: boolean, id?: string, url?: string, enrichment?: object }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { prisma } from "@crawlix/db";
import { hubspot, zoho, apollo, clearbit } from "@crawlix/providers";
import { auditService } from "@/server/services/audit.service";

const BodySchema = z.object({
  crm: z.enum(["hubspot", "zoho", "apollo", "clearbit_enrich"]),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  const { crm } = parsed.data;

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, organizationId: ctx.orgId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      website: true,
      address: true,
      city: true,
      state: true,
      country: true,
      categoryPrimary: true,
      rating: true,
      score: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const input = {
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    website: lead.website,
    address: lead.address,
    city: lead.city,
    state: lead.state,
    country: lead.country,
    category: lead.categoryPrimary,
    rating: lead.rating,
    score: lead.score,
    crawlixLeadId: lead.id,
  };

  let result: {
    success: boolean;
    id?: string;
    url?: string;
    enrichment?: unknown;
  } = {
    success: false,
  };

  switch (crm) {
    case "hubspot": {
      if (!hubspot.available()) {
        return NextResponse.json(
          { error: { code: "CRM_NOT_CONFIGURED", crm } },
          { status: 503 },
        );
      }
      const r = await hubspot.upsertByEmail(input);
      result = r ? { success: true, id: r.id, url: r.url } : { success: false };
      break;
    }
    case "zoho": {
      if (!zoho.available()) {
        return NextResponse.json(
          { error: { code: "CRM_NOT_CONFIGURED", crm } },
          { status: 503 },
        );
      }
      const r = await zoho.pushLead(input);
      result = r ? { success: true, id: r.id, url: r.url } : { success: false };
      break;
    }
    case "apollo": {
      if (!apollo.available()) {
        return NextResponse.json(
          { error: { code: "CRM_NOT_CONFIGURED", crm } },
          { status: 503 },
        );
      }
      const r = await apollo.pushContact(input);
      result = r ? { success: true, id: r.id, url: r.url } : { success: false };
      break;
    }
    case "clearbit_enrich": {
      if (!clearbit.available()) {
        return NextResponse.json(
          { error: { code: "CRM_NOT_CONFIGURED", crm } },
          { status: 503 },
        );
      }
      const domain = lead.website
        ? new URL(
            lead.website.startsWith("http")
              ? lead.website
              : `https://${lead.website}`,
          ).hostname.replace(/^www\./, "")
        : null;
      const enrichment = domain ? await clearbit.enrichCompany(domain) : null;
      result = {
        success: Boolean(enrichment),
        enrichment: enrichment ?? undefined,
      };
      break;
    }
  }

  void auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "lead.crm_push",
    target: lead.id,
    metadata: { crm, success: result.success, remoteId: result.id },
  });

  return NextResponse.json(result);
}
