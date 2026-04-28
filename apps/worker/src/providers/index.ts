import {
  registerSearchProvider,
  getSearchProvider,
  ALL_LEAD_PROVIDERS,
  type SearchProvider
} from '@crawlix/providers';

let bootstrapped = false;
function bootstrap(): void {
  if (bootstrapped) return;
  for (const p of ALL_LEAD_PROVIDERS) {
    registerSearchProvider(p);
  }
  bootstrapped = true;
}

export function resolveSearchProvider(id: string): SearchProvider {
  bootstrap();
  const p = getSearchProvider(id);
  if (!p) throw new Error(`No search provider registered for id=${id}`);
  return p;
}
