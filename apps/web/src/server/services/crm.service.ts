import { withOrg, prisma } from "@crawlix/db";
import { randomBytes } from "node:crypto";
import {
  ActivityKind,
  DealStatus,
  JobName,
  ProposalStatus,
  QueueName,
  type CreateActivityInput,
  type CreateDealInput,
  type DealFilter,
  type UpdateDealInput,
  type UpdateProposalInput,
} from "@crawlix/shared";
import { enqueue } from "@/lib/queue";
import { projectKickoffService } from "./project-kickoff.service";
import { emitNotification } from "@/server/lib/notify";

/**
 * CRM service: pipelines, deals, activities.
 *
 * All queries run inside `withOrg(orgId, …)` so Postgres RLS enforces tenant
 * isolation regardless of any `where` clauses we forget to add. The seed
 * function `seed_default_pipeline(org_id)` (migration 0012) guarantees every
 * org has at least one pipeline + six stages, so list endpoints can assume
 * non-empty results for active tenants.
 */
export const crmService = {
  /**
   * List every pipeline for the org with its ordered stages. Used by the
   * Kanban board on first render to lay out columns.
   */
  async listPipelines(orgId: string) {
    return withOrg(orgId, async (tx) => {
      const pipelines = await tx.pipeline.findMany({
        where: { organizationId: orgId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      });
      if (pipelines.length === 0) return [];
      const stages = await tx.pipelineStage.findMany({
        where: {
          organizationId: orgId,
          pipelineId: { in: pipelines.map((p) => p.id) },
        },
        orderBy: [{ pipelineId: "asc" }, { position: "asc" }],
      });
      const byPipeline = new Map<string, typeof stages>();
      for (const s of stages) {
        const arr = byPipeline.get(s.pipelineId) ?? [];
        arr.push(s);
        byPipeline.set(s.pipelineId, arr);
      }
      return pipelines.map((p) => ({
        id: p.id,
        name: p.name,
        isDefault: p.isDefault,
        stages: (byPipeline.get(p.id) ?? []).map((s) => ({
          id: s.id,
          pipelineId: s.pipelineId,
          name: s.name,
          position: s.position,
          probability: s.probability,
          isWon: s.isWon,
          isLost: s.isLost,
        })),
      }));
    });
  },

  /** Paginated deal list with optional pipeline / stage / status filters. */
  async listDeals(orgId: string, filter: DealFilter) {
    return withOrg(orgId, async (tx) => {
      const where: Record<string, unknown> = { organizationId: orgId };
      if (filter.pipelineId) where.pipelineId = filter.pipelineId;
      if (filter.stageId) where.stageId = filter.stageId;
      if (filter.status) where.status = filter.status;
      if (filter.ownerUserId) where.ownerUserId = filter.ownerUserId;
      if (filter.leadId) where.leadId = filter.leadId;
      if (filter.search) {
        where.title = { contains: filter.search, mode: "insensitive" };
      }

      const orderBy = parseSort(filter.sort);
      const skip = (filter.page - 1) * filter.pageSize;

      const [items, total] = await Promise.all([
        tx.deal.findMany({
          where,
          orderBy,
          skip,
          take: filter.pageSize,
        }),
        tx.deal.count({ where }),
      ]);

      return {
        items: items.map(toDealListItem),
        page: filter.page,
        pageSize: filter.pageSize,
        total,
      };
    });
  },

  /** Get a single deal with its proposals + recent activities. */
  async getDeal(orgId: string, dealId: string) {
    return withOrg(orgId, async (tx) => {
      const deal = await tx.deal.findFirst({
        where: { id: dealId, organizationId: orgId },
      });
      if (!deal) return null;
      const [activities, proposals] = await Promise.all([
        tx.activity.findMany({
          where: { organizationId: orgId, dealId },
          orderBy: { occurredAt: "desc" },
          take: 50,
        }),
        tx.proposal.findMany({
          where: { organizationId: orgId, dealId },
          orderBy: { version: "desc" },
        }),
      ]);
      return { deal: toDealListItem(deal), activities, proposals };
    });
  },

  /**
   * Create a new deal. If `stageId` is omitted we drop it into position 0 of
   * the chosen pipeline (typically Discovery from the seed function).
   */
  async createDeal(
    orgId: string,
    userId: string | null,
    input: CreateDealInput,
  ) {
    return withOrg(orgId, async (tx) => {
      const pipeline = await tx.pipeline.findFirst({
        where: { id: input.pipelineId, organizationId: orgId },
      });
      if (!pipeline) throw new Error("Pipeline not found");

      let stageId = input.stageId;
      if (stageId) {
        const stage = await tx.pipelineStage.findFirst({
          where: {
            id: stageId,
            pipelineId: pipeline.id,
            organizationId: orgId,
          },
        });
        if (!stage) throw new Error("Stage not in pipeline");
      } else {
        const firstStage = await tx.pipelineStage.findFirst({
          where: { pipelineId: pipeline.id, organizationId: orgId },
          orderBy: { position: "asc" },
        });
        if (!firstStage) throw new Error("Pipeline has no stages");
        stageId = firstStage.id;
      }

      const deal = await tx.deal.create({
        data: {
          organizationId: orgId,
          pipelineId: pipeline.id,
          stageId,
          leadId: input.leadId ?? null,
          title: input.title,
          amountCents: input.amountCents,
          currency: input.currency,
          ownerUserId: input.ownerUserId ?? null,
          expectedCloseAt: input.expectedCloseAt ?? null,
          metadata: (input.metadata ?? null) as never,
        },
      });

      await tx.activity.create({
        data: {
          organizationId: orgId,
          dealId: deal.id,
          leadId: deal.leadId,
          userId,
          kind: ActivityKind.SYSTEM,
          summary: "Deal created",
        },
      });

      return toDealListItem(deal);
    });
  },

  /**
   * Update a deal. A `stageId` change emits a STAGE_CHANGE activity; a status
   * transition to WON/LOST stamps `closedAt`.
   */
  async updateDeal(
    orgId: string,
    userId: string | null,
    dealId: string,
    input: UpdateDealInput,
  ) {
    const result = await withOrg(orgId, async (tx) => {
      const existing = await tx.deal.findFirst({
        where: { id: dealId, organizationId: orgId },
      });
      if (!existing) return null;

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.amountCents !== undefined) data.amountCents = input.amountCents;
      if (input.currency !== undefined) data.currency = input.currency;
      if (input.ownerUserId !== undefined) data.ownerUserId = input.ownerUserId;
      if (input.expectedCloseAt !== undefined)
        data.expectedCloseAt = input.expectedCloseAt;
      if (input.metadata !== undefined) data.metadata = input.metadata as never;

      let stageChanged = false;
      if (input.stageId !== undefined && input.stageId !== existing.stageId) {
        const stage = await tx.pipelineStage.findFirst({
          where: {
            id: input.stageId,
            organizationId: orgId,
            pipelineId: existing.pipelineId,
          },
        });
        if (!stage) throw new Error("Stage not in deal pipeline");
        data.stageId = input.stageId;
        stageChanged = true;
        // Auto-derive WON/LOST from terminal stages unless caller overrides.
        if (input.status === undefined) {
          if (stage.isWon) {
            data.status = DealStatus.WON;
            data.closedAt = new Date();
          } else if (stage.isLost) {
            data.status = DealStatus.LOST;
            data.closedAt = new Date();
          } else if (existing.closedAt) {
            // Reopened from a terminal stage.
            data.status = DealStatus.OPEN;
            data.closedAt = null;
          }
        }
      }

      if (input.status !== undefined) {
        data.status = input.status;
        if (
          input.status === DealStatus.WON ||
          input.status === DealStatus.LOST
        ) {
          data.closedAt = data.closedAt ?? new Date();
        } else {
          data.closedAt = null;
        }
      }

      const updated = await tx.deal.update({
        where: { id: dealId },
        data,
      });

      if (stageChanged) {
        await tx.activity.create({
          data: {
            organizationId: orgId,
            dealId,
            leadId: updated.leadId,
            userId,
            kind: ActivityKind.STAGE_CHANGE,
            summary: "Stage changed",
            metadata: {
              fromStageId: existing.stageId,
              toStageId: updated.stageId,
            } as never,
          },
        });
      }

      const becameWon =
        existing.status !== DealStatus.WON && updated.status === DealStatus.WON;

      return { updated, becameWon };
    });

    if (!result) return null;

    // Notify on the won transition (whether or not we also create a project).
    if (result.becameWon) {
      void emitNotification({
        organizationId: orgId,
        kind: "DEAL_WON",
        title: `Deal won: ${result.updated.title}`,
        body: `${formatAmount(result.updated.amountCents, result.updated.currency)} closed.`,
        href: `/pipeline?dealId=${result.updated.id}`,
        data: { dealId: result.updated.id },
      });
    }

    // Auto-create the kickoff project the first time a deal becomes Won.
    // We do this outside the main withOrg transaction so the kickoff
    // service can manage its own RLS scope cleanly. Failures here log a
    // SYSTEM activity but do not roll back the stage change.
    if (result.becameWon && !result.updated.projectId) {
      try {
        const kick = await projectKickoffService.kickoffFromDeal(
          orgId,
          userId ?? result.updated.ownerUserId ?? "",
          {
            id: result.updated.id,
            leadId: result.updated.leadId,
            title: result.updated.title,
            projectId: result.updated.projectId,
          },
        );
        if (kick.created) {
          await withOrg(orgId, (tx) =>
            tx.activity.create({
              data: {
                organizationId: orgId,
                dealId,
                leadId: result.updated.leadId,
                userId,
                kind: ActivityKind.SYSTEM,
                summary: `Project created: ${kick.project.name}`,
                metadata: { projectId: kick.project.id } as never,
              },
            }),
          );
          // Reflect the freshly assigned projectId on the returned row.
          result.updated.projectId = kick.project.id;
          void emitNotification({
            organizationId: orgId,
            kind: "PROJECT_CREATED",
            title: `Project created: ${kick.project.name}`,
            body: "Kickoff checklist seeded with default tasks.",
            href: `/projects/${kick.project.id}`,
            data: { projectId: kick.project.id, dealId },
          });
        }
      } catch (err) {
        console.warn("[crm.updateDeal] project kickoff failed", err);
      }
    }

    return toDealListItem(result.updated);
  },

  async deleteDeal(orgId: string, dealId: string) {
    return withOrg(orgId, async (tx) => {
      const existing = await tx.deal.findFirst({
        where: { id: dealId, organizationId: orgId },
      });
      if (!existing) return false;
      await tx.deal.delete({ where: { id: dealId } });
      return true;
    });
  },

  /** Activity timeline for a deal. */
  async listActivities(
    orgId: string,
    dealId: string,
    page: number,
    pageSize: number,
  ) {
    return withOrg(orgId, async (tx) => {
      const skip = (page - 1) * pageSize;
      const [items, total] = await Promise.all([
        tx.activity.findMany({
          where: { organizationId: orgId, dealId },
          orderBy: { occurredAt: "desc" },
          skip,
          take: pageSize,
        }),
        tx.activity.count({ where: { organizationId: orgId, dealId } }),
      ]);
      return { items, page, pageSize, total };
    });
  },

  async createActivity(
    orgId: string,
    userId: string | null,
    dealId: string,
    input: CreateActivityInput,
  ) {
    return withOrg(orgId, async (tx) => {
      const deal = await tx.deal.findFirst({
        where: { id: dealId, organizationId: orgId },
      });
      if (!deal) return null;
      return tx.activity.create({
        data: {
          organizationId: orgId,
          dealId,
          leadId: deal.leadId,
          userId,
          kind: input.kind,
          summary: input.summary,
          metadata: (input.metadata ?? null) as never,
          occurredAt: input.occurredAt ?? new Date(),
        },
      });
    });
  },

  /**
   * Enqueue a `crm.generateProposal` job for the given deal. Returns the
   * BullMQ job id so callers can show a "Generating…" state until the
   * worker writes the new Proposal row. We also drop a SYSTEM activity on
   * the timeline so users see something happened immediately.
   *
   * Idempotency: jobId is `proposal:{dealId}:{timestamp}` so the same deal
   * can have multiple revisions; the worker bumps `version` per row.
   */
  async generateProposal(
    orgId: string,
    userId: string | null,
    dealId: string,
    offering?: string,
    options?: {
      tone?:
        | "professional"
        | "friendly"
        | "concise"
        | "persuasive"
        | "executive";
      priceBand?: string;
    },
  ) {
    const deal = await withOrg(orgId, (tx) =>
      tx.deal.findFirst({
        where: { id: dealId, organizationId: orgId },
        select: { id: true, leadId: true, title: true },
      }),
    );
    if (!deal) return null;

    const jobId = await enqueue(
      QueueName.CRM,
      JobName.CRM_GENERATE_PROPOSAL,
      {
        organizationId: orgId,
        dealId,
        offering,
        tone: options?.tone,
        priceBand: options?.priceBand,
        triggeredByUserId: userId ?? undefined,
      },
      { jobId: `proposal:${dealId}:${Date.now()}` },
    );

    await withOrg(orgId, (tx) =>
      tx.activity.create({
        data: {
          organizationId: orgId,
          dealId,
          leadId: deal.leadId,
          userId,
          kind: ActivityKind.SYSTEM,
          summary: "Proposal generation queued",
          metadata: {
            jobId,
            offering: offering ?? null,
            tone: options?.tone ?? null,
            priceBand: options?.priceBand ?? null,
          } as never,
        },
      }),
    );

    return { jobId };
  },

  /** Fetch one proposal with its parent deal context (org-scoped). */
  async getProposal(orgId: string, proposalId: string) {
    return withOrg(orgId, (tx) =>
      tx.proposal.findFirst({
        where: { id: proposalId, organizationId: orgId },
      }),
    );
  },

  /**
   * Update a proposal's status and/or body. Status transitions stamp the
   * matching timestamp columns and emit a SYSTEM activity on the parent
   * deal. The first time a proposal moves to SENT we mint a `shareToken`
   * so the public viewer link can resolve it without auth.
   */
  async updateProposal(
    orgId: string,
    userId: string | null,
    proposalId: string,
    input: UpdateProposalInput,
  ) {
    const result = await withOrg(orgId, async (tx) => {
      const existing = await tx.proposal.findFirst({
        where: { id: proposalId, organizationId: orgId },
      });
      if (!existing) return null;

      const data: Record<string, unknown> = {};
      const now = new Date();
      let activitySummary: string | null = null;

      if (input.bodyHtml !== undefined) {
        if (
          existing.status !== ProposalStatus.DRAFT &&
          existing.status !== ProposalStatus.READY
        ) {
          throw new Error("Cannot edit body after proposal is sent");
        }
        data.bodyHtml = input.bodyHtml;
      }

      if (input.status && input.status !== existing.status) {
        data.status = input.status;
        if (input.status === ProposalStatus.SENT) {
          data.sentAt = now;
          if (!existing.shareToken) {
            data.shareToken = randomBytes(24).toString("base64url");
          }
        } else if (input.status === ProposalStatus.ACCEPTED) {
          data.acceptedAt = now;
        } else if (input.status === ProposalStatus.DECLINED) {
          data.declinedAt = now;
        }
        activitySummary = `Proposal v${existing.version} → ${input.status}`;
      }

      const updated = await tx.proposal.update({
        where: { id: proposalId },
        data,
      });

      if (activitySummary) {
        await tx.activity.create({
          data: {
            organizationId: orgId,
            dealId: existing.dealId,
            leadId: existing.leadId,
            userId,
            kind: ActivityKind.SYSTEM,
            summary: activitySummary,
            metadata: {
              proposalId,
              fromStatus: existing.status,
              toStatus: input.status,
            } as never,
          },
        });
      }

      return updated;
    });

    if (result && input.status) {
      notifyProposalStatus(orgId, result);
    }

    return result;
  },

  /**
   * Public lookup by share token. Bypasses RLS via direct prisma client
   * because the caller is anonymous; we identify the org from the row
   * itself. Stamps `viewedAt` on first read.
   */
  async getPublicProposal(shareToken: string) {
    const proposal = await prisma.proposal.findUnique({
      where: { shareToken },
    });
    if (!proposal) return null;
    if (
      proposal.status === ProposalStatus.DRAFT ||
      proposal.status === ProposalStatus.READY
    ) {
      // Not yet sent — refuse to serve.
      return null;
    }
    if (!proposal.viewedAt) {
      await prisma.proposal.update({
        where: { id: proposal.id },
        data: {
          viewedAt: new Date(),
          status:
            proposal.status === ProposalStatus.SENT
              ? ProposalStatus.VIEWED
              : proposal.status,
        },
      });
      // First view — let the org know via notification feed/webhook.
      void emitNotification({
        organizationId: proposal.organizationId,
        kind: "PROPOSAL_VIEWED",
        title: "Proposal viewed by recipient",
        body: `Proposal v${proposal.version} was opened.`,
        href: `/pipeline?dealId=${proposal.dealId}`,
        data: { proposalId: proposal.id, dealId: proposal.dealId },
      });
    }
    const deal = await prisma.deal.findUnique({
      where: { id: proposal.dealId },
      select: { title: true, organizationId: true },
    });
    const org = deal
      ? await prisma.organization.findUnique({
          where: { id: deal.organizationId },
          select: { name: true },
        })
      : null;
    return {
      id: proposal.id,
      version: proposal.version,
      status: proposal.status,
      bodyHtml: proposal.bodyHtml,
      dealTitle: deal?.title ?? "Proposal",
      organizationName: org?.name ?? "",
      sentAt: proposal.sentAt?.toISOString() ?? null,
      createdAt: proposal.createdAt.toISOString(),
    };
  },
};

// -------- helpers ------------------------------------------------------------

function formatAmount(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(0)}`;
  }
}

/**
 * Map proposal status transitions to user-facing notifications.
 * Called after the updateProposal tx commits with the freshly persisted row.
 */
function notifyProposalStatus(
  orgId: string,
  proposal: {
    id: string;
    dealId: string;
    version: number;
    status: string;
  },
): void {
  const map: Record<string, { title: string; kind: CrmKind } | undefined> = {
    SENT: {
      kind: "PROPOSAL_SENT",
      title: `Proposal v${proposal.version} sent`,
    },
    ACCEPTED: {
      kind: "PROPOSAL_ACCEPTED",
      title: `Proposal v${proposal.version} accepted 🎉`,
    },
    DECLINED: {
      kind: "PROPOSAL_DECLINED",
      title: `Proposal v${proposal.version} declined`,
    },
  };
  const entry = map[proposal.status];
  if (!entry) return;
  void emitNotification({
    organizationId: orgId,
    kind: entry.kind,
    title: entry.title,
    body: `Open the deal to review.`,
    href: `/pipeline?dealId=${proposal.dealId}`,
    data: { proposalId: proposal.id, dealId: proposal.dealId },
  });
}

type CrmKind =
  | "PROPOSAL_SENT"
  | "PROPOSAL_VIEWED"
  | "PROPOSAL_ACCEPTED"
  | "PROPOSAL_DECLINED";

function parseSort(sort: DealFilter["sort"]): { [k: string]: "asc" | "desc" } {
  const desc = sort.startsWith("-");
  const field = desc ? sort.slice(1) : sort;
  return { [field]: desc ? "desc" : "asc" };
}

function toDealListItem(d: {
  id: string;
  pipelineId: string;
  stageId: string;
  leadId: string | null;
  projectId?: string | null;
  title: string;
  amountCents: number;
  currency: string;
  status: DealStatus;
  ownerUserId: string | null;
  expectedCloseAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: d.id,
    pipelineId: d.pipelineId,
    stageId: d.stageId,
    leadId: d.leadId,
    projectId: d.projectId ?? null,
    title: d.title,
    amountCents: d.amountCents,
    currency: d.currency,
    status: d.status,
    ownerUserId: d.ownerUserId,
    expectedCloseAt: d.expectedCloseAt?.toISOString() ?? null,
    closedAt: d.closedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}
