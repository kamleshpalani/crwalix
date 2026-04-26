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
}

export interface SearchPage {
  leads: NormalizedLead[];
  /** Opaque cursor the worker passes back to fetch the next page. */
  nextCursor?: string;
  /** Provider-reported total, when available. */
  total?: number;
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
