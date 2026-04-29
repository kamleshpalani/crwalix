/**
 * Milestone service (Phase 3.1 + 3.4).
 *
 * Manages billable project milestones. Key behavior: when a milestone is
 * marked COMPLETED with `autoInvoice=true` AND `amountCents > 0`, we
 * automatically create a Stripe invoice via @crawlix/billing and link the
 * resulting Invoice row back via `Milestone.invoiceId` (idempotency).
 *
 * Manual invoices (autoInvoice=false) can still be created via the
 * standard /api/v1/billing/invoices endpoint.
 */

import { prisma, withOrg } from "@crawlix/db";
import {
  createInvoice,
  addInvoiceLineItem,
  finalizeInvoice,
} from "@crawlix/billing";

export interface CreateMilestoneInput {
  projectId: string;
  title: string;
  description?: string;
  amountCents?: number;
  currency?: string;
  autoInvoice?: boolean;
  dueAt?: Date | null;
  position?: number;
}

export interface UpdateMilestoneInput {
  title?: string;
  description?: string | null;
  amountCents?: number;
  currency?: string;
  autoInvoice?: boolean;
  dueAt?: Date | null;
  position?: number;
  status?: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
}

export const milestoneService = {
  async list(orgId: string, projectId: string) {
    return withOrg(orgId, (tx) =>
      tx.milestone.findMany({
        where: { organizationId: orgId, projectId },
        orderBy: { position: "asc" },
      }),
    );
  },

  async create(orgId: string, input: CreateMilestoneInput) {
    return withOrg(orgId, async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: input.projectId, organizationId: orgId },
        select: { id: true },
      });
      if (!project) return null;

      let position = input.position;
      if (position === undefined) {
        const last = await tx.milestone.findFirst({
          where: { organizationId: orgId, projectId: input.projectId },
          orderBy: { position: "desc" },
          select: { position: true },
        });
        position = (last?.position ?? -1) + 1;
      }

      return tx.milestone.create({
        data: {
          organizationId: orgId,
          projectId: input.projectId,
          title: input.title,
          description: input.description ?? null,
          amountCents: input.amountCents ?? 0,
          currency: input.currency ?? "USD",
          autoInvoice: input.autoInvoice ?? false,
          dueAt: input.dueAt ?? null,
          position,
          status: "PENDING",
        },
      });
    });
  },

  /**
   * Update a milestone. If `status` transitions to COMPLETED and the
   * milestone is billable (autoInvoice=true, amountCents>0), trigger
   * auto-invoice creation. Idempotent — if `invoiceId` is already set,
   * we skip the Stripe call.
   */
  async update(
    orgId: string,
    milestoneId: string,
    input: UpdateMilestoneInput,
  ) {
    const milestone = await withOrg(orgId, async (tx) => {
      const existing = await tx.milestone.findFirst({
        where: { id: milestoneId, organizationId: orgId },
      });
      if (!existing) return null;

      const wasCompleted = existing.status === "COMPLETED";
      const willBeCompleted = input.status === "COMPLETED";
      const justCompleting = !wasCompleted && willBeCompleted;

      const updated = await tx.milestone.update({
        where: { id: milestoneId },
        data: {
          title: input.title,
          description: input.description,
          amountCents: input.amountCents,
          currency: input.currency,
          autoInvoice: input.autoInvoice,
          dueAt: input.dueAt,
          position: input.position,
          status: input.status,
          completedAt: justCompleting ? new Date() : undefined,
        },
      });

      return { milestone: updated, justCompleting };
    });

    if (!milestone) return null;

    // Phase 3.4: auto-invoice on completion (outside the transaction so
    // a Stripe failure doesn't roll back the status update).
    if (
      milestone.justCompleting &&
      milestone.milestone.autoInvoice &&
      milestone.milestone.amountCents > 0 &&
      !milestone.milestone.invoiceId
    ) {
      await this.autoInvoiceMilestone(orgId, milestone.milestone.id).catch(
        (err) => {
          console.error(
            `[milestone] auto-invoice failed for ${milestone.milestone.id}`,
            err,
          );
        },
      );
    }

    return milestone.milestone;
  },

  async remove(orgId: string, milestoneId: string) {
    return withOrg(orgId, (tx) =>
      tx.milestone.deleteMany({
        where: { id: milestoneId, organizationId: orgId },
      }),
    );
  },

  /**
   * Auto-create a Stripe invoice for a completed billable milestone.
   * Idempotent via Milestone.invoiceId UNIQUE.
   */
  async autoInvoiceMilestone(orgId: string, milestoneId: string) {
    const milestone = await prisma.milestone.findFirst({
      where: { id: milestoneId, organizationId: orgId },
      include: { project: { select: { id: true, dealId: true, name: true } } },
    });
    if (!milestone || milestone.invoiceId) return null;
    if (!milestone.autoInvoice || milestone.amountCents <= 0) return null;

    // Look up the org's Stripe customer.
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { stripeCustomerId: true },
    });
    if (!org?.stripeCustomerId) {
      throw new Error(
        `Organization ${orgId} has no stripeCustomerId; cannot auto-invoice`,
      );
    }

    // Create the Stripe invoice + line item.
    const stripeInv = await createInvoice({
      customerId: org.stripeCustomerId,
      description: `${milestone.project.name} — ${milestone.title}`,
      autoAdvance: true,
      metadata: {
        organizationId: orgId,
        milestoneId: milestone.id,
        projectId: milestone.project.id,
      },
    });
    if (!stripeInv.id)
      throw new Error("Stripe invoice creation returned no id");

    await addInvoiceLineItem(stripeInv.id, org.stripeCustomerId, {
      description: milestone.title,
      quantity: 1,
      unitAmountCents: milestone.amountCents,
    });

    const finalized = await finalizeInvoice(stripeInv.id);

    // Persist locally.
    const localInv = await withOrg(orgId, (tx) =>
      tx.invoice.create({
        data: {
          organizationId: orgId,
          projectId: milestone.project.id,
          dealId: milestone.project.dealId,
          stripeInvoiceId: finalized.id,
          status: "OPEN",
          currency: (finalized.currency ?? milestone.currency).toUpperCase(),
          subtotalCents: finalized.subtotal ?? milestone.amountCents,
          taxCents: finalized.tax ?? 0,
          totalCents: finalized.total ?? milestone.amountCents,
          amountPaidCents: 0,
          amountDueCents: finalized.amount_due ?? milestone.amountCents,
          number: finalized.number,
          hostedUrl: finalized.hosted_invoice_url,
          pdfUrl: finalized.invoice_pdf,
          dueAt: finalized.due_date
            ? new Date(finalized.due_date * 1000)
            : null,
          metadata: {
            source: "milestone",
            milestoneId: milestone.id,
          } as never,
        },
      }),
    );

    // Link milestone → invoice.
    await prisma.milestone.update({
      where: { id: milestoneId },
      data: { invoiceId: localInv.id },
    });

    return localInv;
  },
};
