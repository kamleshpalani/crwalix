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

export const yelpAdapter: Adapter<z.infer<typeof Input>, { businesses: YelpBusiness[] }> = {
  name: 'yelp',
  description: 'Search Yelp for businesses. NOTE: selectors may need updates when Yelp changes markup.',
  inputSchema: Input,

  async run(input, { page, signal, onProgress }) {
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
