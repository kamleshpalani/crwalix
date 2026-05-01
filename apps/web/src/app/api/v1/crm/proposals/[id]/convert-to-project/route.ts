/**
 * POST /api/v1/crm/proposals/[id]/convert-to-project
 *
 * Converts an ACCEPTED proposal into a project using the parent deal.
 * Idempotent: if a project already exists for the deal, returns it.
 *
 * Body (optional):
 *   { projectName?: string }
 *
 * Requires the proposal to be in ACCEPTED status. The deal must exist and
 * must not already have a project (idempotency guard).
 *
 * Response:
 *   { project: { id, name, status, dealId }, created: boolean }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@crawlix/db";
import { ProposalStatus } from "@crawlix/shared";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { projectKickoffService } from "@/server/services/project-kickoff.service";
import { auditService } from "@/server/services/audit.service";
import { emitNotification } from "@/server/lib/notify";
import { withOrg } from "@crawlix/db";
import { ActivityKind } from "@crawlix/shared";

const Body = z
  .object({
    projectName: z.string().min(1).max(200).optional(),
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

  let rawBody: unknown = {};
  try {
    rawBody = await req.json();
  } catch {
    /* empty body is fine */
  }

  const parsed = Body.safeParse(rawBody);
  const args = parsed.success && parsed.data ? parsed.data : {};

  // Load the proposal.
  const proposal = await prisma.proposal.findFirst({
    where: { id: params.id, organizationId: ctx.orgId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      version: true,
      dealId: true,
      leadId: true,
    },
  });

  if (!proposal) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  if (proposal.status !== ProposalStatus.ACCEPTED) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_ACCEPTED",
          message: "Only ACCEPTED proposals can be converted to a project.",
        },
      },
      { status: 409 },
    );
  }

  // Load the deal — we need title, leadId, and existing projectId.
  const deal = await prisma.deal.findFirst({
    where: { id: proposal.dealId, organizationId: ctx.orgId },
    select: { id: true, title: true, leadId: true, projectId: true },
  });

  if (!deal) {
    return NextResponse.json(
      { error: { code: "DEAL_NOT_FOUND" } },
      { status: 409 },
    );
  }

  // Run the kickoff (idempotent — returns existing project if already created).
  const kick = await projectKickoffService.kickoffFromDeal(
    ctx.orgId,
    ctx.userId ?? null,
    {
      id: deal.id,
      leadId: deal.leadId,
      title: args.projectName ?? deal.title,
      projectId: deal.projectId,
    },
  );

  // If freshly created, drop an activity on the deal timeline.
  if (kick.created) {
    await withOrg(ctx.orgId, (tx) =>
      tx.activity.create({
        data: {
          organizationId: ctx.orgId,
          dealId: deal.id,
          leadId: deal.leadId,
          userId: ctx.userId,
          kind: ActivityKind.SYSTEM,
          summary: `Project created from accepted proposal v${proposal.version}: ${kick.project.name}`,
          metadata: {
            projectId: kick.project.id,
            proposalId: proposal.id,
            source: "proposal.convert_to_project",
          } as never,
        },
      }),
    );

    void emitNotification({
      organizationId: ctx.orgId,
      kind: "PROJECT_CREATED",
      title: `Project created: ${kick.project.name}`,
      body: `Kickoff project generated from accepted proposal v${proposal.version}.`,
      href: `/projects/${kick.project.id}`,
      data: {
        projectId: kick.project.id,
        dealId: deal.id,
        proposalId: proposal.id,
      },
    });
  }

  void auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "proposal.convert_to_project",
    target: proposal.id,
    metadata: {
      projectId: kick.project.id,
      dealId: deal.id,
      created: kick.created,
    },
  });

  return NextResponse.json(
    {
      project: {
        id: kick.project.id,
        name: kick.project.name,
        status: kick.project.status,
        dealId: kick.project.dealId,
      },
      created: kick.created,
    },
    { status: kick.created ? 201 : 200 },
  );
}
