import { z } from 'zod';
import type { Adapter } from '../types.js';
import { cleanText } from '../utils/text.js';

const Input = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).default(20),
  language: z.string().default('en'),
});

export interface SerpResult {
  title: string;
  url: string;
  snippet?: string;
  position: number;
}

export const googleSerpAdapter: Adapter<z.infer<typeof Input>, { results: SerpResult[] }> = {
  name: 'google-serp',
  description: 'Fetch Google organic search results (title, url, snippet).',
  inputSchema: Input,

  async run(input, { page, signal, onProgress }) {
    if (signal.aborted) throw new Error('Canceled');
    const url = `https://www.google.com/search?q=${encodeURIComponent(input.query)}&hl=${encodeURIComponent(
      input.language
    )}&num=${Math.min(input.limit, 30)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const consent = page.locator('button:has-text("Accept all"), button:has-text("I agree")');
    if (await consent.first().isVisible().catch(() => false)) {
      await consent.first().click().catch(() => undefined);
    }

    const results = await page.$$eval('div#search a h3', (nodes) =>
      nodes.map((h3, i) => {
        const a = h3.closest('a') as HTMLAnchorElement | null;
        const container = h3.closest('div.g, div[data-hveid]') as HTMLElement | null;
        const snippet =
          container?.querySelector('div[data-sncf], div.VwiC3b, span.aCOpRe')?.textContent ?? '';
        return {
          title: h3.textContent?.trim() ?? '',
          url: a?.href ?? '',
          snippet: snippet.trim(),
          position: i + 1,
        };
      })
    );

    const trimmed = results
      .filter((r) => r.url && r.title)
      .slice(0, input.limit)
      .map((r) => ({ ...r, title: cleanText(r.title), snippet: cleanText(r.snippet) }));

    onProgress({ itemsCollected: trimmed.length, progress: 1 });
    return { results: trimmed };
  },
};
