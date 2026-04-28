import { z } from 'zod';
import type { Adapter } from '../types.js';
import { cleanText } from '../utils/text.js';

const Input = z.object({
  query: z.string().min(1),
  location: z.string().optional(),
  limit: z.number().int().positive().max(100).default(20),
});

export interface YelpBusiness {
  name: string;
  url?: string;
  rating?: number;
  reviews?: number;
  categories?: string[];
  priceRange?: string;
  address?: string;
}

/**
 * ⚠️ DEPRECATED — DO NOT USE IN PRODUCTION.
 *
 * This adapter scrapes yelp.com via a headless browser, which violates the
 * Yelp Fusion Terms of Use. It is kept as historical reference. The
 * supported, compliant path is the `yelpProvider` in
 * `packages/providers/src/leadProviders/` which uses the official Yelp
 * Fusion API.
 *
 * Calling `run()` will throw at runtime to prevent accidental use.
 */
export const yelpAdapter: Adapter<z.infer<typeof Input>, { businesses: YelpBusiness[] }> = {
  name: 'yelp',
  description: 'DEPRECATED: legacy browser-scrape adapter. Use the official Yelp Fusion API provider instead.',
  inputSchema: Input,

  async run(input, { page, signal, onProgress }) {
    if (process.env.CRAWLIX_ALLOW_LEGACY_SCRAPERS !== '1') {
      throw new Error(
        'yelp scraper is disabled for ToS compliance. Use the Yelp Fusion API provider instead.'
      );
    }
    if (signal.aborted) throw new Error('Canceled');
    const url = `https://www.yelp.com/search?find_desc=${encodeURIComponent(input.query)}${
      input.location ? `&find_loc=${encodeURIComponent(input.location)}` : ''
    }`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('[data-testid="serp-ia-card"], li div h3 a', { timeout: 15_000 }).catch(() => undefined);

    const businesses = await page.$$eval(
      '[data-testid="serp-ia-card"], li div h3 a',
      (nodes) =>
        nodes.map((n) => {
          const root = n.closest('[data-testid="serp-ia-card"]') ?? n.closest('li') ?? n;
          const link = root.querySelector('h3 a') as HTMLAnchorElement | null;
          const ratingEl = root.querySelector('[aria-label*="rating"], [role="img"][aria-label*="star"]');
          const reviewsEl = root.querySelector('span[class*="reviewCount"], a[href*="reviews"]');
          const text = (root as HTMLElement).innerText ?? '';
          const priceMatch = text.match(/\$+/);
          return {
            name: link?.textContent?.trim() ?? '',
            url: link?.href ?? '',
            rating: ratingEl?.getAttribute('aria-label')?.match(/([\d.]+)/)?.[1],
            reviews: reviewsEl?.textContent?.match(/\d+/)?.[0],
            priceRange: priceMatch?.[0],
            rawText: text,
          };
        })
    );

    const seen = new Set<string>();
    const results: YelpBusiness[] = [];
    for (const b of businesses) {
      if (!b.name || !b.url || seen.has(b.url)) continue;
      seen.add(b.url);
      results.push({
        name: cleanText(b.name),
        url: b.url,
        rating: b.rating ? Number(b.rating) : undefined,
        reviews: b.reviews ? Number(b.reviews) : undefined,
        priceRange: b.priceRange,
      });
      if (results.length >= input.limit) break;
    }

    onProgress({ itemsCollected: results.length, progress: 1 });
    return { businesses: results };
  },
};
