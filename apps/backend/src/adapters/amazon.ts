import { z } from 'zod';
import type { Adapter } from '../types.js';
import { cleanText } from '../utils/text.js';

const Input = z.object({
  query: z.string().min(1),
  domain: z.string().default('amazon.com'),
  limit: z.number().int().positive().max(100).default(20),
});

export interface AmazonProduct {
  asin?: string;
  title: string;
  url: string;
  price?: string;
  rating?: number;
  reviews?: number;
  image?: string;
}

export const amazonAdapter: Adapter<z.infer<typeof Input>, { products: AmazonProduct[] }> = {
  name: 'amazon',
  description: 'Search Amazon product listings. NOTE: Amazon often gates with CAPTCHAs; proxies recommended.',
  inputSchema: Input,

  async run(input, { page, signal, onProgress }) {
    if (signal.aborted) throw new Error('Canceled');
    const url = `https://www.${input.domain}/s?k=${encodeURIComponent(input.query)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('div[data-asin][data-component-type="s-search-result"]', { timeout: 15_000 }).catch(() => undefined);

    const products = await page.$$eval(
      'div[data-asin][data-component-type="s-search-result"]',
      (nodes) =>
        nodes.map((n) => {
          const asin = n.getAttribute('data-asin') ?? undefined;
          const link = n.querySelector('h2 a') as HTMLAnchorElement | null;
          const priceWhole = n.querySelector('.a-price .a-price-whole')?.textContent ?? '';
          const priceFrac = n.querySelector('.a-price .a-price-fraction')?.textContent ?? '';
          const ratingLabel = n.querySelector('i.a-icon-star-small span, i.a-icon-star span')?.textContent ?? '';
          const reviewsLabel = n.querySelector('span.a-size-base.s-underline-text, a span.a-size-base')?.textContent ?? '';
          const img = n.querySelector('img.s-image') as HTMLImageElement | null;
          return {
            asin,
            title: link?.textContent?.trim() ?? '',
            url: link?.href ?? '',
            price: priceWhole ? `${priceWhole}${priceFrac}` : undefined,
            rating: ratingLabel.match(/([\d.]+)/)?.[1],
            reviews: reviewsLabel.replace(/[^\d]/g, ''),
            image: img?.src,
          };
        })
    );

    const results: AmazonProduct[] = products
      .filter((p) => p.title && p.url)
      .slice(0, input.limit)
      .map((p) => ({
        asin: p.asin,
        title: cleanText(p.title),
        url: p.url,
        price: p.price ? cleanText(p.price) : undefined,
        rating: p.rating ? Number(p.rating) : undefined,
        reviews: p.reviews ? Number(p.reviews) : undefined,
        image: p.image,
      }));

    onProgress({ itemsCollected: results.length, progress: 1 });
    return { products: results };
  },
};
