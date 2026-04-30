/**
 * Canonical notification kinds emitted by the web tier.
 *
 * Stored as plain strings on `Notification.kind` (no Prisma enum, so adding
 * a new kind is migration-free). The worker has its own narrower set in
 * `apps/worker/src/lib/notify.ts`; the union below covers the full system.
 *
 * Convention: `<domain>.<event>` lowercase dot-separated.
 */

export const NotificationKind = {
  // Lead / search
  LEADS_DISCOVERED: "leads.discovered",
  SEARCH_FAILED: "search.failed",
  LEAD_HIGH_PRIORITY: "lead.high_priority",
  LEAD_REPLIED: "lead.replied",
  ENRICHMENT_COMPLETE: "enrichment.complete",

  // CRM / outreach
  CAMPAIGN_SENT: "campaign.sent",
  CAMPAIGN_PAUSED: "campaign.paused",

  // Proposal
  PROPOSAL_VIEWED: "proposal.viewed",
  PROPOSAL_ACCEPTED: "proposal.accepted",
  PROPOSAL_DECLINED: "proposal.declined",

  // Contract
  CONTRACT_SIGNED: "contract.signed",

  // Invoice / billing
  INVOICE_SENT: "invoice.sent",
  INVOICE_VIEWED: "invoice.viewed",
  PAYMENT_RECEIVED: "payment.received",
  PAYMENT_FAILED: "payment.failed",
  INVOICE_OVERDUE: "invoice.overdue",

  // Subscription
  SUBSCRIPTION_RENEWED: "subscription.renewed",
  SUBSCRIPTION_CANCELED: "subscription.canceled",
  SUBSCRIPTION_PAUSED: "subscription.paused",

  // Project
  MILESTONE_COMPLETED: "milestone.completed",
  PROJECT_CREATED: "project.created",

  // Support
  TICKET_CREATED: "ticket.created",
  TICKET_REPLIED: "ticket.replied",

  // Quote
  QUOTE_ACCEPTED: "quote.accepted",
  QUOTE_DECLINED: "quote.declined",
} as const;

export type NotificationKindValue =
  (typeof NotificationKind)[keyof typeof NotificationKind];
