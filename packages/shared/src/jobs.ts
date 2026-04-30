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
  /** Userid that triggered the generation; recorded on the Proposal row. */
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
