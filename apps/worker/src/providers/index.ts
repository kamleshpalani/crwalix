import {
  registerSearchProvider,
  getSearchProvider,
  googlePlacesProvider,
  yelpFusionProvider,
  osmOverpassProvider,
  type SearchProvider
} from '@crawlix/providers';

let bootstrapped = false;
function bootstrap(): void {
  if (bootstrapped) return;
  registerSearchProvider(googlePlacesProvider);
  registerSearchProvider(yelpFusionProvider);
  registerSearchProvider(osmOverpassProvider);
  bootstrapped = true;
}

export function resolveSearchProvider(id: string): SearchProvider {
  bootstrap();
  const p = getSearchProvider(id);
  if (!p) throw new Error(`No search provider registered for id=${id}`);
  return p;
}
