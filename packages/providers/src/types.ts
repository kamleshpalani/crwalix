import type { NormalizedLead } from '@crawlix/shared';

export interface ProviderContext {
  /** Per-request logger scoped to organizationId + provider. */
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
  /** Abort signal forwarded from the worker for graceful cancel. */
  signal: AbortSignal;
  /** Opaque credentials resolved from env or ProviderConfig. */
  credentials: Record<string, string>;
  /** Called by the adapter for every unit of paid work; worker enforces budgets. */
  meter: (units: number) => Promise<void>;
}

export interface SearchQuery {
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
  /**
   * Optional ranking hint for providers that support multiple sort orders.
   * The worker rotates this per `SearchRun` (derived from `searchRunId`) so
   * back-to-back re-runs surface different leads instead of returning the
   * same top-N every time. Adapters interpret it as their native equivalent
   * (Google Places `rankPreference`, Yelp `sort_by`, etc.) and ignore it
   * when not applicable.
   */
  rankPreference?: 'relevance' | 'distance' | 'rating' | 'review_count';
}

export interface SearchPage {
  leads: NormalizedLead[];
  /** Opaque cursor the worker passes back to fetch the next page. */
  nextCursor?: string;
  /** Provider-reported total, when available. */
  total?: number;
  /**
   * Optional non-fatal warning (e.g. "region not supported"). The worker
   * stores this on `SearchRun.metadata` so the UI can show a clear reason
   * for empty result sets instead of a silent 0.
   */
  warning?: string;
}

/** A search provider — the primary discovery adapter. */
export interface SearchProvider {
  readonly id: string;
  readonly displayName: string;
  /** Advertised capabilities used by the UI / API to validate inputs. */
  readonly capabilities: {
    keyword: boolean;
    niche: boolean;
    geoBBox: boolean;
    geoRadius: boolean;
    postalCode: boolean;
    maxPageSize: number;
  };
  search(query: SearchQuery, ctx: ProviderContext, cursor?: string): Promise<SearchPage>;
}

/** Enrichment providers operate on a single lead at a time. */
export interface EnrichmentProvider<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly kind: import('@crawlix/shared').EnrichmentKind;
  run(input: TInput, ctx: ProviderContext): Promise<{
    raw: unknown;
    normalized: TOutput;
    costUnits: number;
  }>;
}
