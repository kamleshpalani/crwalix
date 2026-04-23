import type { SearchProvider, EnrichmentProvider } from './types.js';

const searchProviders = new Map<string, SearchProvider>();
const enrichmentProviders = new Map<string, EnrichmentProvider>();

export function registerSearchProvider(p: SearchProvider): void {
  searchProviders.set(p.id, p);
}
export function registerEnrichmentProvider(p: EnrichmentProvider): void {
  enrichmentProviders.set(p.id, p);
}

export function getSearchProvider(id: string): SearchProvider | undefined {
  return searchProviders.get(id);
}
export function getEnrichmentProvider(id: string): EnrichmentProvider | undefined {
  return enrichmentProviders.get(id);
}

export function listSearchProviders(): SearchProvider[] {
  return Array.from(searchProviders.values());
}
export function listEnrichmentProviders(): EnrichmentProvider[] {
  return Array.from(enrichmentProviders.values());
}
