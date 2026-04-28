import { z } from 'zod';
import type { Adapter } from '../types.js';
import { cleanText } from '../utils/text.js';

const Input = z.object({
  query: z.string().min(1, 'query is required'),
  location: z.string().optional(),
  limit: z.number().int().positive().max(200).default(20),
  language: z.string().default('en'),
});

export interface GoogleMapsPlace {
  name: string;
  rating?: number;
  reviews?: number;
  category?: string;
  address?: string;
  phone?: string;
  website?: string;
  url?: string;
}

/**
 * ⚠️ DEPRECATED — DO NOT USE IN PRODUCTION.
 *
 * This adapter scrapes google.com/maps via a headless browser, which
 * violates the Google Maps Platform Terms of Service. It is kept only as
 * historical reference and is wired through the legacy `apps/backend`
 * surface (NOT deployed). The supported, compliant path is the
 * `googlePlacesProvider` in `packages/providers/src/leadProviders/` which
 * uses the official Places API.
 *
 * Calling `run()` will throw at runtime to prevent accidental use.
 */
export const googleMapsAdapter: Adapter<z.infer<typeof Input>, { places: GoogleMapsPlace[] }> = {
  name: 'google-maps',
  description: 'DEPRECATED: legacy browser-scrape adapter. Use the official Google Places API provider instead.',
  inputSchema: Input,

  async run(input, { page, logger, signal, onProgress }) {
    if (process.env.CRAWLIX_ALLOW_LEGACY_SCRAPERS !== '1') {
      throw new Error(
        'google-maps scraper is disabled for ToS compliance. Use the Google Places API provider instead.'
      );
    }
    logger.warn('Running deprecated google-maps browser scraper (CRAWLIX_ALLOW_LEGACY_SCRAPERS=1).');
    const q = input.location ? `${input.query} ${input.location}` : input.query;
    const url = `https://www.google.com/maps/search/${encodeURIComponent(q)}?hl=${encodeURIComponent(
      input.language
    )}`;

    logger.info({ url }, 'Opening Google Maps');
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Accept consent if it appears.
    const consent = page.locator('button:has-text("Accept all"), button:has-text("I agree")');
    if (await consent.first().isVisible().catch(() => false)) {
      await consent.first().click().catch(() => undefined);
    }

    const feed = page.locator('div[role="feed"]');
    await feed.waitFor({ timeout: 15_000 }).catch(() => undefined);

    const seen = new Set<string>();
    const places: GoogleMapsPlace[] = [];
    let idleScrolls = 0;

    while (places.length < input.limit && idleScrolls < 4) {
      if (signal.aborted) throw new Error('Canceled');

      const cards = page.locator('div[role="feed"] > div > div[jsaction]');
      const count = await cards.count();

      for (let i = 0; i < count && places.length < input.limit; i++) {
        const card = cards.nth(i);
        const link = card.locator('a.hfpxzc').first();
        const href = await link.getAttribute('href').catch(() => null);
        if (!href || seen.has(href)) continue;
        seen.add(href);

        const name = cleanText(await link.getAttribute('aria-label').catch(() => ''));
        if (!name) continue;

        const raw = cleanText(await card.innerText().catch(() => ''));
        const ratingMatch = raw.match(/(\d+(?:\.\d+)?)\s*\(([\d,]+)\)/);
        const rating = ratingMatch ? Number(ratingMatch[1]) : undefined;
        const reviews = ratingMatch ? Number(ratingMatch[2].replace(/,/g, '')) : undefined;

        // Info lines after the rating usually contain category · address, phone, etc.
        const lines = raw.split('\n').map(cleanText).filter(Boolean);
        const category = lines.find((l) => l.includes('·'))?.split('·')[0]?.trim();
        const address = lines.find((l) => l.includes('·'))?.split('·').slice(1).join('·').trim();
        const phone = lines.find((l) => /(\+?\d[\d\s().-]{6,})/.test(l));

        places.push({
          name,
          rating,
          reviews,
          category,
          address,
          phone,
          url: href,
        });

        onProgress({
          itemsCollected: places.length,
          progress: Math.min(1, places.length / input.limit),
        });
      }

      const before = places.length;
      await feed.evaluate((el) => el.scrollBy(0, el.scrollHeight)).catch(() => undefined);
      await page.waitForTimeout(1200);
      idleScrolls = places.length === before ? idleScrolls + 1 : 0;
    }

    return { places };
  },
};
