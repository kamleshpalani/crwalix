import { z } from 'zod';
import type { Adapter } from '../types.js';
import { cleanText } from '../utils/text.js';

const Input = z.object({
  username: z.string().min(1),
});

export interface InstagramProfile {
  username: string;
  fullName?: string;
  bio?: string;
  followers?: string;
  following?: string;
  posts?: string;
  profileUrl: string;
}

/**
 * Instagram requires login for most data. This adapter only scrapes the public
 * profile meta tags that Instagram exposes to logged-out users. Deeper scraping
 * would need session cookies and careful rate-limiting — intentionally out of
 * scope for the MVP.
 */
export const instagramAdapter: Adapter<z.infer<typeof Input>, InstagramProfile> = {
  name: 'instagram',
  description: 'Fetch public Instagram profile meta (username, bio, follower counts from og:description).',
  inputSchema: Input,

  async run(input, { page, signal, onProgress }) {
    if (signal.aborted) throw new Error('Canceled');
    const profileUrl = `https://www.instagram.com/${encodeURIComponent(input.username)}/`;
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });

    const ogDescription = await page
      .locator('meta[property="og:description"]')
      .getAttribute('content')
      .catch(() => null);
    const ogTitle = await page
      .locator('meta[property="og:title"]')
      .getAttribute('content')
      .catch(() => null);

    // Format example: "123 Followers, 45 Following, 67 Posts - See Instagram photos..."
    const match = ogDescription?.match(
      /([\d.,KMB]+)\s+Followers,\s+([\d.,KMB]+)\s+Following,\s+([\d.,KMB]+)\s+Posts/i
    );

    const bioMatch = ogDescription?.split(' - ').slice(1).join(' - ');

    onProgress({ itemsCollected: 1, progress: 1 });
    return {
      username: input.username,
      fullName: ogTitle ? cleanText(ogTitle.split('(')[0]) : undefined,
      bio: bioMatch ? cleanText(bioMatch) : undefined,
      followers: match?.[1],
      following: match?.[2],
      posts: match?.[3],
      profileUrl,
    };
  },
};
