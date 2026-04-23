import { z } from 'zod';
import type { Adapter } from '../types.js';
import { cleanText } from '../utils/text.js';

const Input = z.object({
  url: z.string().url(),
  selector: z.string().optional(),
  fields: z
    .record(z.string(), z.string())
    .optional()
    .describe('Map of { fieldName: cssSelector } evaluated relative to each matched item.'),
  waitFor: z.string().optional(),
});

export const genericAdapter: Adapter<z.infer<typeof Input>, { items: Record<string, string>[] }> = {
  name: 'generic',
  description:
    'Open any URL and extract structured data using CSS selectors. Useful as a building block.',
  inputSchema: Input,

  async run(input, { page, signal, onProgress }) {
    if (signal.aborted) throw new Error('Canceled');
    await page.goto(input.url, { waitUntil: 'domcontentloaded' });
    if (input.waitFor) {
      await page.waitForSelector(input.waitFor, { timeout: 15_000 }).catch(() => undefined);
    }

    if (!input.selector) {
      const title = cleanText(await page.title());
      const text = cleanText(await page.evaluate(() => document.body?.innerText ?? ''));
      return { items: [{ title, text: text.slice(0, 5_000) }] };
    }

    const fields = input.fields ?? { text: '' };
    const items = await page.$$eval(
      input.selector,
      (nodes, fieldsArg: Record<string, string>) => {
        return nodes.map((n) => {
          const out: Record<string, string> = {};
          for (const [key, sel] of Object.entries(fieldsArg)) {
            const target = sel ? (n.querySelector(sel) as HTMLElement | null) : (n as HTMLElement);
            out[key] = (target?.innerText ?? target?.textContent ?? '').trim();
          }
          return out;
        });
      },
      fields
    );

    onProgress({ itemsCollected: items.length, progress: 1 });
    return { items };
  },
};
