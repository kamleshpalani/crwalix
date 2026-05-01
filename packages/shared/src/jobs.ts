import type { EnrichmentKind, ExportFormat, LeadFocus } from "./enums";
import type { LeadFilter } from "./dtos";

/** Job name constants — also used as BullMQ job names. */
export const JobName = {
  SEARCH_INGEST: "search.ingest",
  ENRICH_WEBSITE: "enrich.website",
  ENRICH_EMAIL: "enrich.email",
  ENRICH_EMAIL_VERIFY: "enrich.emailVerify",
  ENRICH_SOCIAL: "enrich.social",
  ENRICH_COMPANY: "enrich.company",
  ENRICH_CONTACT: "enrich.contact",
  /** §8.1 — AI-generated business description. */
  ENRICH_BUSINESS_DESCRIPTION: "enrich.businessDescription",
  /** §8.1 — AI-generated review summary. */
  ENRICH_REVIEW_SUMMARY: "enrich.reviewSummary",
  /** §9.3 — AI-generated full website audit report. */
  ENRICH_WEBSITE_REPORT: "enrich.websiteReport",
  SCORE_LEAD: "score.lead",
  SCORE_BULK: "score.bulk",
  AI_SUMMARIZE: "ai.summarize",
  AI_OUTREACH: "ai.outreach",
  AI_CLASSIFY: "ai.classify",
  EXPORT_BUILD: "export.build",
  INTEL_BUILD: "intel.build",
  USAGE_ROLLUP: "system.usageRollup",
  PROVIDER_HEALTH: "system.providerHealth",
  LEAD_PURGE: "system.leadPurge",
  CRM_GENERATE_PROPOSAL: "crm.generateProposal",
  OUTREACH_SEND: "outreach.send",
  OUTREACH_SEQUENCE_TICK: "outreach.sequenceTick",
  OUTREACH_CLASSIFY_REPLY: "outreach.classifyReply",
  DSAR_PROCESS: "system.dsarProcess",
  /** Vibe Prospecting — Claude full lead analysis + outreach generation. */
  VIBE_PROSPECT: "vibe.prospect",
  VIBE_PROSPECT_BULK: "vibe.prospectBulk",
} as const;
export type JobName = (typeof JobName)[keyof typeof JobName];

export const QueueName = {
  SEARCH: "search",
  ENRICHMENT: "enrichment",
  SCORING: "scoring",
  AI: "ai",
  EXPORT: "export",
  SYSTEM: "system",
  CRM: "crm",
  OUTREACH: "outreach",
  VIBE: "vibe",
  DOMAIN_EVENTS: "domain-events",
} as const;
export type QueueName = (typeof QueueName)[keyof typeof QueueName];

/** Job payloads — the contract between API producers and workers. */

export interface SearchIngestJob {
  organizationId: string;
  searchRunId: string;
  provider: "google_places" | "foursquare" | "yelp_fusion" | "osm";
  query: {
    niche?: string;
    keyword?: string;
    country?: string;
    state?: string;
    city?: string;
    postalCode?: string;
    lat?: number;
    lng?: number;
    radiusMeters?: number;
    limit: number;
  };
  options: {
    enrichOnInsert: boolean;
    scoreOnInsert: boolean;
    /** Lead-focus filter; worker drops non-matching leads before insert. */
    leadFocus?: LeadFocus;
    /** When true, the worker emits a LEADS_DISCOVERED notification if any
     *  newly-inserted leads land. Set by the recurring-search scheduler. */
    notifyOnNewLeads?: boolean;
  };
}

export interface EnrichmentJob {
  organizationId: string;
  enrichmentId: string;
  leadId: string;
  kind: EnrichmentKind;
  provider: string;
}

export interface ScoreLeadJob {
  organizationId: string;
  leadId: string;
  rulesetVersion: string;
}

export interface ScoreBulkJob {
  organizationId: string;
  leadIds: string[];
  rulesetVersion: string;
}

export interface AiTaskJob {
  organizationId: string;
  kind: "summary" | "outreach" | "classify" | "niche_cluster" | "website_gap";
  leadId?: string;
  leadIds?: string[];
  provider: "openai" | "anthropic";
  model: string;
}

export interface ExportBuildJob {
  organizationId: string;
  exportJobId: string;
  format: ExportFormat;
  source:
    | { kind: "list"; listId: string }
    | { kind: "project"; projectId: string }
    | { kind: "search"; searchId: string }
    | { kind: "filter"; filter: LeadFilter };
  options: { googleSheetId?: string; includeRawPayload?: boolean };
}

export interface IntelBuildJob {
  organizationId: string;
  reportId: string;
  /** When true, also fetch competitors via Google Places searchNearby. */
  autoDetectCompetitors: boolean;
  /** Max competitors to audit (manual + auto, capped). */
  maxCompetitors: number;
}

/** Discriminated union for type-safe dispatch in the worker. */
export type AnyJob =
  | ({ name: typeof JobName.SEARCH_INGEST } & SearchIngestJob)
  | ({ name: typeof JobName.ENRICH_WEBSITE } & EnrichmentJob)
  | ({ name: typeof JobName.ENRICH_EMAIL } & EnrichmentJob)
  | ({ name: typeof JobName.ENRICH_EMAIL_VERIFY } & EnrichmentJob)
  | ({ name: typeof JobName.ENRICH_SOCIAL } & EnrichmentJob)
  | ({ name: typeof JobName.ENRICH_COMPANY } & EnrichmentJob)
  | ({ name: typeof JobName.ENRICH_CONTACT } & EnrichmentJob)
  | ({ name: typeof JobName.ENRICH_BUSINESS_DESCRIPTION } & EnrichmentJob)
  | ({ name: typeof JobName.ENRICH_REVIEW_SUMMARY } & EnrichmentJob)
  | ({ name: typeof JobName.ENRICH_WEBSITE_REPORT } & EnrichmentJob)
  | ({ name: typeof JobName.SCORE_LEAD } & ScoreLeadJob)
  | ({ name: typeof JobName.SCORE_BULK } & ScoreBulkJob)
  | ({
      name:
        | typeof JobName.AI_SUMMARIZE
        | typeof JobName.AI_OUTREACH
        | typeof JobName.AI_CLASSIFY;
    } & AiTaskJob)
  | ({ name: typeof JobName.EXPORT_BUILD } & ExportBuildJob)
  | ({ name: typeof JobName.INTEL_BUILD } & IntelBuildJob);

export type ProposalTone =
  | "professional"
  | "friendly"
  | "concise"
  | "persuasive"
  | "executive";

export interface GenerateProposalJob {
  organizationId: string;
  dealId: string;
  /** Optional override for the offering pitched in the proposal. */
  offering?: string;
  /** Voice / register the AI should adopt. Defaults to "professional". */
  tone?: ProposalTone;
  /** Optional pricing band shown verbatim, e.g. "$3,000–$4,500". */
  priceBand?: string;
  /** Userid that triggered the generation; recorded on the Proposal row. */ triggeredByUserId?: string;
}

/** Vibe Prospecting — single lead full analysis by Claude. */
export interface VibeProspectJob {
  organizationId: string;
  leadId: string;
  /** Optional agency name used in generated outreach messages. */
  agencyName?: string | null;
  /** User who triggered the analysis; used for audit trail. */
  triggeredByUserId?: string | null;
}

/** Vibe Prospecting — bulk analysis for multiple leads. */
export interface VibeProspectBulkJob {
  organizationId: string;
  leadIds: string[];
  agencyName?: string | null;
  triggeredByUserId?: string;
}

/**
 * Single outbound email send. Either `messageId` (replay an existing
 * OutreachMessage row) or a fresh `payload` block (compose + persist on
 * dispatch). Ad-hoc one-off sends use `payload`; sequence ticks use it too,
 * passing the resolved step content.
 */
export interface OutreachSendJob {
  organizationId: string;
  /** Recipient email — required for both modes. */
  toEmail: string;
  /** Optional CRM joins, persisted on the OutreachMessage row. */
  leadId?: string;
  dealId?: string;
  /** Set when the send originated from a SequenceRun step. */
  sequenceRunId?: string;
  /** Pre-resolved subject + body (after template rendering). */
  subject: string;
  body: string;
  bodyIsHtml?: boolean;
  /** Optional From override; otherwise OutreachSettings.senderEmail wins. */
  fromEmail?: string;
  replyToEmail?: string;
  /** Variable bag for last-mile template substitution. */
  vars?: Record<string, unknown>;
}

/**
 * Advances a SequenceRun by one step. Idempotent: the worker re-reads the
 * row, picks the step at `currentStepIndex`, dispatches an OUTREACH_SEND
 * job, increments the index, and either schedules the next tick or marks
 * the run COMPLETED.
 */
export interface OutreachSequenceTickJob {
  organizationId: string;
  sequenceRunId: string;
}

/**
 * Classify the body of an inbound reply (interested / not / OOO / question)
 * via the AI router and stamp the result onto `InboundMessage`. The worker
 * also auto-advances the linked Deal stage based on the verdict.
 */
export interface OutreachClassifyReplyJob {
  organizationId: string;
  inboundMessageId: string;
}

/**
 * Process a DSAR (Data Subject Access Request) — either export or erase.
 * The worker picks up the DsarRequest row, runs the appropriate operation,
 * and stamps the result back onto the row.
 */
export interface DsarProcessJob {
  dsarRequestId: string;
  orgId: string;
  userId: string;
  type: "EXPORT" | "ERASE";
}

// ---------------------------------------------------------------------------
// §6 Domain events — emitted onto the `domain-events` BullMQ queue so
// independent consumers (scoring, enrichment, outreach, reporting) can react
// without tight coupling to the producer.
// ---------------------------------------------------------------------------

export const DomainEventName = {
  LEAD_DISCOVERED: "LeadDiscovered",
  LEAD_QUALIFIED: "LeadQualified",
  PROPOSAL_READY: "ProposalReady",
  MESSAGE_SENT: "MessageSent",
  MESSAGE_RECEIVED: "MessageReceived",
  DEAL_STAGE_CHANGED: "DealStageChanged",
  DEAL_WON: "DealWon",
  INVOICE_PAID: "InvoicePaid",
  SUBSCRIPTION_CANCELED: "SubscriptionCanceled",
  TICKET_OPENED: "TicketOpened",
  BUDGET_EXCEEDED: "BudgetExceeded",
} as const;
export type DomainEventName =
  (typeof DomainEventName)[keyof typeof DomainEventName];

// Shared envelope all domain events carry.
export interface DomainEventEnvelope<T = unknown> {
  eventName: DomainEventName;
  organizationId: string;
  occurredAt: string; // ISO-8601
  payload: T;
}

// Per-event payloads
export interface LeadDiscoveredPayload {
  leadId: string;
  searchRunId: string;
}

export interface LeadQualifiedPayload {
  leadId: string;
  score: number;
  tier: string;
}

export interface ProposalReadyPayload {
  proposalId: string;
  dealId: string;
}

export interface MessageSentPayload {
  outreachMessageId: string;
  toEmail: string;
  leadId?: string;
  dealId?: string;
  sequenceRunId?: string;
}

export interface MessageReceivedPayload {
  inboundMessageId: string;
  fromEmail: string;
  leadId?: string;
  dealId?: string;
}

export interface DealStageChangedPayload {
  dealId: string;
  fromStageId: string | null;
  toStageId: string;
  status: "OPEN" | "WON" | "LOST";
}

export interface DealWonPayload {
  dealId: string;
  value: number | null;
}

export interface InvoicePaidPayload {
  invoiceId: string;
  amountCents: number;
}

export interface SubscriptionCanceledPayload {
  subscriptionId: string;
  canceledAt: string;
}

export interface TicketOpenedPayload {
  ticketId: string;
  subject: string;
}

export interface BudgetExceededPayload {
  kind: "ai" | "email" | "enrichment";
  usedCents: number;
  limitCents: number;
}

/** Discriminated union of all domain event envelopes. */
export type AnyDomainEvent =
  | (DomainEventEnvelope<LeadDiscoveredPayload> & {
      eventName: "LeadDiscovered";
    })
  | (DomainEventEnvelope<LeadQualifiedPayload> & { eventName: "LeadQualified" })
  | (DomainEventEnvelope<ProposalReadyPayload> & { eventName: "ProposalReady" })
  | (DomainEventEnvelope<MessageSentPayload> & { eventName: "MessageSent" })
  | (DomainEventEnvelope<MessageReceivedPayload> & {
      eventName: "MessageReceived";
    })
  | (DomainEventEnvelope<DealStageChangedPayload> & {
      eventName: "DealStageChanged";
    })
  | (DomainEventEnvelope<DealWonPayload> & { eventName: "DealWon" })
  | (DomainEventEnvelope<InvoicePaidPayload> & { eventName: "InvoicePaid" })
  | (DomainEventEnvelope<SubscriptionCanceledPayload> & {
      eventName: "SubscriptionCanceled";
    })
  | (DomainEventEnvelope<TicketOpenedPayload> & { eventName: "TicketOpened" })
  | (DomainEventEnvelope<BudgetExceededPayload> & {
      eventName: "BudgetExceeded";
    });
