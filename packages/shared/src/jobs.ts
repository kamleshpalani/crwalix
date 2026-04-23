import type { EnrichmentKind, ExportFormat } from './enums';
import type { LeadFilter } from './dtos';

/** Job name constants — also used as BullMQ job names. */
export const JobName = {
  SEARCH_INGEST: 'search.ingest',
  ENRICH_WEBSITE: 'enrich.website',
  ENRICH_EMAIL: 'enrich.email',
  ENRICH_EMAIL_VERIFY: 'enrich.emailVerify',
  ENRICH_SOCIAL: 'enrich.social',
  ENRICH_COMPANY: 'enrich.company',
  ENRICH_CONTACT: 'enrich.contact',
  SCORE_LEAD: 'score.lead',
  SCORE_BULK: 'score.bulk',
  AI_SUMMARIZE: 'ai.summarize',
  AI_OUTREACH: 'ai.outreach',
  AI_CLASSIFY: 'ai.classify',
  EXPORT_BUILD: 'export.build',
  USAGE_ROLLUP: 'system.usageRollup',
  PROVIDER_HEALTH: 'system.providerHealth',
  LEAD_PURGE: 'system.leadPurge',
} as const;
export type JobName = (typeof JobName)[keyof typeof JobName];

export const QueueName = {
  SEARCH: 'search',
  ENRICHMENT: 'enrichment',
  SCORING: 'scoring',
  AI: 'ai',
  EXPORT: 'export',
  SYSTEM: 'system',
} as const;
export type QueueName = (typeof QueueName)[keyof typeof QueueName];

/** Job payloads — the contract between API producers and workers. */

export interface SearchIngestJob {
  organizationId: string;
  searchRunId: string;
  provider: 'google_places' | 'foursquare' | 'yelp_fusion' | 'osm';
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
  options: { enrichOnInsert: boolean; scoreOnInsert: boolean };
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
  kind: 'summary' | 'outreach' | 'classify' | 'niche_cluster' | 'website_gap';
  leadId?: string;
  leadIds?: string[];
  provider: 'openai' | 'anthropic';
  model: string;
}

export interface ExportBuildJob {
  organizationId: string;
  exportJobId: string;
  format: ExportFormat;
  source:
    | { kind: 'list'; listId: string }
    | { kind: 'project'; projectId: string }
    | { kind: 'search'; searchId: string }
    | { kind: 'filter'; filter: LeadFilter };
  options: { googleSheetId?: string; includeRawPayload?: boolean };
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
  | ({ name: typeof JobName.EXPORT_BUILD } & ExportBuildJob);
