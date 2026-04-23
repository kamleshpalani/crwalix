import { z } from 'zod';
import type { Adapter } from '../types.js';
import { extractEmails, extractPhones, cleanText, unique } from '../utils/text.js';

const Input = z.object({
  url: z.string().url(),
  followContact: z.boolean().default(true),
  maxPages: z.number().int().positive().max(10).default(3),
});

export interface EnrichmentResult {
  url: string;
  title?: string;
  emails: string[];
  phones: string[];
  socialLinks: string[];
  pagesVisited: string[];
}

const SOCIAL_RE =
  /(facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|pinterest)\.com/i;

export const emailPhoneAdapter: Adapter<z.infer<typeof Input>, EnrichmentResult> = {
  name: 'email-phone',
  description: 'Crawl a website (and common contact pages) and extract emails, phones, and social links.',
  inputSchema: Input,

  async run(input, { page, logger, signal, onProgress }) {
    const base = new URL(input.url);
    const queue: string[] = [input.url];
    const visited = new Set<string>();
    const emails: string[] = [];
    const phones: string[] = [];
    const socials: string[] = [];
    let title: string | undefined;

    while (queue.length && visited.size < input.maxPages) {
      if (signal.aborted) throw new Error('Canceled');
      const next = queue.shift()!;
      if (visited.has(next)) continue;
      visited.add(next);

      logger.info({ url: next }, 'Visiting');
      try {
        await page.goto(next, { waitUntil: 'domcontentloaded' });
      } catch (err) {
        logger.warn({ err: String(err), url: next }, 'Navigation failed');
        continue;
      }

      if (!title) title = cleanText(await page.title().catch(() => ''));
      const body = await page.content().catch(() => '');
      const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');

      emails.push(...extractEmails(`${body} ${text}`));
      phones.push(...extractPhones(text));

      const hrefs = await page
        .$$eval('a[href]', (els) => els.map((e) => (e as HTMLAnchorElement).href))
        .catch(() => [] as string[]);

      for (const href of hrefs) {
        if (SOCIAL_RE.test(href)) socials.push(href);
        if (href.startsWith('mailto:')) emails.push(href.replace('mailto:', '').split('?')[0]);
        if (href.startsWith('tel:')) phones.push(href.replace('tel:', ''));
      }

      if (input.followContact && visited.size < input.maxPages) {
        for (const href of hrefs) {
          try {
            const u = new URL(href, next);
            if (u.hostname !== base.hostname) continue;
            if (/contact|about|impressum|kontakt/i.test(u.pathname) && !visited.has(u.href)) {
              queue.push(u.href);
            }
          } catch {
            /* ignore */
          }
        }
      }

      onProgress({
        itemsCollected: emails.length + phones.length,
        progress: visited.size / input.maxPages,
      });
    }

    return {
      url: input.url,
      title,
      emails: unique(emails),
      phones: unique(phones),
      socialLinks: unique(socials),
      pagesVisited: Array.from(visited),
    };
  },
};
